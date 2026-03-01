import { isAbsolute, resolve } from "node:path";
import { InputValidationError } from "../domain/errors.js";
import type { JsonObject } from "../domain/types.js";
import { readTerrainEnvelopeFile } from "../io/read-envelope.js";
import { STRUCTURE_DIR8_NEIGHBORS } from "../pipeline/derive-topographic-structure.js";

export interface StreamCliArgs {
	inputJsonPath?: string;
	x?: number;
	y?: number;
}

export interface StreamRequest {
	args: StreamCliArgs;
	cwd: string;
}

type StreamStep = [number, number, number] | string;

function resolveFromCwd(
	cwd: string,
	maybeRelativePath: string | undefined,
): string | undefined {
	if (!maybeRelativePath) {
		return undefined;
	}
	return isAbsolute(maybeRelativePath)
		? maybeRelativePath
		: resolve(cwd, maybeRelativePath);
}

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertInt(name: string, value: number | undefined): number {
	if (typeof value !== "number" || !Number.isInteger(value)) {
		throw new InputValidationError(`Missing or invalid required integer --${name}.`);
	}
	return value;
}

function assertInRange(
	name: string,
	value: number,
	minInclusive: number,
	maxInclusive: number,
): void {
	if (value < minInclusive || value > maxInclusive) {
		throw new InputValidationError(
			`Coordinate --${name}=${value} is out of bounds. Expected in [${minInclusive}, ${maxInclusive}].`,
		);
	}
}

export async function runStream(
	request: StreamRequest,
): Promise<StreamStep[]> {
	const inputFilePath = resolveFromCwd(request.cwd, request.args.inputJsonPath);
	if (!inputFilePath) {
		throw new InputValidationError("Missing required input: --input-json.");
	}
	const x = assertInt("x", request.args.x);
	const y = assertInt("y", request.args.y);

	const envelope = await readTerrainEnvelopeFile(inputFilePath);
	if (envelope.tiles.length === 0) {
		throw new InputValidationError(
			`Input terrain file "${inputFilePath}" has no tiles.`,
		);
	}

	let maxX = -1;
	let maxY = -1;
	for (const tile of envelope.tiles) {
		if (
			typeof tile.x !== "number" ||
			!Number.isInteger(tile.x) ||
			tile.x < 0 ||
			typeof tile.y !== "number" ||
			!Number.isInteger(tile.y) ||
			tile.y < 0
		) {
			throw new InputValidationError(
				`Input terrain file "${inputFilePath}" contains invalid tile coordinates.`,
			);
		}
		maxX = Math.max(maxX, tile.x);
		maxY = Math.max(maxY, tile.y);
	}

	const width = maxX + 1;
	const height = maxY + 1;
	const expectedSize = width * height;
	if (expectedSize !== envelope.tiles.length) {
		throw new InputValidationError(
			`Input terrain file "${inputFilePath}" is not a dense ${width}x${height} grid (tileCount=${envelope.tiles.length}).`,
		);
	}

	assertInRange("x", x, 0, width - 1);
	assertInRange("y", y, 0, height - 1);

	const seen = new Uint8Array(expectedSize);
	const hByIndex = new Float64Array(expectedSize);
	const basinByIndex = new Array<string>(expectedSize).fill("");
	for (const tile of envelope.tiles) {
		const index = tile.y * width + tile.x;
		if (seen[index] === 1) {
			throw new InputValidationError(
				`Input terrain file "${inputFilePath}" has duplicate tile coordinates at (${tile.x},${tile.y}).`,
			);
		}
		seen[index] = 1;
		const topography = isJsonObject(tile.topography) ? tile.topography : null;
		if (!topography) {
			throw new InputValidationError(
				`Tile (${tile.x},${tile.y}) is missing required object "topography".`,
			);
		}
		const h = topography.h;
		if (typeof h !== "number" || !Number.isFinite(h)) {
			throw new InputValidationError(
				`Tile (${tile.x},${tile.y}) is missing finite topography.h.`,
			);
		}
		hByIndex[index] = h;
		const featureIds = Array.isArray(tile.featureIds)
			? tile.featureIds.filter((value): value is string => typeof value === "string")
			: [];
		const basinId = featureIds.find((id) => id.startsWith("b_")) ?? "";
		basinByIndex[index] = basinId;
	}

	const basinTileSetById = new Map<string, Set<number>>();
	const basins = Array.isArray(envelope.features?.basins)
		? envelope.features?.basins ?? []
		: [];
	for (const basin of basins) {
		if (!isJsonObject(basin) || typeof basin.id !== "string") {
			continue;
		}
		const tileIds = Array.isArray(basin.tileIds)
			? basin.tileIds.filter(
					(value): value is number =>
						typeof value === "number" &&
						Number.isInteger(value) &&
						value >= 0 &&
						value < expectedSize,
			  )
			: [];
		if (tileIds.length === 0) {
			continue;
		}
		basinTileSetById.set(basin.id, new Set(tileIds));
	}

	const isEdge = (index: number): boolean => {
		const tx = index % width;
		const ty = Math.floor(index / width);
		return tx === 0 || ty === 0 || tx === width - 1 || ty === height - 1;
	};
	const asTriplet = (index: number): [number, number, number] => {
		const tx = index % width;
		const ty = Math.floor(index / width);
		return [tx, ty, hByIndex[index]];
	};
	const neighborsOf = (index: number): number[] => {
		const tx = index % width;
		const ty = Math.floor(index / width);
		const out: number[] = [];
		for (const neighbor of STRUCTURE_DIR8_NEIGHBORS) {
			const nx = tx + neighbor.dx;
			const ny = ty + neighbor.dy;
			if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
				continue;
			}
			out.push(ny * width + nx);
		}
		return out;
	};

	interface SpillResolution {
		insideIndex: number;
		outsideIndex: number;
	}

	const resolveSpill = (basinId: string): SpillResolution | null => {
		const basinTiles = basinTileSetById.get(basinId);
		if (!basinTiles || basinTiles.size === 0) {
			return null;
		}

		const candidates: Array<{ saddleH: number; inside: number; outside: number }> = [];
		for (const inside of basinTiles) {
			for (const outside of neighborsOf(inside)) {
				if (basinTiles.has(outside)) {
					continue;
				}
				const saddleH = Math.max(hByIndex[inside], hByIndex[outside]);
				candidates.push({ saddleH, inside, outside });
			}
		}
		if (candidates.length === 0) {
			return null;
		}
		candidates.sort((a, b) => {
			if (a.saddleH !== b.saddleH) {
				return a.saddleH - b.saddleH;
			}
			if (a.inside !== b.inside) {
				return a.inside - b.inside;
			}
			return a.outside - b.outside;
		});

		const best = candidates[0]!;
		const eps = 1e-12;
		const equallyLow = candidates.filter(
			(candidate) => Math.abs(candidate.saddleH - best.saddleH) <= eps,
		);
		if (equallyLow.length > 1) {
			return null;
		}
		return { insideIndex: best.inside, outsideIndex: best.outside };
	};

	const chooseLowestNeighbor = (
		index: number,
		handledBasins: Set<string>,
	): number | null => {
		const neighbors = neighborsOf(index);
		if (neighbors.length === 0) {
			return null;
		}
		const eligible = neighbors.filter((n) => {
			const basinId = basinByIndex[n];
			return !basinId || !handledBasins.has(basinId);
		});
		if (eligible.length === 0) {
			return null;
		}
		let best = eligible[0]!;
		for (const n of eligible.slice(1)) {
			if (hByIndex[n] < hByIndex[best]) {
				best = n;
			}
		}
		return best;
	};

	const path: StreamStep[] = [];
	const originIndex = y * width + x;
	let current = originIndex;
	path.push(asTriplet(current));
	const handledBasins = new Set<string>();
	const maxSteps = expectedSize * 8;
	for (let step = 0; step < maxSteps; step += 1) {
		const basinId = basinByIndex[current];
		if (basinId && !handledBasins.has(basinId)) {
			path.push(basinId);
			const spill = resolveSpill(basinId);
			if (!spill) {
				break;
			}
			if (spill.insideIndex !== current) {
				path.push(asTriplet(spill.insideIndex));
			}
			current = spill.outsideIndex;
			path.push(asTriplet(current));
			handledBasins.add(basinId);
			continue;
		}

		if (hByIndex[current] <= 0 || isEdge(current)) {
			break;
		}

		const next = chooseLowestNeighbor(current, handledBasins);
		if (next === null || next === current) {
			break;
		}
		current = next;
		path.push(asTriplet(current));
	}

	return path;
}
