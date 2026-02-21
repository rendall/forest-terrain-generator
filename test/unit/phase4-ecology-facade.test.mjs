import { describe, expect, it } from "vitest";
import {
  BIOME_CODE,
  FEATURE_FLAG_BIT,
  SOIL_TYPE_CODE,
  SPECIES_CODE,
  SURFACE_FLAG_BIT
} from "../../src/domain/ecology.js";
import { WATER_CLASS_CODE } from "../../src/domain/hydrology.js";
import { LANDFORM_CODE, createGridShape } from "../../src/domain/topography.js";

describe("Phase 4 ecology facade", () => {
  it("exports stable facade symbols and serialization helpers", async () => {
    const ecology = await import("../../src/pipeline/ecology.js");
    const expectedFns = [
      "deriveEcology",
      "deriveBiome",
      "deriveVegetationAttributes",
      "deriveDominantSpecies",
      "deriveGround",
      "deriveRoughness",
      "dominantSlotsToOrderedList",
      "biomeCodeToName",
      "soilTypeCodeToName",
      "surfaceFlagsToOrderedList",
      "featureFlagsToOrderedList"
    ];

    for (const name of expectedFns) {
      expect(typeof ecology[name]).toBe("function");
    }
  });

  it("maps codes and bitmasks to deterministic ordered envelope values", async () => {
    const ecology = await import("../../src/pipeline/ecology.js");

    expect(ecology.biomeCodeToName(BIOME_CODE.mixed_forest)).toBe("mixed_forest");
    expect(ecology.soilTypeCodeToName(SOIL_TYPE_CODE.sandy_till)).toBe("sandy_till");
    expect(ecology.dominantSlotsToOrderedList(SPECIES_CODE.norway_spruce, SPECIES_CODE.birch)).toEqual(
      ["norway_spruce", "birch"]
    );
    expect(
      ecology.surfaceFlagsToOrderedList(
        SURFACE_FLAG_BIT.bedrock | SURFACE_FLAG_BIT.standing_water | SURFACE_FLAG_BIT.lichen
      )
    ).toEqual(["standing_water", "lichen", "bedrock"]);
    expect(
      ecology.featureFlagsToOrderedList(
        FEATURE_FLAG_BIT.windthrow | FEATURE_FLAG_BIT.fallen_log | FEATURE_FLAG_BIT.root_tangle
      )
    ).toEqual(["fallen_log", "root_tangle", "windthrow"]);
  });

  it("derives complete ecology maps via single facade pass", async () => {
    const ecology = await import("../../src/pipeline/ecology.js");
    const shape = createGridShape(3, 2);
    const waterClass = new Uint8Array([
      WATER_CLASS_CODE.none,
      WATER_CLASS_CODE.none,
      WATER_CLASS_CODE.lake,
      WATER_CLASS_CODE.stream,
      WATER_CLASS_CODE.none,
      WATER_CLASS_CODE.none
    ]);
    const h = new Float32Array([0.8, 0.3, 0.2, 0.5, 0.1, 0.2]);
    const r = new Float32Array([0.6, 0.3, 0.1, 0.4, 0.8, 0.2]);
    const v = new Float32Array([0.6, 0.5, 0.4, 0.7, 0.5, 0.3]);
    const moisture = new Float32Array([0.2, 0.6, 0.9, 0.7, 0.3, 0.8]);
    const slopeMag = new Float32Array([0.04, 0.2, 0.01, 0.03, 0.2, 0.01]);
    const landform = new Uint8Array([
      LANDFORM_CODE.ridge,
      LANDFORM_CODE.flat,
      LANDFORM_CODE.basin,
      LANDFORM_CODE.flat,
      LANDFORM_CODE.flat,
      LANDFORM_CODE.flat
    ]);

    const maps = ecology.deriveEcology(
      shape,
      { waterClass, h, r, v, moisture, slopeMag, landform },
      {
        vegVarianceNoise: { strength: 0.12 },
        ground: {
          peatMoistureThreshold: 0.7,
          standingWaterMoistureThreshold: 0.78,
          standingWaterSlopeMax: 0.04,
          lichenMoistureMax: 0.35,
          exposedSandMoistureMax: 0.4,
          bedrockHeightMin: 0.75,
          bedrockRoughnessMin: 0.55
        },
        roughnessFeatures: {
          obstructionMoistureMix: 0.15,
          windthrowThreshold: 0.7,
          fallenLogThreshold: 0.45,
          rootTangleMoistureThreshold: 0.6,
          boulderHeightMin: 0.7,
          boulderRoughnessMin: 0.6
        }
      }
    );

    expect(maps.shape).toEqual(shape);
    expect(maps.biome.length).toBe(shape.size);
    expect(maps.soilType.length).toBe(shape.size);
    expect(maps.treeDensity.length).toBe(shape.size);
    expect(maps.canopyCover.length).toBe(shape.size);
    expect(maps.obstruction.length).toBe(shape.size);
    expect(maps.surfaceFlags.length).toBe(shape.size);
    expect(maps.featureFlags.length).toBe(shape.size);
    expect(maps.dominantPrimary.length).toBe(shape.size);
    expect(maps.dominantSecondary.length).toBe(shape.size);
  });
});
