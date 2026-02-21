import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";
import { APPENDIX_A_DEFAULTS } from "../../src/lib/default-params.js";
import { generateBaseMaps } from "../../src/pipeline/base-map-generation.js";
import { deriveTopographyFromBaseMaps } from "../../src/pipeline/derive-topography.js";
import { deriveHydrology } from "../../src/pipeline/hydrology.js";
import { deriveEcology } from "../../src/pipeline/ecology.js";
import {
  buildTrailPlan,
  deriveDirectionalPassability,
  deriveFollowableFlags,
  deriveMoveCost,
  deriveTrailPreferenceCost,
  executeTrailRouteRequests,
  markTrailPaths
} from "../../src/pipeline/navigation.js";

function sha256TypedArray(array) {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  return createHash("sha256").update(bytes).digest("hex");
}

function snapshotNavigation(seed, width, height) {
  const shape = createGridShape(width, height);
  const baseMaps = generateBaseMaps(shape, seed, APPENDIX_A_DEFAULTS);
  const topography = deriveTopographyFromBaseMaps(shape, baseMaps, APPENDIX_A_DEFAULTS);
  const hydrology = deriveHydrology(shape, topography.h, topography.slopeMag, topography.landform, seed, {
    ...APPENDIX_A_DEFAULTS.hydrology,
    streamProxMaxDist: APPENDIX_A_DEFAULTS.gameTrails.streamProxMaxDist
  });
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
    {
      vegVarianceNoise: { strength: APPENDIX_A_DEFAULTS.vegVarianceNoise.strength },
      ground: APPENDIX_A_DEFAULTS.ground,
      roughnessFeatures: APPENDIX_A_DEFAULTS.roughnessFeatures
    }
  );

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
      playableInset: APPENDIX_A_DEFAULTS.grid.playableInset,
      inf: APPENDIX_A_DEFAULTS.gameTrails.inf,
      wSlope: APPENDIX_A_DEFAULTS.gameTrails.wSlope,
      slopeScale: APPENDIX_A_DEFAULTS.gameTrails.slopeScale,
      wMoist: APPENDIX_A_DEFAULTS.gameTrails.wMoist,
      moistStart: APPENDIX_A_DEFAULTS.gameTrails.moistStart,
      wObs: APPENDIX_A_DEFAULTS.gameTrails.wObs,
      wRidge: APPENDIX_A_DEFAULTS.gameTrails.wRidge,
      wStreamProx: APPENDIX_A_DEFAULTS.gameTrails.wStreamProx,
      streamProxMaxDist: APPENDIX_A_DEFAULTS.gameTrails.streamProxMaxDist,
      wCross: APPENDIX_A_DEFAULTS.gameTrails.wCross,
      wMarsh: APPENDIX_A_DEFAULTS.gameTrails.wMarsh
    }
  );

  const plan = buildTrailPlan(
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
        playableInset: APPENDIX_A_DEFAULTS.grid.playableInset,
        waterSeedMaxDist: APPENDIX_A_DEFAULTS.gameTrails.waterSeedMaxDist,
        seedTilesPerTrail: APPENDIX_A_DEFAULTS.gameTrails.seedTilesPerTrail
      },
      endpoint: {
        streamEndpointAccumThreshold: APPENDIX_A_DEFAULTS.gameTrails.streamEndpointAccumThreshold,
        ridgeEndpointMaxSlope: APPENDIX_A_DEFAULTS.gameTrails.ridgeEndpointMaxSlope
      }
    }
  );

  const routed = executeTrailRouteRequests(shape, trailCost, plan.routeRequests, {
    inf: APPENDIX_A_DEFAULTS.gameTrails.inf,
    diagWeight: APPENDIX_A_DEFAULTS.gameTrails.diagWeight,
    tieEps: APPENDIX_A_DEFAULTS.hydrology.tieEps
  });

  const marked = markTrailPaths(shape, routed.successfulPaths);
  const moveCost = deriveMoveCost(
    shape,
    {
      obstruction: ecology.obstruction,
      moisture: hydrology.moisture,
      waterClass: hydrology.waterClass,
      biome: ecology.biome,
      gameTrail: marked.gameTrail
    },
    {
      moveCostObstructionMax: APPENDIX_A_DEFAULTS.movement.moveCostObstructionMax,
      moveCostMoistureMax: APPENDIX_A_DEFAULTS.movement.moveCostMoistureMax,
      marshMoveCostMultiplier: APPENDIX_A_DEFAULTS.movement.marshMoveCostMultiplier,
      openBogMoveCostMultiplier: APPENDIX_A_DEFAULTS.movement.openBogMoveCostMultiplier,
      gameTrailMoveCostMultiplier: APPENDIX_A_DEFAULTS.gameTrails.gameTrailMoveCostMultiplier
    }
  );
  const passability = deriveDirectionalPassability(
    shape,
    {
      h: topography.h,
      moisture: hydrology.moisture,
      slopeMag: topography.slopeMag,
      waterClass: hydrology.waterClass,
      playableInset: APPENDIX_A_DEFAULTS.grid.playableInset
    },
    {
      steepBlockDelta: APPENDIX_A_DEFAULTS.movement.steepBlockDelta,
      steepDifficultDelta: APPENDIX_A_DEFAULTS.movement.steepDifficultDelta,
      cliffSlopeMin: APPENDIX_A_DEFAULTS.movement.cliffSlopeMin
    }
  );
  const followable = deriveFollowableFlags(shape, {
    waterClass: hydrology.waterClass,
    landform: topography.landform,
    gameTrail: marked.gameTrail
  });

  return {
    seed: seed.toString(),
    width,
    height,
    artifacts: {
      C: sha256TypedArray(trailCost),
      GameTrail: sha256TypedArray(marked.gameTrail),
      GameTrailId: sha256TypedArray(marked.gameTrailId),
      MoveCost: sha256TypedArray(moveCost),
      Passability: sha256TypedArray(passability.passabilityPacked),
      CliffEdge: sha256TypedArray(passability.cliffEdgePacked),
      Followable: sha256TypedArray(followable)
    }
  };
}

function loadGolden() {
  const goldenPath = resolve(process.cwd(), "test/golden/phase5-navigation-golden.json");
  return JSON.parse(readFileSync(goldenPath, "utf8"));
}

describe("Phase 5 navigation goldens", () => {
  it("matches committed balanced-scope snapshot hashes", () => {
    const golden = loadGolden();
    const actual = [
      snapshotNavigation(1n, 16, 16),
      snapshotNavigation(1n, 64, 64),
      snapshotNavigation(42n, 16, 16),
      snapshotNavigation(42n, 64, 64),
      snapshotNavigation(123456789n, 16, 16),
      snapshotNavigation(123456789n, 64, 64),
      snapshotNavigation(18446744073709551615n, 16, 16),
      snapshotNavigation(18446744073709551615n, 64, 64)
    ];
    expect(actual).toEqual(golden.entries);
  });
});
