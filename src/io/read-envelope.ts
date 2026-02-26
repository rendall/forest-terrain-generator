import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { InputValidationError } from "../domain/errors.js";
import type { JsonObject, RegionSummary, TerrainEnvelope } from "../domain/types.js";

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

function assertRegionSummaryShape(
	region: JsonObject,
	inputFilePath: string,
	index: number,
): void {
	if (!Number.isInteger(region.id)) {
		throw new InputValidationError(
			`Invalid region at index ${index} in "${inputFilePath}". Expected integer "id".`,
		);
	}
	if (typeof region.biome !== "string") {
		throw new InputValidationError(
			`Invalid region at index ${index} in "${inputFilePath}". Expected string "biome".`,
		);
	}
	if (!Number.isInteger(region.tileCount)) {
		throw new InputValidationError(
			`Invalid region at index ${index} in "${inputFilePath}". Expected integer "tileCount".`,
		);
	}
	if (!isJsonObject(region.bbox)) {
		throw new InputValidationError(
			`Invalid region at index ${index} in "${inputFilePath}". Missing object "bbox".`,
		);
	}
	const bbox = region.bbox;
	if (
		!Number.isInteger(bbox.minX) ||
		!Number.isInteger(bbox.minY) ||
		!Number.isInteger(bbox.maxX) ||
		!Number.isInteger(bbox.maxY)
	) {
		throw new InputValidationError(
			`Invalid region at index ${index} in "${inputFilePath}". Expected integer bbox fields "minX|minY|maxX|maxY".`,
		);
	}

	if (
		Object.prototype.hasOwnProperty.call(region, "parentRegionId") &&
		!Number.isInteger(region.parentRegionId)
	) {
		throw new InputValidationError(
			`Invalid region at index ${index} in "${inputFilePath}". Expected integer "parentRegionId" when present.`,
		);
	}
}

function assertRegionsShape(
	regions: unknown,
	inputFilePath: string,
): asserts regions is RegionSummary[] {
	if (!Array.isArray(regions)) {
		throw new InputValidationError(
			`Invalid envelope "regions" in "${inputFilePath}". Expected an array when present.`,
		);
	}

	for (let i = 0; i < regions.length; i += 1) {
		const region = regions[i];
		if (!isJsonObject(region)) {
			throw new InputValidationError(
				`Invalid region at index ${i} in "${inputFilePath}". Expected a JSON object.`,
			);
		}
		assertRegionSummaryShape(region, inputFilePath, i);
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
	const hasRegions = Object.prototype.hasOwnProperty.call(parsed, "regions");
	const parsedRegions = hasRegions ? parsed.regions : undefined;
	if (hasRegions) {
		assertRegionsShape(parsedRegions, inputFilePath);
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
		...(hasRegions
			? { regions: parsedRegions as unknown as RegionSummary[] }
			: {}),
		tiles: parsed.tiles as JsonObject[],
	};
}
