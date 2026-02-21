import { describe, expect, it } from "vitest";
import {
  FEATURE_FLAG_BIT,
  SOIL_TYPE_CODE,
  SPECIES_CODE,
  SPECIES_NONE,
  SURFACE_FLAG_BIT
} from "../../src/domain/ecology.js";
import { WATER_CLASS_CODE } from "../../src/domain/hydrology.js";
import { LANDFORM_CODE, createGridShape } from "../../src/domain/topography.js";
import {
  deriveBiome,
  deriveDominantSpecies,
  deriveGround,
  deriveRoughness,
  dominantSlotsToOrderedList,
  featureFlagsToOrderedList,
  surfaceFlagsToOrderedList
} from "../../src/pipeline/ecology.js";

describe("Phase 4 ecology sanity fixtures", () => {
  it("covers threshold-edge behavior with float32 boundary inputs", () => {
    const shape = createGridShape(3, 1);
    const biome = deriveBiome(
      shape,
      new Uint8Array([WATER_CLASS_CODE.none, WATER_CLASS_CODE.none, WATER_CLASS_CODE.none]),
      new Float32Array([0.2, 0.2, 0.7]),
      new Float32Array([0.85, 0.4, 0.2]),
      new Float32Array([0.03, 0.1, 0.05]),
      new Float32Array([0.5, 0.5, 0.5]),
      { vegVarianceNoise: { strength: 0.12 } }
    );
    expect(Array.from(biome)).toEqual([
      // 0.85 with slope boundary 0.03 => spruce_swamp (not open_bog)
      1,
      // 0.4 boundary => mixed_forest
      2,
      // H=0.7 and slope boundary 0.05 => not esker_pine
      3
    ]);
  });

  it("covers mixed-forest dominant-species split boundary", () => {
    const shape = createGridShape(2, 1);
    const biome = new Uint8Array([2, 2]);
    const moisture = new Float32Array([0.52, 0.51]);
    const out = deriveDominantSpecies(shape, biome, moisture);
    expect(Array.from(out.dominantPrimary)).toEqual([
      SPECIES_CODE.norway_spruce,
      SPECIES_CODE.birch
    ]);
    expect(Array.from(out.dominantSecondary)).toEqual([
      SPECIES_CODE.birch,
      SPECIES_CODE.norway_spruce
    ]);
  });

  it("covers deterministic list ordering for dominant/surface/feature outputs", () => {
    expect(dominantSlotsToOrderedList(SPECIES_CODE.norway_spruce, SPECIES_CODE.birch)).toEqual([
      "norway_spruce",
      "birch"
    ]);
    expect(
      surfaceFlagsToOrderedList(
        SURFACE_FLAG_BIT.exposed_sand | SURFACE_FLAG_BIT.standing_water | SURFACE_FLAG_BIT.lichen
      )
    ).toEqual(["standing_water", "lichen", "exposed_sand"]);
    expect(
      featureFlagsToOrderedList(
        FEATURE_FLAG_BIT.windthrow | FEATURE_FLAG_BIT.fallen_log | FEATURE_FLAG_BIT.root_tangle
      )
    ).toEqual(["fallen_log", "root_tangle", "windthrow"]);
  });

  it("covers multi-flag combinations and empty-list cases", () => {
    const shape = createGridShape(2, 1);
    const ground = deriveGround(
      shape,
      new Float32Array([0.8, 0.2]),
      new Float32Array([0.02, 0.01]),
      new Float32Array([0.2, 0.8]),
      new Float32Array([0.2, 0.6]),
      new Uint8Array([LANDFORM_CODE.flat, LANDFORM_CODE.flat]),
      {
        peatMoistureThreshold: 0.7,
        standingWaterMoistureThreshold: 0.78,
        standingWaterSlopeMax: 0.04,
        lichenMoistureMax: 0.35,
        exposedSandMoistureMax: 0.4,
        bedrockHeightMin: 0.75,
        bedrockRoughnessMin: 0.55
      }
    );
    expect(ground.soilType[0]).toBe(SOIL_TYPE_CODE.peat);
    expect(ground.surfaceFlags[0]).toBe(SURFACE_FLAG_BIT.standing_water | SURFACE_FLAG_BIT.sphagnum);
    expect(surfaceFlagsToOrderedList(ground.surfaceFlags[1])).toEqual([
      "lichen",
      "exposed_sand",
      "bedrock"
    ]);

    const rough = deriveRoughness(
      shape,
      new Float32Array([0.8, 0.1]),
      new Float32Array([0.9, 0.1]),
      new Float32Array([0.8, 0.1]),
      {
        obstructionMoistureMix: 0.15,
        windthrowThreshold: 0.7,
        fallenLogThreshold: 0.45,
        rootTangleMoistureThreshold: 0.6,
        boulderHeightMin: 0.7,
        boulderRoughnessMin: 0.6
      }
    );
    expect(featureFlagsToOrderedList(rough.featureFlags[0])).toEqual([
      "fallen_log",
      "root_tangle",
      "boulder",
      "windthrow"
    ]);
    expect(featureFlagsToOrderedList(rough.featureFlags[1])).toEqual([]);
    expect(dominantSlotsToOrderedList(SPECIES_NONE, SPECIES_NONE)).toEqual([]);
  });
});
