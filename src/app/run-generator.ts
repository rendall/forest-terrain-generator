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
import {
	normalizeAndValidateParamsObject,
	readParamsFile,
} from "../io/read-params.js";
import { writeModeOutputs } from "../io/write-outputs.js";
import { deepMerge } from "../lib/deep-merge.js";
import { APPENDIX_A_DEFAULTS } from "../lib/default-params.js";
import { validateReplayTopographyGrid } from "../lib/validate-replay-tiles.js";
import { deriveHydrology } from "../pipeline/derive-hydrology.js";
import { deriveStreamNetwork } from "../pipeline/derive-stream-network.js";
import { deriveTopographicStructure } from "../pipeline/derive-topographic-structure.js";
import { deriveTopographyFromBaseMaps } from "../pipeline/derive-topography.js";
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
	const h0 =
		typeof elevation.h0 === "number" && Number.isFinite(elevation.h0)
			? elevation.h0
			: 0;
	const h1 =
		typeof elevation.h1 === "number" && Number.isFinite(elevation.h1)
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
	const paramsFromFile = deepMerge({}, fileParams);
	applyLegacyVegVarianceStrengthOverride(paramsFromFile, fileParams);

	return {
		seed: request.args.seed ?? fromFile.seed,
		width: request.args.width ?? fromFile.width,
		height: request.args.height ?? fromFile.height,
		params: mergedParams,
		paramsFromFile,
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

function buildTileHydrologyPayload(
	hydrology: ReturnType<typeof deriveHydrology>,
	streamNetwork: ReturnType<typeof deriveStreamNetwork>,
	index: number,
): JsonObject {
	const lakeMask = hydrology.maps.lakeMask[index] === 1;
	const lakeBasinId = hydrology.lakeAccounting.tileLakeBasinId[index] || null;
	const waterDepth = hydrology.lakeAccounting.tileLakeDepth[index] ?? 0;
	const hasWaterSurface = lakeBasinId !== null;
	return {
		fd: hydrology.maps.fd[index],
		fa: hydrology.maps.fa[index],
		faN: hydrology.maps.faN[index],
		lakeMask,
		lakeBasinId,
		...(hasWaterSurface
			? { waterSurfaceH: hydrology.maps.waterSurfaceH[index] }
			: {}),
		...(hasWaterSurface ? { waterDepth } : {}),
		stream: {
			outgoingDirection: streamNetwork.tileGeometry[index].outgoingDirection,
			incomingDirections: [
				...streamNetwork.tileGeometry[index].incomingDirections,
			],
		},
	};
}

function attachBasinWaterSurface(
	basinFeatures: ReturnType<typeof deriveTopographicStructure>["basinFeatures"],
	hydrology: ReturnType<typeof deriveHydrology>,
): ReturnType<typeof deriveTopographicStructure>["basinFeatures"] {
	const lakeAccountingById = hydrology.lakeAccounting.byId;
	return basinFeatures.map((basin) => {
		const waterSurfaceH = lakeAccountingById.get(basin.id)?.waterSurfaceH;
		if (typeof waterSurfaceH === "number" && Number.isFinite(waterSurfaceH)) {
			return { ...basin, waterSurfaceH };
		}
		return basin;
	});
}

function buildReplayEnvelope(
	sourceEnvelope: TerrainEnvelope,
	sourceTilesByIndex: JsonObject[],
	replayH: Float32Array,
	replayParams: JsonObject,
	topographyStructure: ReturnType<typeof deriveTopographicStructure>,
	hydrology: ReturnType<typeof deriveHydrology>,
	streamNetwork: ReturnType<typeof deriveStreamNetwork>,
): TerrainEnvelope {
	const elevation = buildElevationParams(replayParams);
	const elevationSpan = elevation.h1 - elevation.h0;
	const tiles: JsonObject[] = [];
	const shape = hydrology.maps.shape;

	for (let index = 0; index < shape.size; index += 1) {
		const sourceTile = sourceTilesByIndex[index] ?? {};
		const x = index % shape.width;
		const y = Math.floor(index / shape.width);
		const sourceTopography = isJsonObject(sourceTile.topography)
			? sourceTile.topography
			: {};
		const sourceTopographySansStructure = { ...sourceTopography };
		delete sourceTopographySansStructure.structure;
		const tileHydrology = buildTileHydrologyPayload(
			hydrology,
			streamNetwork,
			index,
		);
		tiles.push({
			...sourceTile,
			index,
			x,
			y,
			featureIds: topographyStructure.tileFeatureIds[index],
			activeFeatureIds: topographyStructure.tileActiveFeatureIds[index],
			topography: {
				...sourceTopographySansStructure,
				h: replayH[index],
				elevationMeters: elevation.h0 + replayH[index] * elevationSpan,
			},
			hydrology: tileHydrology,
		});
	}

	const paramOverrides = deriveParamOverrides(
		replayParams,
		APPENDIX_A_DEFAULTS,
	);
	return {
		meta: {
			specVersion: sourceEnvelope.meta.specVersion,
		},
		...(sourceEnvelope.regions ? { regions: sourceEnvelope.regions } : {}),
		features: {
			basins: topographyStructure.basinFeatures,
			peaks: topographyStructure.peakFeatures,
			streams: streamNetwork.streams,
		},
		tiles,
		...(paramOverrides ? { paramOverrides } : {}),
	};
}

export async function runGenerator(request: RunRequest): Promise<void> {
	const resolved = await resolveInputs(request);
	if (request.mode === "debug" && resolved.inputFilePath) {
		assertDebugInputFileArgs(request.args);
		const validated = validateDebugInputFileInputs(resolved);
		const envelope = await readTerrainEnvelopeFile(validated.inputFilePath);
		const envelopeParamOverrides = isJsonObject(envelope.paramOverrides)
			? normalizeAndValidateParamsObject(
					deepMerge({}, envelope.paramOverrides),
					"envelope.paramOverrides",
				)
			: undefined;
		const replayBase = deepMerge(
			APPENDIX_A_DEFAULTS,
			envelopeParamOverrides ?? {},
		);
		applyLegacyVegVarianceStrengthOverride(
			replayBase,
			envelopeParamOverrides ?? {},
		);
		const replayParams = deepMerge(replayBase, validated.paramsFromFile);
		applyLegacyVegVarianceStrengthOverride(
			replayParams,
			validated.paramsFromFile,
		);

		if (validated.paramsPath) {
			console.warn(
				`debug --input-file replay: --params overrides are active from "${validated.paramsPath}" (precedence: defaults -> envelope.paramOverrides -> --params <file>).`,
			);
		}

		const replayGrid = validateReplayTopographyGrid(
			envelope.tiles,
			validated.inputFilePath,
		);
		const topographyStructure = deriveTopographicStructure(
			replayGrid.shape,
			replayGrid.h,
			buildTopographyStructureParams(replayParams),
		);
		const hydrology = deriveHydrology(
			replayGrid.shape,
			replayGrid.h,
			{
				basinFeatures: topographyStructure.basinFeatures,
				tileFeatureIds: topographyStructure.tileFeatureIds,
			},
			replayParams,
		);
		const streamNetwork = deriveStreamNetwork({
			shape: replayGrid.shape,
			h: replayGrid.h,
			fa: hydrology.maps.fa,
		});
		const basinFeaturesWithWaterSurface = attachBasinWaterSurface(
			topographyStructure.basinFeatures,
			hydrology,
		);
		const outputTopographyStructure = {
			...topographyStructure,
			basinFeatures: basinFeaturesWithWaterSurface,
		};
		const replayEnvelope = buildReplayEnvelope(
			envelope,
			replayGrid.tilesByIndex,
			replayGrid.h,
			replayParams,
			outputTopographyStructure,
			hydrology,
			streamNetwork,
		);
		await writeModeOutputs(
			request.mode,
			validated.outputFile,
			validated.outputDir,
			validated.debugOutputFile,
			replayEnvelope,
			validated.force,
			hydrology.streamCoherence,
			hydrology.lakeCoherence,
			outputTopographyStructure,
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
	const topography = deriveTopographyFromBaseMaps(shape, baseMaps);
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
	const streamNetwork = deriveStreamNetwork({
		shape,
		h: topography.h,
		fa: hydrology.maps.fa,
	});
	const basinFeaturesWithWaterSurface = attachBasinWaterSurface(
		topographyStructure.basinFeatures,
		hydrology,
	);
	const outputTopographyStructure = {
		...topographyStructure,
		basinFeatures: basinFeaturesWithWaterSurface,
	};
	const elevation = buildElevationParams(validated.params);
	const elevationSpan = elevation.h1 - elevation.h0;

	const envelope: TerrainEnvelope = buildEnvelopeSkeleton();
	envelope.features = {
		basins: outputTopographyStructure.basinFeatures,
		peaks: topographyStructure.peakFeatures,
		streams: streamNetwork.streams,
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
			},
			hydrology: buildTileHydrologyPayload(hydrology, streamNetwork, i),
		});
	}
	envelope.tiles = tiles;
	const paramOverrides = deriveParamOverrides(
		validated.params,
		APPENDIX_A_DEFAULTS,
	);
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
		outputTopographyStructure,
		hydrology.diagnostics,
		hydrology.maps,
		hydrology.lakeAccounting,
	);
}
