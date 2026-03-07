import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { FileIoError, InputValidationError } from "../domain/errors.js";
import type { JsonObject } from "../domain/types.js";
import { readTerrainEnvelopeFile } from "../io/read-envelope.js";

export interface SeeCliArgs {
	inputFilePath?: string;
	outputFile?: string;
	layer: "h" | "r" | "v" | "landforms" | "landscape";
	force: boolean;
}

export interface SeeRequest {
	args: SeeCliArgs;
	cwd: string;
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

function assertLayer(
	layer: string,
): asserts layer is "h" | "r" | "v" | "landforms" | "landscape" {
	if (
		layer !== "h" &&
		layer !== "r" &&
		layer !== "v" &&
		layer !== "landforms" &&
		layer !== "landscape"
	) {
		throw new InputValidationError(
			`Invalid --layer value "${layer}". Expected one of: h, r, v, landforms, landscape.`,
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

export async function runSee(request: SeeRequest): Promise<void> {
	const inputFilePath = resolveFromCwd(request.cwd, request.args.inputFilePath);
	const outputFile = resolveFromCwd(request.cwd, request.args.outputFile);

	if (!inputFilePath) {
		throw new InputValidationError("Missing required input: --input-file.");
	}
	if (!outputFile) {
		throw new InputValidationError("Missing required output: --output-file.");
	}

	assertLayer(request.args.layer);
	const layer = request.args.layer === "landscape" ? "landforms" : request.args.layer;

	const envelope = await readTerrainEnvelopeFile(inputFilePath);
	if (envelope.tiles.length === 0) {
		throw new InputValidationError(
			`Input terrain file "${inputFilePath}" has no tiles.`,
		);
	}

	let maxX = -1;
	let maxY = -1;
	for (const tile of envelope.tiles) {
		const x = tile.x;
		const y = tile.y;
		if (
			typeof x !== "number" ||
			!Number.isInteger(x) ||
			x < 0 ||
			typeof y !== "number" ||
			!Number.isInteger(y) ||
			y < 0
		) {
			throw new InputValidationError(
				`Input terrain file "${inputFilePath}" contains invalid tile coordinates.`,
			);
		}
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
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
	const pixels = new Uint8Array(expectedSize);
	for (const tile of envelope.tiles) {
		const x = tile.x;
		const y = tile.y;
		if (
			typeof x !== "number" ||
			!Number.isInteger(x) ||
			x < 0 ||
			typeof y !== "number" ||
			!Number.isInteger(y) ||
			y < 0
		) {
			throw new InputValidationError(
				`Input terrain file "${inputFilePath}" contains invalid tile coordinates.`,
			);
		}

		const index = y * width + x;
		if (seen[index] === 1) {
			throw new InputValidationError(
				`Input terrain file "${inputFilePath}" has duplicate tile coordinates at (${x},${y}).`,
			);
		}
		seen[index] = 1;

		const topography = isJsonObject(tile.topography) ? tile.topography : null;
		if (!topography) {
			throw new InputValidationError(
				`Tile (${x},${y}) is missing required object "topography".`,
			);
		}

		if (layer === "landforms") {
			const structure = isJsonObject(topography.structure)
				? topography.structure
				: null;
			if (!structure) {
				throw new InputValidationError(
					`Tile (${x},${y}) is missing required object "topography.structure" for --layer landforms.`,
				);
			}
			const basinLike = structure.basinLike === true;
			const ridgeLike = structure.ridgeLike === true;
			if (basinLike && ridgeLike) {
				pixels[index] = 160;
			} else if (basinLike) {
				pixels[index] = 64;
			} else if (ridgeLike) {
				pixels[index] = 224;
			} else {
				pixels[index] = 128;
			}
			continue;
		}

		const raw = topography[layer];
		if (typeof raw !== "number" || !Number.isFinite(raw)) {
			throw new InputValidationError(
				`Tile (${x},${y}) is missing finite topography.${layer}.`,
			);
		}
		pixels[index] = Math.round(clamp01(raw) * 255);
	}

	await prepareOutputFile(outputFile, request.args.force);

	const header = Buffer.from(`P5\n${width} ${height}\n255\n`, "ascii");
	const payload = Buffer.concat([header, Buffer.from(pixels)]);
	try {
		await writeFile(outputFile, payload);
	} catch (error) {
		throw new FileIoError(
			`I/O error during image output write at "${outputFile}": ${messageFromUnknown(error)}`,
		);
	}
}
