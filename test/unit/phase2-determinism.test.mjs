import { describe, expect, it } from "vitest";
import { createGridShape, indexOf, LANDFORM_CODE } from "../../src/domain/topography.js";
import { createPermutationTable } from "../../src/lib/perlin2d.js";
import { subSeed } from "../../src/lib/sub-seed.js";
import { classifyLandform } from "../../src/pipeline/classify-landform.js";
import { deriveSlopeAspect } from "../../src/pipeline/derive-slope-aspect.js";

describe("Phase 2 determinism and tie behavior", () => {
  it("uses row-major index ordering", () => {
    const shape = createGridShape(3, 2);
    expect(indexOf(shape, 0, 0)).toBe(0);
    expect(indexOf(shape, 1, 0)).toBe(1);
    expect(indexOf(shape, 2, 0)).toBe(2);
    expect(indexOf(shape, 0, 1)).toBe(3);
    expect(indexOf(shape, 2, 1)).toBe(5);
  });

  it("produces deterministic subSeed and permutation tables", () => {
    const seedA = subSeed(42n, "H", 1);
    const seedB = subSeed(42n, "H", 1);
    const seedC = subSeed(42n, "H", 2);
    expect(seedA).toBe(seedB);
    expect(seedA).not.toBe(seedC);

    const perm1 = createPermutationTable(seedA);
    const perm2 = createPermutationTable(seedA);
    const perm3 = createPermutationTable(seedC);
    expect(Array.from(perm1)).toEqual(Array.from(perm2));
    expect(Array.from(perm1)).not.toEqual(Array.from(perm3));
  });

  it("uses strict comparison semantics for eps and flat threshold", () => {
    const shape = createGridShape(3, 3);
    const h = new Float32Array([
      0.75, 0.75, 0.75,
      0.75, 0.5, 0.75,
      0.75, 0.75, 0.75
    ]);
    const slopeMag = new Float32Array(shape.size).fill(0.25);
    const params = {
      landform: {
        eps: 0.25,
        flatSlopeThreshold: 0.25
      }
    };

    const landform = classifyLandform(shape, h, slopeMag, params);
    const center = indexOf(shape, 1, 1);

    // slope equals threshold => non-flat branch; neighbors equal center+eps => not "higher"
    expect(landform[center]).toBe(LANDFORM_CODE.slope);
  });

  it("sets AspectDeg sentinel 0 for flat tiles", () => {
    const shape = createGridShape(4, 4);
    const h = new Float32Array(shape.size).fill(0.5);
    const { aspectDeg, slopeMag } = deriveSlopeAspect(shape, h);

    for (let i = 0; i < shape.size; i += 1) {
      expect(slopeMag[i]).toBe(0);
      expect(aspectDeg[i]).toBe(0);
    }
  });
});
