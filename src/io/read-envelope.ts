import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { InputValidationError } from "../domain/errors.js";
import { DIR8_NONE, STREAM_DIR_VALUES } from "../domain/hydrology.js";
import type { TerrainFeatureCollection } from "../domain/topographic-features.js";
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
	isV2Envelope: boolean,
): void {
	if (!Number.isInteger(tile.x) || !Number.isInteger(tile.y)) {
		throw new InputValidationError(
			`Invalid tile at index ${index} in "${inputFilePath}". Expected integer "x" and "y".`,
		);
	}

	const maybeTopography = tile.topography;
	if (maybeTopography !== undefined && !isJsonObject(maybeTopography)) {
		throw new InputValidationError(
			`Invalid tile at index ${index} in "${inputFilePath}". Expected object "topography" when present.`,
		);
	}
	const maybeHydrology = tile.hydrology;
	if (maybeHydrology !== undefined && !isJsonObject(maybeHydrology)) {
		throw new InputValidationError(
			`Invalid tile at index ${index} in "${inputFilePath}". Expected object "hydrology" when present.`,
		);
	}
	if (isV2Envelope) {
		if (!isJsonObject(maybeHydrology)) {
			throw new InputValidationError(
				`Invalid tile at index ${index} in "${inputFilePath}". v2 envelopes require object "hydrology".`,
			);
		}
		const fd = maybeHydrology.fd;
		const fa = maybeHydrology.fa;
		const faN = maybeHydrology.faN;
		const waterDepth = maybeHydrology.waterDepth;
		const basinId = maybeHydrology.basinId;
		if (
			typeof fd !== "number" ||
			!Number.isInteger(fd) ||
			(fd < 0 || fd > 7) && fd !== DIR8_NONE
		) {
			throw new InputValidationError(
				`Invalid tile at index ${index} in "${inputFilePath}". v2 hydrology requires integer "fd" in [0..7,255].`,
			);
		}
		if (typeof fa !== "number" || !Number.isFinite(fa) || fa < 0) {
			throw new InputValidationError(
				`Invalid tile at index ${index} in "${inputFilePath}". v2 hydrology requires finite non-negative "fa".`,
			);
		}
		if (typeof faN !== "number" || !Number.isFinite(faN)) {
			throw new InputValidationError(
				`Invalid tile at index ${index} in "${inputFilePath}". v2 hydrology requires finite "faN".`,
			);
		}
		if (typeof waterDepth !== "number" || !Number.isFinite(waterDepth)) {
			throw new InputValidationError(
				`Invalid tile at index ${index} in "${inputFilePath}". v2 hydrology requires finite "waterDepth".`,
			);
		}
		if (typeof basinId !== "string" && basinId !== null) {
			throw new InputValidationError(
				`Invalid tile at index ${index} in "${inputFilePath}". v2 hydrology requires "basinId" as string|null.`,
			);
		}
		if (
			Object.prototype.hasOwnProperty.call(maybeHydrology, "hasStream") &&
			maybeHydrology.hasStream !== true
		) {
			throw new InputValidationError(
				`Invalid tile at index ${index} in "${inputFilePath}". v2 hydrology field "hasStream" is only allowed as literal true when present.`,
			);
		}
		if (
			Object.prototype.hasOwnProperty.call(maybeHydrology, "inStreamDir") &&
			(!Array.isArray(maybeHydrology.inStreamDir) ||
				!maybeHydrology.inStreamDir.every(
					(value) =>
						typeof value === "string" &&
						(STREAM_DIR_VALUES as string[]).includes(value),
				))
		) {
			throw new InputValidationError(
				`Invalid tile at index ${index} in "${inputFilePath}". v2 hydrology field "inStreamDir" must contain StreamDir values.`,
			);
		}
		if (
			Object.prototype.hasOwnProperty.call(maybeHydrology, "outStreamDir") &&
			(typeof maybeHydrology.outStreamDir !== "string" ||
				!(STREAM_DIR_VALUES as string[]).includes(maybeHydrology.outStreamDir))
		) {
			throw new InputValidationError(
				`Invalid tile at index ${index} in "${inputFilePath}". v2 hydrology field "outStreamDir" must be a StreamDir value.`,
			);
		}
	}
	const maybeEcology = tile.ecology;
	if (maybeEcology !== undefined && !isJsonObject(maybeEcology)) {
		throw new InputValidationError(
			`Invalid tile at index ${index} in "${inputFilePath}". Expected object "ecology" when present.`,
		);
	}
	const maybeNavigation = tile.navigation;
	if (maybeNavigation !== undefined && !isJsonObject(maybeNavigation)) {
		throw new InputValidationError(
			`Invalid tile at index ${index} in "${inputFilePath}". Expected object "navigation" when present.`,
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

function assertFeatureNodesShape(
	nodes: unknown,
	inputFilePath: string,
	kind: "basins" | "peaks",
): void {
	if (!Array.isArray(nodes)) {
		throw new InputValidationError(
			`Invalid envelope "features.${kind}" in "${inputFilePath}". Expected an array.`,
		);
	}
	for (let i = 0; i < nodes.length; i += 1) {
		const node = nodes[i];
		if (!isJsonObject(node)) {
			throw new InputValidationError(
				`Invalid feature node at index ${i} in "${inputFilePath}" under "features.${kind}". Expected a JSON object.`,
			);
		}
		if (typeof node.id !== "string") {
			throw new InputValidationError(
				`Invalid feature node at index ${i} in "${inputFilePath}" under "features.${kind}". Expected string "id".`,
			);
		}
		if (!Array.isArray(node.childIds)) {
			throw new InputValidationError(
				`Invalid feature node at index ${i} in "${inputFilePath}" under "features.${kind}". Expected array "childIds".`,
			);
		}
		if (!node.childIds.every((value) => typeof value === "string")) {
			throw new InputValidationError(
				`Invalid feature node at index ${i} in "${inputFilePath}" under "features.${kind}". Expected string values in "childIds".`,
			);
		}
	}
}

function assertFeaturesShape(
	features: unknown,
	inputFilePath: string,
): asserts features is TerrainFeatureCollection {
	if (!isJsonObject(features)) {
		throw new InputValidationError(
			`Invalid envelope "features" in "${inputFilePath}". Expected an object when present.`,
		);
	}
	assertFeatureNodesShape(features.basins, inputFilePath, "basins");
	assertFeatureNodesShape(features.peaks, inputFilePath, "peaks");
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
	const metaSeed =
		typeof parsed.meta.seed === "string" ? parsed.meta.seed : undefined;
	const isV2Envelope = parsed.meta.specVersion === "forest-terrain-v2";
	const metaElevation = isJsonObject(parsed.meta.elevation)
		? parsed.meta.elevation
		: undefined;
	const parsedElevation =
		metaElevation &&
		typeof metaElevation.h0 === "number" &&
		Number.isFinite(metaElevation.h0) &&
		typeof metaElevation.h1 === "number" &&
		Number.isFinite(metaElevation.h1) &&
		typeof metaElevation.zMinMeters === "number" &&
		Number.isFinite(metaElevation.zMinMeters) &&
		typeof metaElevation.zMaxMeters === "number" &&
		Number.isFinite(metaElevation.zMaxMeters)
			? {
					h0: metaElevation.h0,
					h1: metaElevation.h1,
					zMinMeters: metaElevation.zMinMeters,
					zMaxMeters: metaElevation.zMaxMeters,
				}
			: undefined;

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
	const hasFeatures = Object.prototype.hasOwnProperty.call(parsed, "features");
	const parsedFeatures = hasFeatures ? parsed.features : undefined;
	if (hasFeatures) {
		assertFeaturesShape(parsedFeatures, inputFilePath);
	}
	const hasParamOverrides = Object.prototype.hasOwnProperty.call(
		parsed,
		"paramOverrides",
	);
	if (hasParamOverrides && !isJsonObject(parsed.paramOverrides)) {
		throw new InputValidationError(
			`Invalid envelope "paramOverrides" in "${inputFilePath}". Expected an object when present.`,
		);
	}

	for (let i = 0; i < parsed.tiles.length; i += 1) {
		const tile = parsed.tiles[i];
		if (!isJsonObject(tile)) {
			throw new InputValidationError(
				`Invalid tile at index ${i} in "${inputFilePath}". Expected a JSON object.`,
			);
		}
		assertTileShape(tile, inputFilePath, i, isV2Envelope);
	}

	return {
		meta: {
			specVersion: parsed.meta.specVersion,
			...(metaSeed ? { seed: metaSeed } : {}),
			...(parsedElevation ? { elevation: parsedElevation } : {}),
		},
		...(hasRegions
			? { regions: parsedRegions as unknown as RegionSummary[] }
			: {}),
		...(hasFeatures
			? { features: parsedFeatures as unknown as TerrainFeatureCollection }
			: {}),
		tiles: parsed.tiles as JsonObject[],
		...(hasParamOverrides
			? { paramOverrides: parsed.paramOverrides as JsonObject }
			: {}),
	};
}
