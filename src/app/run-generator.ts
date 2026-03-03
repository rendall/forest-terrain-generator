import { isAbsolute, resolve } from "node:path";
import { InputValidationError } from "../domain/errors.js";
import {
	DIR8_NONE,
	flowCodeToStreamDir,
	oppositeStreamDir,
	type StreamDir,
} from "../domain/hydrology.js";
import { createGridShape } from "../domain/topography.js";
import type {
	CliArgs,
	JsonObject,
	ResolvedInputs,
	RunRequest,
	TerrainEnvelope,
} from "../domain/types.js";
import { readTerrainEnvelopeFile } from "../io/read-envelope.js";
import { readParamsFile } from "../io/read-params.js";
import { writeModeOutputs } from "../io/write-outputs.js";
import { buildBasinTileMembership } from "../lib/basin-membership.js";
import { deepMerge } from "../lib/deep-merge.js";
import { APPENDIX_A_DEFAULTS } from "../lib/default-params.js";
import { computeJsonDelta } from "../lib/json-delta.js";
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

const isFiniteNumber = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value);

const basinIdFromFeatureIds = (featureIds: string[]): string | null =>
	featureIds.find((id) => id.startsWith("b_")) ?? null;

const resolveFlowTarget = (
	index: number,
	width: number,
	height: number,
	fdCode: number,
): number | null => {
	const x = index % width;
	const y = Math.floor(index / width);
	let nx = x;
	let ny = y;
	const dir = flowCodeToStreamDir(fdCode);
	if (!dir) {
		return null;
	}
	switch (dir) {
		case "E":
			nx += 1;
			break;
		case "SE":
			nx += 1;
			ny += 1;
			break;
		case "S":
			ny += 1;
			break;
		case "SW":
			nx -= 1;
			ny += 1;
			break;
		case "W":
			nx -= 1;
			break;
		case "NW":
			nx -= 1;
			ny -= 1;
			break;
		case "N":
			ny -= 1;
			break;
		case "NE":
			nx += 1;
			ny -= 1;
			break;
	}
	if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
		return null;
	}
	return ny * width + nx;
};


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
		const paramsFile = await readParamsFile(request.args.paramsPath, request.cwd);
		const envelopeParamOverrides = isJsonObject(envelope.paramOverrides)
			? (envelope.paramOverrides as JsonObject)
			: {};
		const paramsFromFile = isJsonObject(paramsFile.params)
			? (paramsFile.params as JsonObject)
			: {};
		const recomputeParams = deepMerge(
			deepMerge(APPENDIX_A_DEFAULTS, envelopeParamOverrides),
			paramsFromFile,
		);
		applyLegacyVegVarianceStrengthOverride(recomputeParams, paramsFromFile);
		const recomputeParamOverrides = computeJsonDelta(
			APPENDIX_A_DEFAULTS,
			recomputeParams,
		);
		if (Object.keys(recomputeParamOverrides).length > 0) {
			envelope.paramOverrides = recomputeParamOverrides;
		}
		const { shape, h } = gridFromEnvelope(envelope);
		const membership = buildBasinTileMembership(
			shape.size,
			envelope.features?.basins ?? [],
		);
		const tileFeatureIds = envelope.tiles.map((tile) => {
			if (Array.isArray(tile.featureIds)) {
				return tile.featureIds.filter(
					(id): id is string => typeof id === "string",
				);
			}
			if (
				typeof tile.x !== "number" ||
				typeof tile.y !== "number" ||
				!Number.isInteger(tile.x) ||
				!Number.isInteger(tile.y) ||
				tile.x < 0 ||
				tile.y < 0 ||
				tile.x >= shape.width ||
				tile.y >= shape.height
			) {
				return [];
			}
			return membership.tileFeatureIds[tile.y * shape.width + tile.x] ?? [];
		});
		const hydrology = deriveHydrology(
			shape,
			h,
			{ basinFeatures: envelope.features?.basins ?? [], tileFeatureIds },
			recomputeParams,
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
	const minH = topography.h.reduce(
		(min, value) => Math.min(min, value),
		Number.POSITIVE_INFINITY,
	);
	const maxH = topography.h.reduce(
		(max, value) => Math.max(max, value),
		Number.NEGATIVE_INFINITY,
	);
	const zMinMeters = elevation.h0 + minH * elevationSpan;
	const zMaxMeters = elevation.h0 + maxH * elevationSpan;
	const paramOverrides = computeJsonDelta(APPENDIX_A_DEFAULTS, validated.params);

	const envelope: TerrainEnvelope = buildEnvelopeSkeleton();
	envelope.meta.seed = validated.seed.toString();
	envelope.meta.elevation = {
		h0: elevation.h0,
		h1: elevation.h1,
		zMinMeters,
		zMaxMeters,
	};
	envelope.features = {
		basins: topographyStructure.basinFeatures,
		peaks: topographyStructure.peakFeatures,
	};

	const tileWaterDepth = hydrology.lakeAccounting.tileWaterDepth;
	const tileLakeBasinId = hydrology.lakeAccounting.tileLakeBasinId;
	const outStreamDirByTile = new Array<StreamDir | undefined>(shape.size);
	const inStreamDirsByTile = Array.from(
		{ length: shape.size },
		() => new Set<StreamDir>(),
	);
	for (let i = 0; i < shape.size; i += 1) {
		if ((hydrology.maps.isStream[i] ?? 0) !== 1) {
			continue;
		}
		const outDir = flowCodeToStreamDir(hydrology.maps.fd[i] ?? DIR8_NONE);
		if (!outDir) {
			continue;
		}
		outStreamDirByTile[i] = outDir;
		const target = resolveFlowTarget(
			i,
			shape.width,
			shape.height,
			hydrology.maps.fd[i] ?? DIR8_NONE,
		);
		if (target === null || target < 0 || target >= shape.size) {
			continue;
		}
		inStreamDirsByTile[target].add(oppositeStreamDir(outDir));
	}

	const tiles: JsonObject[] = [];
	for (let i = 0; i < shape.size; i += 1) {
		const x = i % shape.width;
		const y = Math.floor(i / shape.width);
		const featureIds = topographyStructure.tileFeatureIds[i] ?? [];
		const directBasinId = basinIdFromFeatureIds(featureIds);
		const fallbackBasinId =
			typeof tileLakeBasinId[i] === "string" && tileLakeBasinId[i].length > 0
				? tileLakeBasinId[i]
				: null;
		const basinId = directBasinId ?? fallbackBasinId;
		const waterDepth = isFiniteNumber(tileWaterDepth?.[i])
			? tileWaterDepth[i]
			: 0;
		const hasStream = (hydrology.maps.isStream[i] ?? 0) === 1;
		const inDirs = hasStream ? [...inStreamDirsByTile[i]].sort() : [];
		const outDir = hasStream ? outStreamDirByTile[i] : undefined;
		const tileHydrology: JsonObject = {
			fd: hydrology.maps.fd[i] ?? DIR8_NONE,
			fa: hydrology.maps.fa[i] ?? 0,
			faN: hydrology.maps.faN[i] ?? 0,
			waterDepth,
			basinId,
		};
		if (hasStream) {
			tileHydrology.hasStream = true;
			if (inDirs.length > 0) {
				tileHydrology.inStreamDir = inDirs;
			}
			if (outDir) {
				tileHydrology.outStreamDir = outDir;
			}
		}
		tiles.push({
			index: i,
			x,
			y,
			topography: {
				h: topography.h[i],
				r: topography.r[i],
				v: topography.v[i],
			},
			hydrology: tileHydrology,
		});
	}
	envelope.tiles = tiles;
	if (Object.keys(paramOverrides).length > 0) {
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
