import { isAbsolute, resolve } from "node:path";
import { InputValidationError } from "../domain/errors.js";
import { createGridShape } from "../domain/topography.js";
import type {
	CliArgs,
	JsonObject,
	JsonValue,
	ResolvedInputs,
	RunRequest,
	TerrainEnvelope,
} from "../domain/types.js";
import { readTerrainEnvelopeFile } from "../io/read-envelope.js";
import { readParamsFile } from "../io/read-params.js";
import { writeModeOutputs } from "../io/write-outputs.js";
import { deepMerge } from "../lib/deep-merge.js";
import { APPENDIX_A_DEFAULTS } from "../lib/default-params.js";
import { deriveTopographicStructure } from "../pipeline/derive-topographic-structure.js";
import { deriveTopographyFromBaseMaps } from "../pipeline/derive-topography.js";
import { deriveHydrology } from "../pipeline/derive-hydrology.js";
import { resolveBaseMaps } from "../pipeline/resolve-base-maps.js";
import { buildEnvelopeSkeleton } from "./build-envelope.js";
import {
	validateDebugInputFileInputs,
	validateResolvedInputs,
} from "./validate-input.js";

type TopographicStructureParams = Parameters<
	typeof deriveTopographicStructure
>[2];
const DEBUG_INPUT_FILE_EXCLUSIVE_FLAGS = [
	{ valueKey: "seed", flag: "--seed" },
	{ valueKey: "width", flag: "--width" },
	{ valueKey: "height", flag: "--height" },
	{ valueKey: "paramsPath", flag: "--params" },
	{ valueKey: "mapHPath", flag: "--map-h" },
	{ valueKey: "mapRPath", flag: "--map-r" },
	{ valueKey: "mapVPath", flag: "--map-v" },
] as const;

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

function deriveParamOverrideValue(
	value: JsonValue | undefined,
	defaultValue: JsonValue | undefined,
): JsonValue | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (isJsonObject(value) && isJsonObject(defaultValue)) {
		const nested = deriveParamOverrides(value, defaultValue);
		return nested && Object.keys(nested).length > 0 ? nested : undefined;
	}
	if (value === defaultValue) {
		return undefined;
	}
	return value;
}

function deriveParamOverrides(
	params: JsonObject,
	defaults: JsonObject,
): JsonObject | undefined {
	const overrides: JsonObject = {};
	for (const [key, value] of Object.entries(params)) {
		const overrideValue = deriveParamOverrideValue(value, defaults[key]);
		if (overrideValue !== undefined) {
			overrides[key] = overrideValue;
		}
	}
	return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function hasExplicitNestedVegVarianceStrength(params: JsonObject): boolean {
	const nested = params.vegVarianceNoise;
	if (!isJsonObject(nested)) {
		return false;
	}
	const strength = nested.strength;
	return typeof strength === "number" && Number.isFinite(strength);
}

function applyLegacyVegVarianceStrengthOverride(
	mergedParams: JsonObject,
	fileParams: JsonObject,
): void {
	const legacyStrength = fileParams.vegVarianceStrength;
	if (typeof legacyStrength !== "number" || !Number.isFinite(legacyStrength)) {
		return;
	}

	// Canonical precedence remains nested > legacy when both are explicitly provided.
	if (hasExplicitNestedVegVarianceStrength(fileParams)) {
		return;
	}

	const nested = isJsonObject(mergedParams.vegVarianceNoise)
		? mergedParams.vegVarianceNoise
		: {};
	mergedParams.vegVarianceNoise = {
		...nested,
		strength: legacyStrength,
	};
}

function buildTopographyStructureParams(
	params: JsonObject,
): TopographicStructureParams {
	const topography = isJsonObject(params.topography)
		? (params.topography as Record<string, unknown>)
		: {};
	const structure = isJsonObject(topography.structure)
		? (topography.structure as Record<string, unknown>)
		: {};
	return structure as unknown as TopographicStructureParams;
}

interface ElevationParams {
	h0: number;
	h1: number;
}

function buildElevationParams(params: JsonObject): ElevationParams {
	const elevation = isJsonObject(params.elevation)
		? (params.elevation as Record<string, unknown>)
		: {};
	const h0 = typeof elevation.h0 === "number" && Number.isFinite(elevation.h0)
		? elevation.h0
		: 0;
	const h1 = typeof elevation.h1 === "number" && Number.isFinite(elevation.h1)
		? elevation.h1
		: 300;
	return { h0, h1 };
}

export async function resolveInputs(
	request: RunRequest,
): Promise<ResolvedInputs> {
	const fromFile = await readParamsFile(request.args.paramsPath, request.cwd);
	const cliMapHPath = resolveFromCwd(request.cwd, request.args.mapHPath);
	const cliMapRPath = resolveFromCwd(request.cwd, request.args.mapRPath);
	const cliMapVPath = resolveFromCwd(request.cwd, request.args.mapVPath);
	const cliInputFilePath = resolveFromCwd(
		request.cwd,
		request.args.inputFilePath,
	);
	const cliOutputFile = resolveFromCwd(request.cwd, request.args.outputFile);
	const cliOutputDir = resolveFromCwd(request.cwd, request.args.outputDir);
	const cliDebugOutputFile = resolveFromCwd(
		request.cwd,
		request.args.debugOutputFile,
	);
	const cliParamsPath = resolveFromCwd(request.cwd, request.args.paramsPath);

	const baseParams = APPENDIX_A_DEFAULTS;
	const fileParams = (fromFile.params ?? {}) as JsonObject;
	const mergedParams = deepMerge(baseParams, fileParams);
	applyLegacyVegVarianceStrengthOverride(mergedParams, fileParams);

	return {
		seed: request.args.seed ?? fromFile.seed,
		width: request.args.width ?? fromFile.width,
		height: request.args.height ?? fromFile.height,
		params: mergedParams,
		paramsPath: cliParamsPath,
		inputFilePath: cliInputFilePath,
		mapHPath: cliMapHPath ?? fromFile.mapHPath,
		mapRPath: cliMapRPath ?? fromFile.mapRPath,
		mapVPath: cliMapVPath ?? fromFile.mapVPath,
		outputFile: cliOutputFile ?? fromFile.outputFile,
		outputDir: cliOutputDir ?? fromFile.outputDir,
		debugOutputFile: cliDebugOutputFile ?? fromFile.debugOutputFile,
		force: request.args.force || fromFile.force || false,
	};
}

function assertDebugInputFileArgs(args: CliArgs): void {
	if (!args.inputFilePath) {
		return;
	}

	const conflictingFlags: string[] = [];
	for (const { valueKey, flag } of DEBUG_INPUT_FILE_EXCLUSIVE_FLAGS) {
		if (args[valueKey] !== undefined) {
			conflictingFlags.push(flag);
		}
	}

	if (conflictingFlags.length > 0) {
		throw new InputValidationError(
			`--input-file cannot be combined with ${conflictingFlags.join(", ")} in debug mode.`,
		);
	}
}


function gridFromEnvelope(envelope: TerrainEnvelope): { shape: ReturnType<typeof createGridShape>; h: Float32Array } {
	let maxX = -1;
	let maxY = -1;
	for (const tile of envelope.tiles) {
		if (typeof tile.x === "number" && Number.isInteger(tile.x) && tile.x >= 0) {
			maxX = Math.max(maxX, tile.x);
		}
		if (typeof tile.y === "number" && Number.isInteger(tile.y) && tile.y >= 0) {
			maxY = Math.max(maxY, tile.y);
		}
	}
	const shape = createGridShape(maxX + 1, maxY + 1);
	const h = new Float32Array(shape.size);
	for (const tile of envelope.tiles) {
		if (
			typeof tile.x !== "number" ||
			typeof tile.y !== "number" ||
			!Number.isInteger(tile.x) ||
			!Number.isInteger(tile.y)
		) {
			continue;
		}
		const idx = tile.y * shape.width + tile.x;
		const topo = isJsonObject(tile.topography) ? tile.topography : null;
		const hv = topo && typeof topo.h === "number" && Number.isFinite(topo.h) ? topo.h : 0;
		h[idx] = hv;
	}
	return { shape, h };
}

export async function runGenerator(request: RunRequest): Promise<void> {
	const resolved = await resolveInputs(request);
	if (request.mode === "debug" && resolved.inputFilePath) {
		assertDebugInputFileArgs(request.args);
		const validated = validateDebugInputFileInputs(resolved);
		const envelope = await readTerrainEnvelopeFile(validated.inputFilePath);
		const replayParams = isJsonObject(envelope.paramOverrides)
			? deepMerge(validated.params, envelope.paramOverrides)
			: validated.params;
		const { shape, h } = gridFromEnvelope(envelope);
		const tileFeatureIds = envelope.tiles.map((tile) =>
			Array.isArray(tile.featureIds)
				? tile.featureIds.filter((id): id is string => typeof id === "string")
				: [],
		);
		const hydrology = deriveHydrology(
			shape,
			h,
			{ basinFeatures: envelope.features?.basins ?? [], tileFeatureIds },
			replayParams,
		);
		await writeModeOutputs(
			request.mode,
			validated.outputFile,
			validated.outputDir,
			validated.debugOutputFile,
			envelope,
			validated.force,
			hydrology.streamCoherence,
			hydrology.lakeCoherence,
			undefined,
			hydrology.diagnostics,
			hydrology.maps,
			hydrology.lakeAccounting,
		);
		return;
	}

	const validated = validateResolvedInputs(resolved, request.mode);
	const shape = createGridShape(validated.width, validated.height);
	const baseMaps = await resolveBaseMaps({
		shape,
		seed: validated.seed,
		params: validated.params,
		cwd: request.cwd,
		mapHPath: validated.mapHPath,
		mapRPath: validated.mapRPath,
		mapVPath: validated.mapVPath,
	});
	const topography = deriveTopographyFromBaseMaps(
		shape,
		baseMaps,
	);
	const topographyStructure = deriveTopographicStructure(
		shape,
		topography.h,
		buildTopographyStructureParams(validated.params),
	);
	const hydrology = deriveHydrology(
		shape,
		topography.h,
		{
			basinFeatures: topographyStructure.basinFeatures,
			tileFeatureIds: topographyStructure.tileFeatureIds,
		},
		validated.params,
	);
	const elevation = buildElevationParams(validated.params);
	const elevationSpan = elevation.h1 - elevation.h0;

	const envelope: TerrainEnvelope = buildEnvelopeSkeleton();
	envelope.features = {
		basins: topographyStructure.basinFeatures,
		peaks: topographyStructure.peakFeatures,
	};

	const tiles: JsonObject[] = [];
	for (let i = 0; i < shape.size; i += 1) {
		const x = i % shape.width;
		const y = Math.floor(i / shape.width);
		tiles.push({
			index: i,
			x,
			y,
			featureIds: topographyStructure.tileFeatureIds[i],
			activeFeatureIds: topographyStructure.tileActiveFeatureIds[i],
			topography: {
				h: topography.h[i],
				elevationMeters: elevation.h0 + topography.h[i] * elevationSpan,
				r: topography.r[i],
				v: topography.v[i],
				structure: {
					basinPersistence: topographyStructure.basinPersistence[i],
					peakPersistence: topographyStructure.peakPersistence[i],
					basinLike: topographyStructure.basinLike[i] === 1,
					ridgeLike: topographyStructure.ridgeLike[i] === 1,
				},
			},
		});
	}
	envelope.tiles = tiles;
	const paramOverrides = deriveParamOverrides(validated.params, APPENDIX_A_DEFAULTS);
	if (paramOverrides) {
		envelope.paramOverrides = paramOverrides;
	}

	await writeModeOutputs(
		request.mode,
		validated.outputFile,
		validated.outputDir,
		validated.debugOutputFile,
		envelope,
		validated.force,
		hydrology.streamCoherence,
		hydrology.lakeCoherence,
		topographyStructure,
		hydrology.diagnostics,
		hydrology.maps,
		hydrology.lakeAccounting,
	);
}
