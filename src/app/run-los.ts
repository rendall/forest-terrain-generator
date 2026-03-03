import { isAbsolute, resolve } from "node:path";
import { InputValidationError } from "../domain/errors.js";
import type { JsonObject } from "../domain/types.js";
import { readTerrainEnvelopeFile } from "../io/read-envelope.js";

export interface LosCliArgs {
	inputJsonPath?: string;
	x0?: number;
	y0?: number;
	x1?: number;
	y1?: number;
	debug?: boolean;
}

export interface LosRequest {
	args: LosCliArgs;
	cwd: string;
}

export interface LosDebugInfo {
	start: { x: number; y: number; h: number };
	end: { x: number; y: number; h: number };
	lineEquation: string;
	path: Array<[number, number, number]>;
}

export interface LosResult {
	visible: boolean;
	debug?: LosDebugInfo;
}

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

function bresenhamLine(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
): Array<{ x: number; y: number }> {
	const points: Array<{ x: number; y: number }> = [];
	let x = x0;
	let y = y0;
	const dx = Math.abs(x1 - x0);
	const dy = Math.abs(y1 - y0);
	const sx = x0 < x1 ? 1 : -1;
	const sy = y0 < y1 ? 1 : -1;
	let err = dx - dy;

	while (true) {
		points.push({ x, y });
		if (x === x1 && y === y1) {
			break;
		}
		const e2 = err * 2;
		if (e2 > -dy) {
			err -= dy;
			x += sx;
		}
		if (e2 < dx) {
			err += dx;
			y += sy;
		}
	}

	return points;
}

export async function runLos(request: LosRequest): Promise<LosResult> {
	const inputFilePath = resolveFromCwd(request.cwd, request.args.inputJsonPath);
	if (!inputFilePath) {
		throw new InputValidationError("Missing required input: --input-json.");
	}
	const x0 = assertInt("x0", request.args.x0);
	const y0 = assertInt("y0", request.args.y0);
	const x1 = assertInt("x1", request.args.x1);
	const y1 = assertInt("y1", request.args.y1);

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

	assertInRange("x0", x0, 0, width - 1);
	assertInRange("y0", y0, 0, height - 1);
	assertInRange("x1", x1, 0, width - 1);
	assertInRange("y1", y1, 0, height - 1);

	const h = new Float64Array(expectedSize);
	const seen = new Uint8Array(expectedSize);
	for (const tile of envelope.tiles) {
		const tx = tile.x;
		const ty = tile.y;
		if (
			typeof tx !== "number" ||
			typeof ty !== "number" ||
			!Number.isInteger(tx) ||
			!Number.isInteger(ty) ||
			tx < 0 ||
			ty < 0 ||
			tx >= width ||
			ty >= height
		) {
			throw new InputValidationError(
				`Input terrain file "${inputFilePath}" contains invalid tile coordinates at (${String(tile.x)},${String(tile.y)}).`,
			);
		}
		const index = ty * width + tx;
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
		const hh = topography.h;
		if (typeof hh !== "number" || !Number.isFinite(hh)) {
			throw new InputValidationError(
				`Tile (${tile.x},${tile.y}) is missing finite topography.h.`,
			);
		}
		h[index] = hh;
	}

	const sourceIndex = y0 * width + x0;
	const targetIndex = y1 * width + x1;
	const h0 = h[sourceIndex];
	const h1 = h[targetIndex];

	if (x0 === x1 && y0 === y1) {
		const lineEquation = `x(t)=${x0}+t*0, y(t)=${y0}+t*0, h(t)=${h0}+t*0, t in [0,1]`;
		const path: Array<[number, number, number]> = [[x0, y0, h0]];
		return {
			visible: true,
			...(request.args.debug === true
				? {
						debug: {
							start: { x: x0, y: y0, h: h0 },
							end: { x: x1, y: y1, h: h1 },
							lineEquation,
							path,
						},
					}
				: {}),
		};
	}
	const lineEquation = `x(t)=${x0}+t*${x1 - x0}, y(t)=${y0}+t*${y1 - y0}, h(t)=${h0}+t*${h1 - h0}, t in [0,1]`;
	const targetDistance = Math.hypot(x1 - x0, y1 - y0);
	const targetSlope = (h1 - h0) / targetDistance;
	const eps = 1e-12;

	const line = bresenhamLine(x0, y0, x1, y1);
	const path: Array<[number, number, number]> = line.map((p) => {
		const idx = p.y * width + p.x;
		return [p.x, p.y, h[idx]];
	});
	for (let i = 1; i < line.length - 1; i += 1) {
		const p = line[i]!;
		const distance = Math.hypot(p.x - x0, p.y - y0);
		if (distance <= 0) {
			continue;
		}
		const index = p.y * width + p.x;
		const slope = (h[index] - h0) / distance;
		if (slope >= targetSlope - eps) {
			return {
				visible: false,
				...(request.args.debug === true
					? {
							debug: {
								start: { x: x0, y: y0, h: h0 },
								end: { x: x1, y: y1, h: h1 },
								lineEquation,
								path,
							},
						}
					: {}),
			};
		}
	}

	return {
		visible: true,
		...(request.args.debug === true
			? {
					debug: {
						start: { x: x0, y: y0, h: h0 },
						end: { x: x1, y: y1, h: h1 },
						lineEquation,
						path,
					},
				}
			: {}),
	};
}
