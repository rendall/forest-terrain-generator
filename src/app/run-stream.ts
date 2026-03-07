import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { FileIoError, InputValidationError } from "../domain/errors.js";
import { DIR8_CODE, DIR8_NONE } from "../domain/hydrology.js";
import { createGridShape } from "../domain/topography.js";
import type { JsonObject } from "../domain/types.js";
import { readTerrainEnvelopeFile } from "../io/read-envelope.js";
import { deriveHydrology } from "../pipeline/derive-hydrology.js";
import { STRUCTURE_DIR8_NEIGHBORS } from "../pipeline/derive-topographic-structure.js";

export interface StreamCliArgs {
	inputJsonPath?: string;
	x?: number;
	y?: number;
	maxSteps?: number;
	overflow?: boolean;
	waterLevel?: number;
	volume?: number;
	debug?: boolean;
}

export interface StreamRequest {
	args: StreamCliArgs;
	cwd: string;
}

export interface StreamOverlayRequest {
	inputJsonPath?: string;
	outputPpmPath?: string;
	force: boolean;
	streamPath: StreamStep[];
	additionalPathTileIds?: number[];
	overflowConnectorTileIds?: number[];
	overflowCrossingEdges?: OverflowCrossingEdge[];
	cwd: string;
}

interface BasinStopSummary {
	id: string | null;
	type: string | null;
	spillTileId: number | null;
	spillTile: [number, number] | null;
	reason: "sea_level" | "local_minimum" | "max_steps";
	stepsTaken: number;
}

type StreamStep = [number, number] | BasinStopSummary;

export interface StreamDebugNeighbor {
	x: number;
	y: number;
	h: number;
	excluded: boolean;
	isLower: boolean;
	isEligible: boolean;
	chosen: boolean;
}

export interface StreamDebugStep {
	step: number;
	current: [number, number, number];
	neighbors: StreamDebugNeighbor[];
	chosen: [number, number, number] | null;
	event: "move" | "stop_sea_level" | "stop_local_minimum" | "max_steps";
	basinId: string | null;
}

interface StreamTraceResult {
	path: StreamStep[];
	pathTileIds: number[];
	continuePathTileIds: number[];
	segments: StreamSegment[];
	routingExcludedTileIds: number[];
	overflowConnectorTileIds: number[];
	overflowCrossingEdges: OverflowCrossingEdge[];
	overflowEvents: OverflowEvent[];
	debugWarnings: string[];
	debugSteps: StreamDebugStep[];
}

interface OverflowCrossingEdge {
	fromTileId: number;
	toTileId: number;
}

interface DownhillSegment {
	kind: "downhill";
	startTileId: number;
	tileIds: number[];
	reason: BasinStopSummary["reason"];
	stepsTaken: number;
}

interface ConnectorSegment {
	kind: "connector";
	basinId: string;
	tileIds: number[];
}

interface CrossingSegment {
	kind: "crossing";
	basinId: string;
	fromTileId: number;
	toTileId: number;
}

type StreamSegment = DownhillSegment | ConnectorSegment | CrossingSegment;

type OverflowEvent =
	| {
			type: "overflow_connector";
			basinId: string;
			fromTileId: number;
			toTileId: number;
			maxHAlongPath: number;
	  }
	| {
			type: "overflow_crossing";
			basinId: string;
			fromTileId: number;
			toTileId: number;
	  }
	| {
			type: "overflow_to_parent";
			basinId: string;
			parentBasinId: string | null;
			atTileId: number;
	  }
	| {
			type: "overflow_no_spill_tile_in_basin";
			basinId: string | null;
			sinkTileId: number;
			spillTileId: number | null;
	  }
	| {
			type: "overflow_no_spill_edge";
			basinId: string | null;
			sinkTileId: number;
	  }
	| {
			type: "cycle_detected";
			basinId: string;
			atTileId: number;
	  };

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
		throw new InputValidationError(
			`Missing or invalid required integer --${name}.`,
		);
	}
	return value;
}

function assertOptionalNonNegativeInt(
	name: string,
	value: number | undefined,
): number | undefined {
	if (typeof value === "undefined") {
		return undefined;
	}
	if (!Number.isInteger(value) || value < 0) {
		throw new InputValidationError(
			`Missing or invalid required integer --${name}.`,
		);
	}
	return value;
}

function assertOptionalFiniteNumber(
	name: string,
	value: number | undefined,
): number | undefined {
	if (typeof value === "undefined") {
		return undefined;
	}
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new InputValidationError(`Missing or invalid numeric --${name}.`);
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

function clamp01(value: number): number {
	if (value <= 0) {
		return 0;
	}
	if (value >= 1) {
		return 1;
	}
	return value;
}

function messageFromUnknown(error: unknown): string {
	if (error instanceof Error && error.message.length > 0) {
		return error.message;
	}
	return "Unknown filesystem error.";
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function prepareOutputFile(path: string, force: boolean): Promise<void> {
	if (await pathExists(path)) {
		if (!force) {
			throw new InputValidationError(
				`Output file already exists: "${path}". Re-run with --force to overwrite.`,
			);
		}
	}
	await mkdir(dirname(path), { recursive: true });
}

function compareLexPath(a: number[], b: number[]): number {
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i += 1) {
		const av = a[i];
		const bv = b[i];
		if (av !== bv) {
			return (av ?? 0) - (bv ?? 0);
		}
	}
	return a.length - b.length;
}

function findOverflowConnectorPath(
	shape: { width: number; height: number },
	hByIndex: Float64Array,
	basinTileIds: number[],
	fromTileId: number,
	toTileId: number,
): number[] | null {
	if (fromTileId === toTileId) {
		return [fromTileId];
	}
	const basinSet = new Set<number>(basinTileIds);
	if (!basinSet.has(fromTileId) || !basinSet.has(toTileId)) {
		return null;
	}

	const size = hByIndex.length;
	const bestMax = new Float64Array(size).fill(Number.POSITIVE_INFINITY);
	const bestLen = new Int32Array(size).fill(Number.MAX_SAFE_INTEGER);
	const prev = new Int32Array(size).fill(-1);
	const open = new Set<number>();
	const pathCache = new Map<number, number[]>();

	const getPathTo = (node: number): number[] => {
		const cached = pathCache.get(node);
		if (cached) {
			return cached;
		}
		const out: number[] = [];
		let cursor = node;
		while (cursor >= 0) {
			out.push(cursor);
			cursor = prev[cursor] ?? -1;
		}
		out.reverse();
		pathCache.set(node, out);
		return out;
	};

	const invalidatePathCache = (node: number): void => {
		pathCache.delete(node);
	};

	bestMax[fromTileId] = hByIndex[fromTileId] ?? 0;
	bestLen[fromTileId] = 0;
	open.add(fromTileId);

	const neighborsOf = (index: number): number[] => {
		const x = index % shape.width;
		const y = Math.floor(index / shape.width);
		const out: number[] = [];
		for (const n of STRUCTURE_DIR8_NEIGHBORS) {
			const nx = x + n.dx;
			const ny = y + n.dy;
			if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
				continue;
			}
			const ni = ny * shape.width + nx;
			if (!basinSet.has(ni)) {
				continue;
			}
			out.push(ni);
		}
		out.sort((a, b) => a - b);
		return out;
	};

	const compareState = (a: number, b: number): number => {
		const maxCmp = bestMax[a] - bestMax[b];
		if (Math.abs(maxCmp) > 1e-12) {
			return maxCmp < 0 ? -1 : 1;
		}
		if (bestLen[a] !== bestLen[b]) {
			return bestLen[a] - bestLen[b];
		}
		const lexCmp = compareLexPath(getPathTo(a), getPathTo(b));
		if (lexCmp !== 0) {
			return lexCmp;
		}
		return a - b;
	};

	while (open.size > 0) {
		let bestNode = -1;
		for (const node of open) {
			if (bestNode < 0 || compareState(node, bestNode) < 0) {
				bestNode = node;
			}
		}
		if (bestNode < 0) {
			break;
		}
		open.delete(bestNode);
		if (bestNode === toTileId) {
			break;
		}

		for (const neighbor of neighborsOf(bestNode)) {
			const candMax = Math.max(bestMax[bestNode], hByIndex[neighbor] ?? 0);
			const candLen = bestLen[bestNode] + 1;

			let better = false;
			if (candMax + 1e-12 < bestMax[neighbor]) {
				better = true;
			} else if (Math.abs(candMax - bestMax[neighbor]) <= 1e-12) {
				if (candLen < bestLen[neighbor]) {
					better = true;
				} else if (candLen === bestLen[neighbor]) {
					const candidatePath = [...getPathTo(bestNode), neighbor];
					const existingPath =
						bestLen[neighbor] < Number.MAX_SAFE_INTEGER
							? getPathTo(neighbor)
							: [];
					if (
						existingPath.length === 0 ||
						compareLexPath(candidatePath, existingPath) < 0
					) {
						better = true;
					}
				}
			}

			if (!better) {
				continue;
			}

			bestMax[neighbor] = candMax;
			bestLen[neighbor] = candLen;
			prev[neighbor] = bestNode;
			invalidatePathCache(neighbor);
			open.add(neighbor);
		}
	}

	if (bestLen[toTileId] === Number.MAX_SAFE_INTEGER) {
		return null;
	}
	return getPathTo(toTileId);
}

export async function writeStreamOverlayPpm(
	request: StreamOverlayRequest,
): Promise<void> {
	const inputFilePath = resolveFromCwd(request.cwd, request.inputJsonPath);
	const outputFilePath = resolveFromCwd(request.cwd, request.outputPpmPath);
	if (!inputFilePath) {
		throw new InputValidationError("Missing required input: --input-json.");
	}
	if (!outputFilePath) {
		throw new InputValidationError("Missing required output: --output-ppm.");
	}

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

	const seen = new Uint8Array(expectedSize);
	const hByIndex = new Float64Array(expectedSize);
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
	}
	const streamIndices = new Set<number>();
	const maybeAddPoint = (x: number, y: number): void => {
		if (!Number.isInteger(x) || !Number.isInteger(y)) {
			return;
		}
		if (x < 0 || y < 0 || x >= width || y >= height) {
			return;
		}
		streamIndices.add(y * width + x);
	};
	for (const step of request.streamPath) {
		if (Array.isArray(step) && step.length === 2) {
			const [sx, sy] = step;
			maybeAddPoint(sx, sy);
		}
	}
	if (Array.isArray(request.additionalPathTileIds)) {
		for (const tileId of request.additionalPathTileIds) {
			if (
				typeof tileId !== "number" ||
				!Number.isInteger(tileId) ||
				tileId < 0 ||
				tileId >= expectedSize
			) {
				continue;
			}
			streamIndices.add(tileId);
		}
	}
	const overflowIndices = new Set<number>();
	if (Array.isArray(request.overflowConnectorTileIds)) {
		for (const tileId of request.overflowConnectorTileIds) {
			if (
				typeof tileId !== "number" ||
				!Number.isInteger(tileId) ||
				tileId < 0 ||
				tileId >= expectedSize
			) {
				continue;
			}
			overflowIndices.add(tileId);
		}
	}
	const toTilePair = (tileId: number): [number, number] => [
		tileId % width,
		Math.floor(tileId / width),
	];
	const rasterizeBresenham = (
		fromTileId: number,
		toTileId: number,
	): number[] => {
		if (
			fromTileId < 0 ||
			fromTileId >= expectedSize ||
			toTileId < 0 ||
			toTileId >= expectedSize
		) {
			return [];
		}
		const [x0Raw, y0Raw] = toTilePair(fromTileId);
		const [x1Raw, y1Raw] = toTilePair(toTileId);
		let x0 = x0Raw;
		let y0 = y0Raw;
		const x1 = x1Raw;
		const y1 = y1Raw;
		const dx = Math.abs(x1 - x0);
		const sx = x0 < x1 ? 1 : -1;
		const dy = -Math.abs(y1 - y0);
		const sy = y0 < y1 ? 1 : -1;
		let err = dx + dy;
		const out: number[] = [];
		while (true) {
			if (x0 >= 0 && y0 >= 0 && x0 < width && y0 < height) {
				out.push(y0 * width + x0);
			}
			if (x0 === x1 && y0 === y1) {
				break;
			}
			const e2 = 2 * err;
			if (e2 >= dy) {
				err += dy;
				x0 += sx;
			}
			if (e2 <= dx) {
				err += dx;
				y0 += sy;
			}
		}
		return out;
	};
	if (Array.isArray(request.overflowCrossingEdges)) {
		for (const edge of request.overflowCrossingEdges) {
			if (
				typeof edge?.fromTileId !== "number" ||
				!Number.isInteger(edge.fromTileId) ||
				typeof edge?.toTileId !== "number" ||
				!Number.isInteger(edge.toTileId)
			) {
				continue;
			}
			for (const tileId of rasterizeBresenham(edge.fromTileId, edge.toTileId)) {
				overflowIndices.add(tileId);
			}
		}
	}

	const pixels = new Uint8Array(expectedSize * 3);
	for (let i = 0; i < expectedSize; i += 1) {
		const value = Math.round(clamp01(hByIndex[i] ?? 0) * 255);
		const base = i * 3;
		pixels[base] = value;
		pixels[base + 1] = value;
		pixels[base + 2] = value;
	}
	for (const index of streamIndices) {
		const base = index * 3;
		pixels[base] = 0;
		pixels[base + 1] = 0;
		pixels[base + 2] = 255;
	}
	for (const index of overflowIndices) {
		const base = index * 3;
		pixels[base] = 255;
		pixels[base + 1] = 80;
		pixels[base + 2] = 0;
	}

	await prepareOutputFile(outputFilePath, request.force);
	const header = Buffer.from(`P6\n${width} ${height}\n255\n`, "ascii");
	const payload = Buffer.concat([header, Buffer.from(pixels)]);
	try {
		await writeFile(outputFilePath, payload);
	} catch (error) {
		throw new FileIoError(
			`I/O error during image output write at "${outputFilePath}": ${messageFromUnknown(error)}`,
		);
	}
}

export async function runStreamTrace(
	request: StreamRequest,
): Promise<StreamTraceResult> {
	const inputFilePath = resolveFromCwd(request.cwd, request.args.inputJsonPath);
	if (!inputFilePath) {
		throw new InputValidationError("Missing required input: --input-json.");
	}
	const x = assertInt("x", request.args.x);
	const y = assertInt("y", request.args.y);
	const requestedMaxSteps = assertOptionalNonNegativeInt(
		"max-steps",
		request.args.maxSteps,
	);
	const requestedWaterLevel = assertOptionalFiniteNumber(
		"water-level",
		request.args.waterLevel,
	);
	const requestedVolume = assertOptionalFiniteNumber(
		"volume",
		request.args.volume,
	);

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
	const basinIdByIndex = new Array<string>(expectedSize).fill("");
	const tileFeatureIdsByIndex = Array.from(
		{ length: expectedSize },
		() => [] as string[],
	);
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
			? tile.featureIds.filter(
					(value): value is string => typeof value === "string",
				)
			: [];
		tileFeatureIdsByIndex[index] = featureIds;
		basinIdByIndex[index] = featureIds.find((id) => id.startsWith("b_")) ?? "";
	}

	const basinNodeById = new Map<string, JsonObject>();
	const basinOwnTileIdsById = new Map<string, number[]>();
	const basins = envelope.features?.basins;
	if (Array.isArray(basins)) {
		for (const basin of basins) {
			if (!isJsonObject(basin) || typeof basin.id !== "string") {
				continue;
			}
			basinNodeById.set(basin.id, basin);
			if (Array.isArray(basin.tileIds)) {
				basinOwnTileIdsById.set(
					basin.id,
					basin.tileIds.filter(
						(value): value is number =>
							typeof value === "number" &&
							Number.isInteger(value) &&
							value >= 0 &&
							value < expectedSize,
					),
				);
			}
		}
	}
	const basinTileIdsById = new Map<string, number[]>();
	const basinTileIdsCache = new Map<string, number[]>();
	const resolveBasinTileIds = (
		basinId: string,
		visiting: Set<string>,
	): number[] => {
		const cached = basinTileIdsCache.get(basinId);
		if (cached) {
			return cached;
		}
		if (visiting.has(basinId)) {
			const ownOnly = [...(basinOwnTileIdsById.get(basinId) ?? [])].sort(
				(a, b) => a - b,
			);
			basinTileIdsCache.set(basinId, ownOnly);
			return ownOnly;
		}
		visiting.add(basinId);
		const basinNode = basinNodeById.get(basinId);
		const tileSet = new Set<number>(basinOwnTileIdsById.get(basinId) ?? []);
		const childIds = Array.isArray(basinNode?.childIds)
			? basinNode.childIds.filter(
					(value): value is string => typeof value === "string",
				)
			: [];
		for (const childId of childIds) {
			for (const tileId of resolveBasinTileIds(childId, visiting)) {
				tileSet.add(tileId);
			}
		}
		visiting.delete(basinId);
		const resolved = Array.from(tileSet).sort((a, b) => a - b);
		basinTileIdsCache.set(basinId, resolved);
		return resolved;
	};
	for (const basinId of basinNodeById.keys()) {
		basinTileIdsById.set(
			basinId,
			resolveBasinTileIds(basinId, new Set<string>()),
		);
	}
	const shape = createGridShape(width, height);
	const topographyH = new Float32Array(expectedSize);
	for (let i = 0; i < expectedSize; i += 1) {
		topographyH[i] = hByIndex[i] ?? 0;
	}
	// Base stream tracing is always strict-local; overflow continuation is a separate pass.
	const sinkMode = "strict_local";
	const hydrology = deriveHydrology(
		shape,
		topographyH,
		{
			basinFeatures: envelope.features?.basins ?? [],
			tileFeatureIds: tileFeatureIdsByIndex,
		},
		{ hydrology: { sinkMode } },
	);
	const flowToByIndex = new Int32Array(expectedSize).fill(-1);
	for (let index = 0; index < expectedSize; index += 1) {
		const fd = hydrology.maps.fd[index] ?? DIR8_NONE;
		let dx = 0;
		let dy = 0;
		switch (fd) {
			case DIR8_CODE.e:
				dx = 1;
				break;
			case DIR8_CODE.se:
				dx = 1;
				dy = 1;
				break;
			case DIR8_CODE.s:
				dy = 1;
				break;
			case DIR8_CODE.sw:
				dx = -1;
				dy = 1;
				break;
			case DIR8_CODE.w:
				dx = -1;
				break;
			case DIR8_CODE.nw:
				dx = -1;
				dy = -1;
				break;
			case DIR8_CODE.n:
				dy = -1;
				break;
			case DIR8_CODE.ne:
				dx = 1;
				dy = -1;
				break;
			default:
				continue;
		}
		const x0 = index % width;
		const y0 = Math.floor(index / width);
		const nx = x0 + dx;
		const ny = y0 + dy;
		if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
			continue;
		}
		flowToByIndex[index] = ny * width + nx;
	}
	const asPair = (index: number): [number, number] => {
		const tx = index % width;
		const ty = Math.floor(index / width);
		return [tx, ty];
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

	const chooseLowestDownhillNeighbor = (
		index: number,
		excluded: ReadonlySet<number>,
		blockedBasinIds: ReadonlySet<string>,
	): number | null => {
		const next = flowToByIndex[index] ?? -1;
		if (next < 0 || next >= expectedSize) {
			return null;
		}
		if (excluded.has(next)) {
			return null;
		}
		const neighborBasinId = basinIdByIndex[next] || "";
		if (neighborBasinId.length > 0 && blockedBasinIds.has(neighborBasinId)) {
			return null;
		}
		return next;
	};
	const debugEnabled = request.args.debug === true;
	const debugSteps: StreamDebugStep[] = [];
	const neighborDebugFor = (
		index: number,
		excluded: ReadonlySet<number>,
		chosenIndex: number | null,
	): StreamDebugNeighbor[] => {
		const neighbors = neighborsOf(index);
		return neighbors.map((n) => {
			const nx = n % width;
			const ny = Math.floor(n / width);
			const nH = hByIndex[n];
			const excludedFlag = excluded.has(n);
			return {
				x: nx,
				y: ny,
				h: nH,
				excluded: excludedFlag,
				isLower: nH < hByIndex[index],
				isEligible: !excludedFlag,
				chosen: chosenIndex === n,
			};
		});
	};
	const pushDebugStep = (
		event: StreamDebugStep["event"],
		currentIndex: number,
		chosenIndex: number | null,
		basinId: string | null,
		excluded: ReadonlySet<number>,
	): void => {
		if (!debugEnabled) {
			return;
		}
		const cx = currentIndex % width;
		const cy = Math.floor(currentIndex / width);
		debugSteps.push({
			step: debugSteps.length,
			current: [cx, cy, hByIndex[currentIndex]],
			neighbors: neighborDebugFor(currentIndex, excluded, chosenIndex),
			chosen:
				chosenIndex === null
					? null
					: [
							chosenIndex % width,
							Math.floor(chosenIndex / width),
							hByIndex[chosenIndex],
						],
			event,
			basinId,
		});
	};
	const traceDownhillSegment = (
		startIndex: number,
		initialExcluded: ReadonlySet<number>,
		captureDebug: boolean,
		blockedBasinIds: ReadonlySet<string> = new Set<string>(),
	): {
		tileIds: number[];
		endIndex: number;
		reason: BasinStopSummary["reason"];
		stepsTaken: number;
		excluded: Set<number>;
	} => {
		const excluded = new Set<number>(initialExcluded);
		let current = startIndex;
		const tileIds: number[] = [current];
		excluded.add(current);
		let stepsTaken = 1;
		while (true) {
			if (stepsTaken >= maxSteps) {
				if (captureDebug) {
					pushDebugStep(
						"max_steps",
						current,
						null,
						basinIdByIndex[current] || null,
						excluded,
					);
				}
				return {
					tileIds,
					endIndex: current,
					reason: "max_steps",
					stepsTaken,
					excluded,
				};
			}
			if (hByIndex[current] <= 0) {
				if (captureDebug) {
					pushDebugStep(
						"stop_sea_level",
						current,
						null,
						basinIdByIndex[current] || null,
						excluded,
					);
				}
				return {
					tileIds,
					endIndex: current,
					reason: "sea_level",
					stepsTaken,
					excluded,
				};
			}
			const next = chooseLowestDownhillNeighbor(
				current,
				excluded,
				blockedBasinIds,
			);
			if (next === null || next === current) {
				if (captureDebug) {
					pushDebugStep(
						"stop_local_minimum",
						current,
						null,
						basinIdByIndex[current] || null,
						excluded,
					);
				}
				return {
					tileIds,
					endIndex: current,
					reason: "local_minimum",
					stepsTaken,
					excluded,
				};
			}
			if (captureDebug) {
				pushDebugStep(
					"move",
					current,
					next,
					basinIdByIndex[current] || null,
					excluded,
				);
			}
			current = next;
			tileIds.push(current);
			excluded.add(current);
			stepsTaken += 1;
		}
	};

	const originIndex = y * width + x;
	const maxSteps = requestedMaxSteps ?? expectedSize * 2;
	const firstTrace = traceDownhillSegment(originIndex, new Set<number>(), true);
	const current = firstTrace.endIndex;
	const terminationReason: BasinStopSummary["reason"] = firstTrace.reason;
	const routingExcludedTileIndices = firstTrace.excluded;
	const pathTileIds = new Set<number>(firstTrace.tileIds);
	const continuePathTileIds: number[] = [];
	const segments: StreamSegment[] = [
		{
			kind: "downhill",
			startTileId: originIndex,
			tileIds: [...firstTrace.tileIds],
			reason: firstTrace.reason,
			stepsTaken: firstTrace.stepsTaken,
		},
	];

	const path: StreamStep[] = firstTrace.tileIds.map((tileId) => asPair(tileId));
	const coordinateStepCount = firstTrace.stepsTaken;

	const overflowConnectorTileIds: number[] = [];
	const overflowCrossingEdges: OverflowCrossingEdge[] = [];
	const overflowEvents: OverflowEvent[] = [];
	const debugWarnings: string[] = [];
	const overflowEnabled = request.args.overflow === true;
	if (overflowEnabled) {
		if (typeof requestedWaterLevel === "number") {
			debugWarnings.push(
				`--water-level=${requestedWaterLevel} is currently accepted but ignored in overflow v0.`,
			);
		}
		if (typeof requestedVolume === "number") {
			debugWarnings.push(
				`--volume=${requestedVolume} is currently accepted but ignored in overflow v0.`,
			);
		}
		const maxOverflowHops = expectedSize;
		let overflowHops = 0;
		let continuationTrace: {
			endIndex: number;
			reason: BasinStopSummary["reason"];
		} | null = { endIndex: current, reason: terminationReason };
		const seenBasinIds = new Set<string>();

		while (
			continuationTrace !== null &&
			continuationTrace.reason === "local_minimum" &&
			overflowHops < maxOverflowHops
		) {
			const sinkTileId = continuationTrace.endIndex;
			const basinId = basinIdByIndex[sinkTileId] || null;
			if (basinId && seenBasinIds.has(basinId)) {
				overflowEvents.push({
					type: "cycle_detected",
					basinId,
					atTileId: sinkTileId,
				});
				break;
			}
			if (basinId) {
				seenBasinIds.add(basinId);
			}
			const basinNode = basinId ? basinNodeById.get(basinId) : undefined;
			const childSpillFromTileId =
				basinNode && Number.isInteger(basinNode.childSpillFromTileId)
					? (basinNode.childSpillFromTileId as number)
					: null;
			const parentContactTileId =
				basinNode && Number.isInteger(basinNode.parentContactTileId)
					? (basinNode.parentContactTileId as number)
					: null;

			if (!basinId || !basinNode || childSpillFromTileId === null) {
				overflowEvents.push({
					type: "overflow_no_spill_edge",
					basinId,
					sinkTileId,
				});
				break;
			}

			const basinTileIds = basinTileIdsById.get(basinId) ?? [];
			const basinSet = new Set<number>(basinTileIds);
			const sinkInBasin = basinSet.has(sinkTileId);
			const childSpillInBasin = basinSet.has(childSpillFromTileId);
			if (!sinkInBasin || !childSpillInBasin) {
				overflowEvents.push({
					type: "overflow_no_spill_tile_in_basin",
					basinId,
					sinkTileId,
					spillTileId: childSpillFromTileId,
				});
				break;
			}

			const connector = findOverflowConnectorPath(
				{ width, height },
				hByIndex,
				basinTileIds,
				sinkTileId,
				childSpillFromTileId,
			);
			if (!connector || connector.length === 0) {
				overflowEvents.push({
					type: "overflow_no_spill_edge",
					basinId,
					sinkTileId,
				});
				break;
			}

			for (const tileId of connector) {
				overflowConnectorTileIds.push(tileId);
			}
			segments.push({
				kind: "connector",
				basinId,
				tileIds: [...connector],
			});
			let maxHAlongPath = Number.NEGATIVE_INFINITY;
			for (const tileId of connector) {
				maxHAlongPath = Math.max(maxHAlongPath, hByIndex[tileId] ?? 0);
			}
			overflowEvents.push({
				type: "overflow_connector",
				basinId,
				fromTileId: sinkTileId,
				toTileId: childSpillFromTileId,
				maxHAlongPath,
			});

			const crossingToTileId =
				typeof parentContactTileId === "number"
					? parentContactTileId
					: childSpillFromTileId;
			overflowCrossingEdges.push({
				fromTileId: childSpillFromTileId,
				toTileId: crossingToTileId,
			});
			segments.push({
				kind: "crossing",
				basinId,
				fromTileId: childSpillFromTileId,
				toTileId: crossingToTileId,
			});
			overflowEvents.push({
				type: "overflow_crossing",
				basinId,
				fromTileId: childSpillFromTileId,
				toTileId: crossingToTileId,
			});
			const parentBasinId =
				typeof basinNode.parentId === "string" ? basinNode.parentId : null;
			overflowEvents.push({
				type: "overflow_to_parent",
				basinId,
				parentBasinId,
				atTileId: crossingToTileId,
			});

			const nextDownhillTrace = traceDownhillSegment(
				crossingToTileId,
				new Set<number>(connector),
				false,
				seenBasinIds,
			);
			segments.push({
				kind: "downhill",
				startTileId: crossingToTileId,
				tileIds: [...nextDownhillTrace.tileIds],
				reason: nextDownhillTrace.reason,
				stepsTaken: nextDownhillTrace.stepsTaken,
			});
			for (const tileId of nextDownhillTrace.tileIds) {
				pathTileIds.add(tileId);
				continuePathTileIds.push(tileId);
			}

			continuationTrace = {
				endIndex: nextDownhillTrace.endIndex,
				reason: nextDownhillTrace.reason,
			};
			if (continuationTrace.reason !== "local_minimum") {
				break;
			}
			overflowHops += 1;
		}
	}

	const stoppedBasinId = basinIdByIndex[current] || null;
	const stoppedBasinNode = stoppedBasinId
		? basinNodeById.get(stoppedBasinId)
		: undefined;
	const basinType =
		stoppedBasinNode && typeof stoppedBasinNode.kind === "string"
			? stoppedBasinNode.kind
			: null;
	const spillTileId =
		stoppedBasinNode && Number.isInteger(stoppedBasinNode.spillOutTileId)
			? (stoppedBasinNode.spillOutTileId as number)
			: null;
	const spillTile =
		spillTileId !== null && spillTileId >= 0 && spillTileId < expectedSize
			? asPair(spillTileId)
			: null;
	path.push({
		id: stoppedBasinId,
		type: basinType,
		spillTileId,
		spillTile,
		reason: terminationReason,
		stepsTaken: coordinateStepCount,
	});

	return {
		path,
		pathTileIds: Array.from(pathTileIds).sort((a, b) => a - b),
		continuePathTileIds,
		segments,
		routingExcludedTileIds: Array.from(routingExcludedTileIndices).sort(
			(a, b) => a - b,
		),
		overflowConnectorTileIds,
		overflowCrossingEdges,
		overflowEvents,
		debugWarnings,
		debugSteps,
	};
}

export async function runStream(request: StreamRequest): Promise<StreamStep[]> {
	const result = await runStreamTrace(request);
	return result.path;
}
