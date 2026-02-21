import { describe, expect, it } from "vitest";
import { BIOME_CODE } from "../../src/domain/ecology.js";
import { WATER_CLASS_CODE } from "../../src/domain/hydrology.js";
import { createGridShape } from "../../src/domain/topography.js";

describe("Phase 4 biome derivation", () => {
  it("applies exact classification order with canonical perturbation binding", async () => {
    const { deriveBiome } = await import("../../src/pipeline/ecology.js");
    const shape = createGridShape(4, 2);
    const waterClass = new Uint8Array([
      WATER_CLASS_CODE.lake,
      WATER_CLASS_CODE.stream,
      WATER_CLASS_CODE.none,
      WATER_CLASS_CODE.none,
      WATER_CLASS_CODE.none,
      WATER_CLASS_CODE.none,
      WATER_CLASS_CODE.none,
      WATER_CLASS_CODE.none
    ]);
    const h = new Float32Array([0.5, 0.5, 0.4, 0.4, 0.4, 0.4, 0.7, 0.5]);
    const moisture = new Float32Array([0.2, 0.2, 0.85, 0.85, 0.65, 0.4, 0.2, 0.2]);
    const slopeMag = new Float32Array([0.1, 0.1, 0.02, 0.03, 0.1, 0.1, 0.04, 0.1]);
    const v = new Float32Array(shape.size).fill(0.5);

    const biome = deriveBiome(shape, waterClass, h, moisture, slopeMag, v, {
      vegVarianceNoise: { strength: 0.12 }
    });
    expect(Array.from(biome)).toEqual([
      BIOME_CODE.lake,
      BIOME_CODE.stream_bank,
      BIOME_CODE.open_bog,
      BIOME_CODE.spruce_swamp,
      BIOME_CODE.spruce_swamp,
      BIOME_CODE.mixed_forest,
      BIOME_CODE.esker_pine,
      BIOME_CODE.pine_heath
    ]);
  });

  it("uses nested perturbation strength when both nested and fallback are present", async () => {
    const { deriveBiome } = await import("../../src/pipeline/ecology.js");
    const shape = createGridShape(1, 1);
    const biome = deriveBiome(
      shape,
      new Uint8Array([WATER_CLASS_CODE.none]),
      new Float32Array([0.2]),
      new Float32Array([0.34]),
      new Float32Array([0.1]),
      new Float32Array([1.0]),
      {
        vegVarianceNoise: { strength: 0.0 },
        vegVarianceStrength: 0.2
      }
    );
    expect(biome[0]).toBe(BIOME_CODE.pine_heath);
  });

  it("uses top-level fallback perturbation strength when nested value is absent", async () => {
    const { deriveBiome } = await import("../../src/pipeline/ecology.js");
    const shape = createGridShape(1, 1);
    const biome = deriveBiome(
      shape,
      new Uint8Array([WATER_CLASS_CODE.none]),
      new Float32Array([0.2]),
      new Float32Array([0.34]),
      new Float32Array([0.1]),
      new Float32Array([1.0]),
      {
        vegVarianceStrength: 0.2
      }
    );
    expect(biome[0]).toBe(BIOME_CODE.mixed_forest);
  });
});
