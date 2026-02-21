import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";

async function loadHydrologyModule() {
  return import("../../src/pipeline/hydrology.js");
}

describe("Phase 3 flow accumulation", () => {
  it("derives deterministic FA using row-major Kahn/FIFO processing", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(3, 3);
    const fd = new Uint8Array([
      0, 0, 255,
      0, 0, 255,
      0, 0, 255
    ]);

    const fa = hydrology.deriveFlowAccumulation(shape, fd);
    expect(Array.from(fa)).toEqual([
      1, 2, 3,
      1, 2, 3,
      1, 2, 3
    ]);
  });

  it("normalizes FA to [0,1] and uses exact zero for FAmax == FAmin", async () => {
    const hydrology = await loadHydrologyModule();

    const degenerate = hydrology.normalizeFlowAccumulation(new Uint32Array([7, 7, 7, 7]));
    expect(Array.from(degenerate)).toEqual([0, 0, 0, 0]);

    const normalized = hydrology.normalizeFlowAccumulation(new Uint32Array([1, 2, 4]));
    expect(normalized[0]).toBe(0);
    expect(normalized[1]).toBeCloseTo(0.5, 6);
    expect(normalized[2]).toBe(1);
    for (const value of normalized) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
