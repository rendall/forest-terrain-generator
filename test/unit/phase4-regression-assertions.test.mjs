import { describe, expect, it } from "vitest";
import {
  BIOME_CODE,
  FEATURE_FLAG_BIT,
  SOIL_TYPE_CODE,
  SPECIES_NONE,
  SURFACE_FLAG_BIT
} from "../../src/domain/ecology.js";
import { APPENDIX_A_DEFAULTS } from "../../src/lib/default-params.js";
import { createGridShape } from "../../src/domain/topography.js";
import { generateBaseMaps } from "../../src/pipeline/base-map-generation.js";
import { deriveTopographyFromBaseMaps } from "../../src/pipeline/derive-topography.js";
import { deriveHydrology } from "../../src/pipeline/hydrology.js";
import { deriveEcology } from "../../src/pipeline/ecology.js";

function assertFloatArrayWithin(actual, min, max) {
  for (const value of actual) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(min);
    expect(value).toBeLessThanOrEqual(max);
  }
}

describe("Phase 4 regression assertions", () => {
  it("validates categorical domains and float-map contracts", () => {
    const shape = createGridShape(16, 16);
    const seed = 42n;

    const baseMaps = generateBaseMaps(shape, seed, APPENDIX_A_DEFAULTS);
    const topography = deriveTopographyFromBaseMaps(shape, baseMaps, APPENDIX_A_DEFAULTS);
    const hydrology = deriveHydrology(shape, topography.h, topography.slopeMag, topography.landform, seed, {
      ...(APPENDIX_A_DEFAULTS.hydrology),
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

    const biomeValues = new Set(Object.values(BIOME_CODE));
    for (const value of ecology.biome) {
      expect(biomeValues.has(value)).toBe(true);
    }

    const soilValues = new Set(Object.values(SOIL_TYPE_CODE));
    for (const value of ecology.soilType) {
      expect(soilValues.has(value)).toBe(true);
    }

    const maxSurfaceMask =
      SURFACE_FLAG_BIT.standing_water |
      SURFACE_FLAG_BIT.sphagnum |
      SURFACE_FLAG_BIT.lichen |
      SURFACE_FLAG_BIT.exposed_sand |
      SURFACE_FLAG_BIT.bedrock;
    const maxFeatureMask =
      FEATURE_FLAG_BIT.fallen_log |
      FEATURE_FLAG_BIT.root_tangle |
      FEATURE_FLAG_BIT.boulder |
      FEATURE_FLAG_BIT.windthrow;

    for (const value of ecology.surfaceFlags) {
      expect((value & ~maxSurfaceMask) === 0).toBe(true);
    }
    for (const value of ecology.featureFlags) {
      expect((value & ~maxFeatureMask) === 0).toBe(true);
    }

    assertFloatArrayWithin(ecology.treeDensity, 0, 1);
    assertFloatArrayWithin(ecology.canopyCover, 0, 1);
    assertFloatArrayWithin(ecology.obstruction, 0, 1);

    for (let i = 0; i < shape.size; i += 1) {
      const primary = ecology.dominantPrimary[i];
      const secondary = ecology.dominantSecondary[i];
      const validPrimary = primary === 0 || primary === 1 || primary === 2 || primary === SPECIES_NONE;
      const validSecondary =
        secondary === 0 || secondary === 1 || secondary === 2 || secondary === SPECIES_NONE;
      expect(validPrimary).toBe(true);
      expect(validSecondary).toBe(true);
      if (primary === SPECIES_NONE) {
        expect(secondary).toBe(SPECIES_NONE);
      }
    }
  });
});
