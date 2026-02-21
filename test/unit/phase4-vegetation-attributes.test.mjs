import { describe, expect, it } from "vitest";
import { BIOME_CODE } from "../../src/domain/ecology.js";
import { createGridShape } from "../../src/domain/topography.js";

describe("Phase 4 vegetation attributes", () => {
  it("derives TreeDensity and CanopyCover from normative formulas", async () => {
    const { deriveVegetationAttributes } = await import("../../src/pipeline/ecology.js");
    const shape = createGridShape(3, 1);
    const biome = new Uint8Array([
      BIOME_CODE.mixed_forest,
      BIOME_CODE.spruce_swamp,
      BIOME_CODE.esker_pine
    ]);
    const moisture = new Float32Array([0.8, 1.0, 0.0]);
    const v = new Float32Array([0.7, 1.0, 0.0]);

    const { treeDensity, canopyCover } = deriveVegetationAttributes(shape, biome, moisture, v);

    expect(treeDensity[0]).toBeCloseTo(0.594, 6);
    expect(canopyCover[0]).toBeCloseTo(0.6264, 6);

    expect(treeDensity[1]).toBeCloseTo(0.89, 6);
    expect(canopyCover[1]).toBeCloseTo(0.834, 6);

    expect(treeDensity[2]).toBeCloseTo(0.21, 6);
    expect(canopyCover[2]).toBeCloseTo(0.296, 6);
  });

  it("keeps TreeDensity and CanopyCover clamped to [0,1]", async () => {
    const { deriveVegetationAttributes } = await import("../../src/pipeline/ecology.js");
    const shape = createGridShape(1, 1);
    const biome = new Uint8Array([BIOME_CODE.spruce_swamp]);
    const moisture = new Float32Array([100]);
    const v = new Float32Array([100]);

    const { treeDensity, canopyCover } = deriveVegetationAttributes(shape, biome, moisture, v);
    expect(treeDensity[0]).toBe(1);
    expect(canopyCover[0]).toBeCloseTo(0.9, 6);
  });
});
