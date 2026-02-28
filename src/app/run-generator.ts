import { isAbsolute, resolve } from "node:path";
import { InputValidationError } from "../domain/errors.js";
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
import { deepMerge } from "../lib/deep-merge.js";
import { APPENDIX_A_DEFAULTS } from "../lib/default-params.js";
import { deriveTopographicStructure } from "../pipeline/derive-topographic-structure.js";
import { deriveTopographyFromBaseMaps } from "../pipeline/derive-topography.js";
import {
	biomeCodeToName,
	deriveEcology,
	dominantSlotsToOrderedList,
	featureFlagsToOrderedList,
	soilTypeCodeToName,
	surfaceFlagsToOrderedList,
} from "../pipeline/ecology.js";
import {
	deriveDownstreamIndexMap,
	deriveHydrology,
	deriveLakeCoherenceMetrics,
	deriveStreamCoherenceMetrics,
} from "../pipeline/hydrology.js";
import {
	assertPostProcessingDisabled,
	buildTrailPlan,
	deriveDirectionalPassability,
	deriveFollowableFlags,
	deriveMoveCost,
	deriveTrailPreferenceCost,
	executeTrailRouteRequests,
	markTrailPaths,
	navigationTilePayloadAt,
	validateNavigationMaps,
} from "../pipeline/navigation.js";
import { resolveBaseMaps } from "../pipeline/resolve-base-maps.js";
import { buildEnvelopeSkeleton } from "./build-envelope.js";
import {
	validateDebugInputFileInputs,
	validateResolvedInputs,
} from "./validate-input.js";

const LANDFORM_NAME_BY_CODE: Record<number, string> = {
	0: "flat",
	1: "slope",
	2: "ridge",
	3: "valley",
	4: "basin",
};

const WATER_CLASS_NAME_BY_CODE: Record<number, string> = {
	0: "none",
	1: "lake",
	2: "stream",
	3: "marsh",
	4: "pool",
};

type HydrologyParams = Parameters<typeof deriveHydrology>[5];
type TopographicStructureParams = Parameters<
	typeof deriveTopographicStructure
>[2];
type EcologyParams = Parameters<typeof deriveEcology>[2];
type TrailCostParams = Parameters<typeof deriveTrailPreferenceCost>[2];
type TrailPlanParams = Parameters<typeof buildTrailPlan>[2];
type TrailRoutingParams = Parameters<typeof executeTrailRouteRequests>[3];
type MoveCostParams = Parameters<typeof deriveMoveCost>[2];
type DirectionalPassabilityParams = Parameters<
	typeof deriveDirectionalPassability
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

function buildHydrologyParams(params: JsonObject): HydrologyParams {
	const hydrology = isJsonObject(params.hydrology)
		? (params.hydrology as Record<string, unknown>)
		: {};
	const gameTrails = isJsonObject(params.gameTrails)
		? (params.gameTrails as Record<string, unknown>)
		: {};

	return {
		...hydrology,
		lakeCoherence: hydrology.lakeCoherence,
		streamProxMaxDist: gameTrails.streamProxMaxDist,
	} as unknown as HydrologyParams;
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

export async function runGenerator(request: RunRequest): Promise<void> {
	const resolved = await resolveInputs(request);
	if (request.mode === "debug" && resolved.inputFilePath) {
		assertDebugInputFileArgs(request.args);
		const validated = validateDebugInputFileInputs(resolved);
		const envelope = await readTerrainEnvelopeFile(validated.inputFilePath);
		await writeModeOutputs(
			request.mode,
			validated.outputFile,
			validated.outputDir,
			validated.debugOutputFile,
			envelope,
			validated.force,
			undefined,
			undefined,
			undefined,
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
		validated.params,
	);
	const topographyStructure = deriveTopographicStructure(
		shape,
		topography.h,
		buildTopographyStructureParams(validated.params),
	);
	const hydrologyParams = buildHydrologyParams(validated.params);
	const hydrology = deriveHydrology(
		shape,
		topography.h,
		topography.slopeMag,
		topography.landform,
		validated.seed,
		hydrologyParams,
	);
	const streamCoherence = deriveStreamCoherenceMetrics(
		shape,
		deriveDownstreamIndexMap(shape, hydrology.fd),
		hydrology.isStream,
		hydrology.lakeMask,
		hydrology.poolMask,
	);
	const lakeCoherence = deriveLakeCoherenceMetrics(
		shape,
		hydrology.lakeMask,
		topography.h,
		hydrologyParams.lakeCoherence,
	);
	const ecologyParams = {
		vegVarianceNoise: validated.params.vegVarianceNoise as
			| { strength?: number }
			| undefined,
		vegVarianceStrength:
			typeof validated.params.vegVarianceStrength === "number"
				? validated.params.vegVarianceStrength
				: undefined,
		ground: validated.params.ground as unknown,
		roughnessFeatures: validated.params.roughnessFeatures as unknown,
	} as EcologyParams;
	const ecology = deriveEcology(
		shape,
		{
			waterClass: hydrology.waterClass,
			h: topography.h,
			r: topography.r,
			v: topography.v,
			moisture: hydrology.moisture,
			slopeMag: topography.slopeMag,
			landform: topography.landform,
		},
		ecologyParams,
	);
	const gameTrails = validated.params.gameTrails as Record<string, unknown>;
	const movement = validated.params.movement as Record<string, unknown>;
	const grid = validated.params.grid as Record<string, unknown>;
	const hydrologyParamsRaw = validated.params.hydrology as Record<
		string,
		unknown
	>;

	assertPostProcessingDisabled(
		gameTrails.postProcessEnabled === true ||
			gameTrails.enablePostProcess === true,
	);

	const trailCost = deriveTrailPreferenceCost(
		shape,
		{
			slopeMag: topography.slopeMag,
			moisture: hydrology.moisture,
			obstruction: ecology.obstruction,
			landform: topography.landform,
			waterClass: hydrology.waterClass,
			isStream: hydrology.isStream,
		},
		{
			playableInset: Number(grid.playableInset),
			inf: Number(gameTrails.inf),
			wSlope: Number(gameTrails.wSlope),
			slopeScale: Number(gameTrails.slopeScale),
			wMoist: Number(gameTrails.wMoist),
			moistStart: Number(gameTrails.moistStart),
			wObs: Number(gameTrails.wObs),
			wRidge: Number(gameTrails.wRidge),
			wStreamProx: Number(gameTrails.wStreamProx),
			streamProxMaxDist: Number(gameTrails.streamProxMaxDist),
			wCross: Number(gameTrails.wCross),
			wMarsh: Number(gameTrails.wMarsh),
		} as TrailCostParams,
	);
	const trailPlan = buildTrailPlan(
		shape,
		{
			seed: {
				firmness: ecology.firmness,
				moisture: hydrology.moisture,
				slopeMag: topography.slopeMag,
				waterClass: hydrology.waterClass,
			},
			endpoint: {
				waterClass: hydrology.waterClass,
				faN: hydrology.faN,
				landform: topography.landform,
				slopeMag: topography.slopeMag,
			},
		},
		{
			seed: {
				playableInset: Number(grid.playableInset),
				waterSeedMaxDist: Number(gameTrails.waterSeedMaxDist),
				seedTilesPerTrail: Number(gameTrails.seedTilesPerTrail),
			},
			endpoint: {
				streamEndpointAccumThreshold: Number(
					gameTrails.streamEndpointAccumThreshold,
				),
				ridgeEndpointMaxSlope: Number(gameTrails.ridgeEndpointMaxSlope),
			},
		} as TrailPlanParams,
	);
	const routed = executeTrailRouteRequests(
		shape,
		trailCost,
		trailPlan.routeRequests,
		{
			inf: Number(gameTrails.inf),
			diagWeight: Number(gameTrails.diagWeight),
			tieEps: Number(hydrologyParamsRaw.tieEps),
		} as TrailRoutingParams,
	);
	const trailMarked = markTrailPaths(shape, routed.successfulPaths);
	const moveCost = deriveMoveCost(
		shape,
		{
			obstruction: ecology.obstruction,
			moisture: hydrology.moisture,
			waterClass: hydrology.waterClass,
			biome: ecology.biome,
			gameTrail: trailMarked.gameTrail,
		},
		{
			moveCostObstructionMax: Number(movement.moveCostObstructionMax),
			moveCostMoistureMax: Number(movement.moveCostMoistureMax),
			marshMoveCostMultiplier: Number(movement.marshMoveCostMultiplier),
			openBogMoveCostMultiplier: Number(movement.openBogMoveCostMultiplier),
			gameTrailMoveCostMultiplier: Number(
				gameTrails.gameTrailMoveCostMultiplier,
			),
		} as MoveCostParams,
	);
	const directionalPassability = deriveDirectionalPassability(
		shape,
		{
			h: topography.h,
			moisture: hydrology.moisture,
			slopeMag: topography.slopeMag,
			waterClass: hydrology.waterClass,
			playableInset: Number(grid.playableInset),
		},
		{
			steepBlockDelta: Number(movement.steepBlockDelta),
			steepDifficultDelta: Number(movement.steepDifficultDelta),
			cliffSlopeMin: Number(movement.cliffSlopeMin),
		} as DirectionalPassabilityParams,
	);
	const followableFlags = deriveFollowableFlags(shape, {
		waterClass: hydrology.waterClass,
		landform: topography.landform,
		gameTrail: trailMarked.gameTrail,
	});
	const navigationMaps = {
		moveCost,
		passabilityPacked: directionalPassability.passabilityPacked,
		followableFlags,
		gameTrailId: trailMarked.gameTrailId,
	};
	validateNavigationMaps(shape, navigationMaps);

	const envelope: TerrainEnvelope = buildEnvelopeSkeleton();

	const tiles: JsonObject[] = [];
	for (let i = 0; i < shape.size; i += 1) {
		const x = i % shape.width;
		const y = Math.floor(i / shape.width);
		const landform = LANDFORM_NAME_BY_CODE[topography.landform[i]] ?? "unknown";
		const waterClass =
			WATER_CLASS_NAME_BY_CODE[hydrology.waterClass[i]] ?? "unknown";

		const hydrologyPayload: JsonObject = {
			fd: hydrology.fd[i],
			fa: hydrology.fa[i],
			faN: hydrology.faN[i],
			lakeMask: hydrology.lakeMask[i] === 1,
			isStream: hydrology.isStream[i] === 1,
			distWater: hydrology.distWater[i],
			moisture: hydrology.moisture[i],
			waterClass,
		};
		if (hydrology.lakeMask[i] === 1) {
			hydrologyPayload.lakeSurfaceH = hydrology.lakeSurfaceH[i];
		}

		tiles.push({
			index: i,
			x,
			y,
			topography: {
				h: topography.h[i],
				r: topography.r[i],
				v: topography.v[i],
				slopeMag: topography.slopeMag[i],
				aspectDeg: topography.aspectDeg[i],
				landform,
				structure: {
					basinPersistence: topographyStructure.basinPersistence[i],
					peakPersistence: topographyStructure.peakPersistence[i],
					basinLike: topographyStructure.basinLike[i] === 1,
					ridgeLike: topographyStructure.ridgeLike[i] === 1,
				},
			},
			hydrology: hydrologyPayload,
			ecology: {
				biome: biomeCodeToName(ecology.biome[i]),
				treeDensity: ecology.treeDensity[i],
				canopyCover: ecology.canopyCover[i],
				dominant: dominantSlotsToOrderedList(
					ecology.dominantPrimary[i],
					ecology.dominantSecondary[i],
				),
				ground: {
					soil: soilTypeCodeToName(ecology.soilType[i]),
					firmness: ecology.firmness[i],
					surfaceFlags: surfaceFlagsToOrderedList(ecology.surfaceFlags[i]),
				},
				roughness: {
					obstruction: ecology.obstruction[i],
					featureFlags: featureFlagsToOrderedList(ecology.featureFlags[i]),
				},
			},
			navigation: navigationTilePayloadAt(i, navigationMaps) as JsonObject,
		});
	}
	envelope.tiles = tiles;

	await writeModeOutputs(
		request.mode,
		validated.outputFile,
		validated.outputDir,
		validated.debugOutputFile,
		envelope,
		validated.force,
		streamCoherence,
		lakeCoherence,
		topographyStructure,
	);
}
