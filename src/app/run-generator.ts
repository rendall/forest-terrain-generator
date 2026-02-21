import { isAbsolute, resolve } from "node:path";
import { APPENDIX_A_DEFAULTS } from "../lib/default-params.js";
import { deepMerge } from "../lib/deep-merge.js";
import { readParamsFile } from "../io/read-params.js";
import type {
  JsonObject,
  ResolvedInputs,
  RunRequest,
  TerrainEnvelope
} from "../domain/types.js";
import { validateResolvedInputs } from "./validate-input.js";
import { buildEnvelopeSkeleton } from "./build-envelope.js";
import { writeModeOutputs } from "../io/write-outputs.js";
import { createGridShape } from "../domain/topography.js";
import { resolveBaseMaps } from "../pipeline/resolve-base-maps.js";
import { deriveTopographyFromBaseMaps } from "../pipeline/derive-topography.js";
import { deriveHydrology } from "../pipeline/hydrology.js";
import {
  biomeCodeToName,
  deriveEcology,
  dominantSlotsToOrderedList,
  featureFlagsToOrderedList,
  soilTypeCodeToName,
  surfaceFlagsToOrderedList
} from "../pipeline/ecology.js";
import {
  buildTrailPlan,
  deriveDirectionalPassability,
  deriveFollowableFlags,
  deriveMoveCost,
  deriveTrailPreferenceCost,
  executeTrailRouteRequests,
  markTrailPaths,
  navigationTilePayloadAt
} from "../pipeline/navigation.js";

const LANDFORM_NAME_BY_CODE: Record<number, string> = {
  0: "flat",
  1: "slope",
  2: "ridge",
  3: "valley",
  4: "basin"
};

const WATER_CLASS_NAME_BY_CODE: Record<number, string> = {
  0: "none",
  1: "lake",
  2: "stream",
  3: "marsh"
};

type HydrologyParams = Parameters<typeof deriveHydrology>[5];
type EcologyParams = Parameters<typeof deriveEcology>[2];
type TrailCostParams = Parameters<typeof deriveTrailPreferenceCost>[2];
type TrailPlanParams = Parameters<typeof buildTrailPlan>[2];
type TrailRoutingParams = Parameters<typeof executeTrailRouteRequests>[3];
type MoveCostParams = Parameters<typeof deriveMoveCost>[2];
type DirectionalPassabilityParams = Parameters<typeof deriveDirectionalPassability>[2];

function resolveFromCwd(cwd: string, maybeRelativePath: string | undefined): string | undefined {
  if (!maybeRelativePath) {
    return undefined;
  }
  return isAbsolute(maybeRelativePath) ? maybeRelativePath : resolve(cwd, maybeRelativePath);
}

export async function resolveInputs(request: RunRequest): Promise<ResolvedInputs> {
  const fromFile = await readParamsFile(request.args.paramsPath, request.cwd);
  const cliMapHPath = resolveFromCwd(request.cwd, request.args.mapHPath);
  const cliMapRPath = resolveFromCwd(request.cwd, request.args.mapRPath);
  const cliMapVPath = resolveFromCwd(request.cwd, request.args.mapVPath);
  const cliOutputFile = resolveFromCwd(request.cwd, request.args.outputFile);
  const cliOutputDir = resolveFromCwd(request.cwd, request.args.outputDir);
  const cliDebugOutputFile = resolveFromCwd(request.cwd, request.args.debugOutputFile);
  const cliParamsPath = resolveFromCwd(request.cwd, request.args.paramsPath);

  const baseParams = APPENDIX_A_DEFAULTS;
  const fileParams = (fromFile.params ?? {}) as JsonObject;
  const mergedParams = deepMerge(baseParams, fileParams);

  return {
    seed: request.args.seed ?? fromFile.seed,
    width: request.args.width ?? fromFile.width,
    height: request.args.height ?? fromFile.height,
    params: mergedParams,
    paramsPath: cliParamsPath,
    mapHPath: cliMapHPath ?? fromFile.mapHPath,
    mapRPath: cliMapRPath ?? fromFile.mapRPath,
    mapVPath: cliMapVPath ?? fromFile.mapVPath,
    outputFile: cliOutputFile ?? fromFile.outputFile,
    outputDir: cliOutputDir ?? fromFile.outputDir,
    debugOutputFile: cliDebugOutputFile ?? fromFile.debugOutputFile,
    force: request.args.force || fromFile.force || false
  };
}

export async function runGenerator(request: RunRequest): Promise<void> {
  const resolved = await resolveInputs(request);
  const validated = validateResolvedInputs(resolved, request.mode);
  const shape = createGridShape(validated.width, validated.height);
  const baseMaps = await resolveBaseMaps({
    shape,
    seed: validated.seed,
    params: validated.params,
    cwd: request.cwd,
    mapHPath: validated.mapHPath,
    mapRPath: validated.mapRPath,
    mapVPath: validated.mapVPath
  });
  const topography = deriveTopographyFromBaseMaps(shape, baseMaps, validated.params);
  const hydrologyParams = {
    ...(validated.params.hydrology as Record<string, unknown>),
    streamProxMaxDist: (validated.params.gameTrails as Record<string, unknown>)?.streamProxMaxDist
  } as unknown as HydrologyParams;
  const hydrology = deriveHydrology(
    shape,
    topography.h,
    topography.slopeMag,
    topography.landform,
    validated.seed,
    hydrologyParams
  );
  const ecologyParams = {
    vegVarianceNoise: validated.params.vegVarianceNoise as { strength?: number } | undefined,
    vegVarianceStrength:
      typeof validated.params.vegVarianceStrength === "number"
        ? validated.params.vegVarianceStrength
        : undefined,
    ground: validated.params.ground as unknown,
    roughnessFeatures: validated.params.roughnessFeatures as unknown
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
      landform: topography.landform
    },
    ecologyParams
  );
  const gameTrails = validated.params.gameTrails as Record<string, unknown>;
  const movement = validated.params.movement as Record<string, unknown>;
  const grid = validated.params.grid as Record<string, unknown>;
  const hydrologyParamsRaw = validated.params.hydrology as Record<string, unknown>;

  const trailCost = deriveTrailPreferenceCost(
    shape,
    {
      slopeMag: topography.slopeMag,
      moisture: hydrology.moisture,
      obstruction: ecology.obstruction,
      landform: topography.landform,
      waterClass: hydrology.waterClass,
      isStream: hydrology.isStream
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
      wMarsh: Number(gameTrails.wMarsh)
    } as TrailCostParams
  );
  const trailPlan = buildTrailPlan(
    shape,
    {
      seed: {
        firmness: ecology.firmness,
        moisture: hydrology.moisture,
        slopeMag: topography.slopeMag,
        waterClass: hydrology.waterClass
      },
      endpoint: {
        waterClass: hydrology.waterClass,
        faN: hydrology.faN,
        landform: topography.landform,
        slopeMag: topography.slopeMag
      }
    },
    {
      seed: {
        playableInset: Number(grid.playableInset),
        waterSeedMaxDist: Number(gameTrails.waterSeedMaxDist),
        seedTilesPerTrail: Number(gameTrails.seedTilesPerTrail)
      },
      endpoint: {
        streamEndpointAccumThreshold: Number(gameTrails.streamEndpointAccumThreshold),
        ridgeEndpointMaxSlope: Number(gameTrails.ridgeEndpointMaxSlope)
      }
    } as TrailPlanParams
  );
  const routed = executeTrailRouteRequests(shape, trailCost, trailPlan.routeRequests, {
    inf: Number(gameTrails.inf),
    diagWeight: Number(gameTrails.diagWeight),
    tieEps: Number(hydrologyParamsRaw.tieEps)
  } as TrailRoutingParams);
  const trailMarked = markTrailPaths(shape, routed.successfulPaths);
  const moveCost = deriveMoveCost(
    shape,
    {
      obstruction: ecology.obstruction,
      moisture: hydrology.moisture,
      waterClass: hydrology.waterClass,
      biome: ecology.biome,
      gameTrail: trailMarked.gameTrail
    },
    {
      moveCostObstructionMax: Number(movement.moveCostObstructionMax),
      moveCostMoistureMax: Number(movement.moveCostMoistureMax),
      marshMoveCostMultiplier: Number(movement.marshMoveCostMultiplier),
      openBogMoveCostMultiplier: Number(movement.openBogMoveCostMultiplier),
      gameTrailMoveCostMultiplier: Number(gameTrails.gameTrailMoveCostMultiplier)
    } as MoveCostParams
  );
  const directionalPassability = deriveDirectionalPassability(
    shape,
    {
      h: topography.h,
      moisture: hydrology.moisture,
      slopeMag: topography.slopeMag,
      waterClass: hydrology.waterClass,
      playableInset: Number(grid.playableInset)
    },
    {
      steepBlockDelta: Number(movement.steepBlockDelta),
      steepDifficultDelta: Number(movement.steepDifficultDelta),
      cliffSlopeMin: Number(movement.cliffSlopeMin)
    } as DirectionalPassabilityParams
  );
  const followableFlags = deriveFollowableFlags(shape, {
    waterClass: hydrology.waterClass,
    landform: topography.landform,
    gameTrail: trailMarked.gameTrail
  });

  const envelope: TerrainEnvelope = buildEnvelopeSkeleton();
  envelope.meta.implementationStatus = "draft-incomplete";
  envelope.meta.implementedPhases = ["topography", "hydrology", "ecology"];
  envelope.meta.notes = ["Partial output: phases 5-6 are not implemented yet."];

  const tiles = [];
  for (let i = 0; i < shape.size; i += 1) {
    const x = i % shape.width;
    const y = Math.floor(i / shape.width);
    const landform = LANDFORM_NAME_BY_CODE[topography.landform[i]] ?? "unknown";
    const waterClass = WATER_CLASS_NAME_BY_CODE[hydrology.waterClass[i]] ?? "unknown";

    tiles.push({
      x,
      y,
      topography: {
        h: topography.h[i],
        r: topography.r[i],
        v: topography.v[i],
        slopeMag: topography.slopeMag[i],
        aspectDeg: topography.aspectDeg[i],
        landform
      },
      hydrology: {
        fd: hydrology.fd[i],
        fa: hydrology.fa[i],
        faN: hydrology.faN[i],
        lakeMask: hydrology.lakeMask[i] === 1,
        isStream: hydrology.isStream[i] === 1,
        distWater: hydrology.distWater[i],
        moisture: hydrology.moisture[i],
        waterClass
      },
      ecology: {
        biome: biomeCodeToName(ecology.biome[i]),
        treeDensity: ecology.treeDensity[i],
        canopyCover: ecology.canopyCover[i],
        dominant: dominantSlotsToOrderedList(ecology.dominantPrimary[i], ecology.dominantSecondary[i]),
        ground: {
          soil: soilTypeCodeToName(ecology.soilType[i]),
          firmness: ecology.firmness[i],
          surfaceFlags: surfaceFlagsToOrderedList(ecology.surfaceFlags[i])
        },
        roughness: {
          obstruction: ecology.obstruction[i],
          featureFlags: featureFlagsToOrderedList(ecology.featureFlags[i])
        }
      },
      navigation: navigationTilePayloadAt(i, {
        moveCost,
        passabilityPacked: directionalPassability.passabilityPacked,
        followableFlags,
        gameTrailId: trailMarked.gameTrailId
      })
    });
  }
  envelope.tiles = tiles;

  await writeModeOutputs(
    request.mode,
    validated.outputFile,
    validated.outputDir,
    validated.debugOutputFile,
    envelope,
    validated.force
  );
}
