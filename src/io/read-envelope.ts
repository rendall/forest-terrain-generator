import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { InputValidationError } from "../domain/errors.js";
import type { JsonObject, TerrainEnvelope } from "../domain/types.js";

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messageFromUnknown(error: unknown): string {
	if (error instanceof Error && error.message.length > 0) {
		return error.message;
	}
	return "Unknown parse error.";
}

function assertTileShape(
	tile: JsonObject,
	inputFilePath: string,
	index: number,
): void {
	if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
		throw new InputValidationError(
			`Invalid tile at index ${index} in "${inputFilePath}". Expected integer "x" and "y".`,
		);
	}

	if (!isJsonObject(tile.topography)) {
		throw new InputValidationError(
			`Invalid tile at index ${index} in "${inputFilePath}". Missing object "topography".`,
		);
	}
	if (!isJsonObject(tile.hydrology)) {
		throw new InputValidationError(
			`Invalid tile at index ${index} in "${inputFilePath}". Missing object "hydrology".`,
		);
	}
	if (!isJsonObject(tile.ecology)) {
		throw new InputValidationError(
			`Invalid tile at index ${index} in "${inputFilePath}". Missing object "ecology".`,
		);
	}
	if (!isJsonObject(tile.navigation)) {
		throw new InputValidationError(
			`Invalid tile at index ${index} in "${inputFilePath}". Missing object "navigation".`,
		);
	}
}

export async function readTerrainEnvelopeFile(
	inputFilePath: string,
): Promise<TerrainEnvelope> {
	if (extname(inputFilePath).toLowerCase() !== ".json") {
		throw new InputValidationError(
			`Unsupported input file format for "${inputFilePath}". Only JSON terrain files are supported.`,
		);
	}

	const raw = await readFile(inputFilePath, "utf8");
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new InputValidationError(
			`Malformed JSON in input file "${inputFilePath}": ${messageFromUnknown(error)}`,
		);
	}

	if (!isJsonObject(parsed)) {
		throw new InputValidationError(
			`Input terrain file "${inputFilePath}" must contain a JSON object.`,
		);
	}

	if (
		!isJsonObject(parsed.meta) ||
		typeof parsed.meta.specVersion !== "string"
	) {
		throw new InputValidationError(
			`Input terrain file "${inputFilePath}" is missing required envelope metadata "meta.specVersion".`,
		);
	}

	if (!Array.isArray(parsed.tiles)) {
		throw new InputValidationError(
			`Input terrain file "${inputFilePath}" is missing required envelope array "tiles".`,
		);
	}

	for (let i = 0; i < parsed.tiles.length; i += 1) {
		const tile = parsed.tiles[i];
		if (!isJsonObject(tile)) {
			throw new InputValidationError(
				`Invalid tile at index ${i} in "${inputFilePath}". Expected a JSON object.`,
			);
		}
		assertTileShape(tile, inputFilePath, i);
	}

	return {
		meta: {
			specVersion: parsed.meta.specVersion,
		},
		tiles: parsed.tiles as JsonObject[],
	};
}
