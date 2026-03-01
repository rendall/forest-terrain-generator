import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { FileIoError, InputValidationError } from "../domain/errors.js";
import type { JsonObject } from "../domain/types.js";
import { readTerrainEnvelopeFile } from "../io/read-envelope.js";
import { runSee } from "./run-see.js";

export interface MapCliArgs {
	inputJsonPath?: string;
	outputPgmPath?: string;
	layer?: "h" | "r" | "v" | "landforms" | "landscape";
	threshold?: number;
	force: boolean;
}

export interface MapRequest {
	args: MapCliArgs;
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
	if (await pathExists(path) && !force) {
		throw new InputValidationError(
			`Output file already exists: "${path}". Re-run with --force to overwrite.`,
		);
	}
	await mkdir(dirname(path), { recursive: true });
}

export async function runMap(request: MapRequest): Promise<void> {
	const layer = request.args.layer ?? "h";
	const useThresholdMode = request.args.threshold !== undefined || layer === "h";
	if (useThresholdMode) {
		const threshold = request.args.threshold ?? 0.1;
		if (
			typeof threshold !== "number" ||
			!Number.isFinite(threshold) ||
			threshold < 0 ||
			threshold > 0.5
		) {
			throw new InputValidationError(
				'Invalid --threshold value. Expected a finite number in [0, 0.5].',
			);
		}
		if (layer !== "h") {
			throw new InputValidationError(
				'--threshold currently supports only layer "h".',
			);
		}

		const inputFilePath = resolveFromCwd(request.cwd, request.args.inputJsonPath);
		const outputFile = resolveFromCwd(request.cwd, request.args.outputPgmPath);
		if (!inputFilePath) {
			throw new InputValidationError("Missing required input: --input-json.");
		}
		if (!outputFile) {
			throw new InputValidationError("Missing required output: --output-pgm.");
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
			const h = topography.h;
			if (typeof h !== "number" || !Number.isFinite(h)) {
				throw new InputValidationError(
					`Tile (${x},${y}) is missing finite topography.h.`,
				);
			}

			if (h < threshold) {
				pixels[index] = 0;
			} else if (h > 1 - threshold) {
				pixels[index] = 255;
			} else {
				pixels[index] = 128;
			}
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
		return;
	}

	await runSee({
		cwd: request.cwd,
		args: {
			inputFilePath: request.args.inputJsonPath,
			outputFile: request.args.outputPgmPath,
			layer,
			force: request.args.force,
		},
	});
}
