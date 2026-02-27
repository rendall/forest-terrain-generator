import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";

async function loadHydrologyModule() {
  return import("../../src/pipeline/hydrology.js");
}

describe("Phase 3 lake coherence metrics", () => {
  it("exports deriveLakeCoherenceMetrics", async () => {
    const hydrology = await loadHydrologyModule();
    expect(typeof hydrology.deriveLakeCoherenceMetrics).toBe("function");
  });

  it("derives adopted lake-coherence metric fields", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(4, 1);
    const lakeMask = new Uint8Array([1, 0, 1, 1]);
    const h = new Float32Array([0.6, 0.4, 0.3, 0.3]);

    const metrics = hydrology.deriveLakeCoherenceMetrics(shape, lakeMask, h, {
      boundaryEps: 0.0005,
    });

    expect(metrics).toMatchObject({
      componentCount: 2,
      singletonCount: 1,
      largestComponentSize: 2,
      largestComponentShare: 0.5,
      totalLakeShare: 0.75,
      boundaryViolationCount: 1,
    });
  });
});
