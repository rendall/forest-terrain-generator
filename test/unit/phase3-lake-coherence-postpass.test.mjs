import { describe, expect, it } from "vitest";
import { createGridShape, indexOf } from "../../src/domain/topography.js";

async function loadHydrologyModule() {
  return import("../../src/pipeline/hydrology.js");
}

function maskFromCoords(shape, coords) {
  const mask = new Uint8Array(shape.size);
  for (const [x, y] of coords) {
    mask[indexOf(shape, x, y)] = 1;
  }
  return mask;
}

describe("Phase 3 lake coherence post-pass", () => {
  it("exports deterministic lake-coherence helper functions", async () => {
    const hydrology = await loadHydrologyModule();
    const expected = [
      "deriveLakeComponents",
      "applyMicroLakePolicy",
      "applyLakeComponentBridging",
      "applyLakeCoherence",
    ];
    for (const fn of expected) {
      expect(typeof hydrology[fn]).toBe("function");
    }
  });

  it("removes micro-lakes in remove mode", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(5, 1);
    const mask = new Uint8Array([1, 0, 0, 1, 1]);
    const out = hydrology.applyMicroLakePolicy(shape, mask, {
      enabled: true,
      microLakeMaxSize: 1,
      microLakeMode: "remove",
      bridgeEnabled: true,
      maxBridgeDistance: 1,
      repairSingletons: true,
      enforceBoundaryRealism: true,
      boundaryEps: 0.0005,
      boundaryRepairMode: "trim_first",
    });
    expect(Array.from(out)).toEqual([0, 0, 0, 1, 1]);
  });

  it("bridges nearby lake components deterministically", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(5, 1);
    const mask = new Uint8Array([1, 0, 1, 0, 1]);
    const out = hydrology.applyLakeComponentBridging(shape, mask, {
      enabled: true,
      microLakeMaxSize: 2,
      microLakeMode: "merge",
      bridgeEnabled: true,
      maxBridgeDistance: 1,
      repairSingletons: true,
      enforceBoundaryRealism: true,
      boundaryEps: 0.0005,
      boundaryRepairMode: "trim_first",
    });
    expect(Array.from(out)).toEqual([1, 1, 1, 0, 1]);
  });

  it("bypasses lake coherence post-pass when disabled", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(4, 4);
    const mask = maskFromCoords(shape, [
      [0, 0],
      [3, 3],
      [1, 2],
    ]);

    const out = hydrology.applyLakeCoherence(shape, mask, {
      enabled: false,
      microLakeMaxSize: 2,
      microLakeMode: "merge",
      bridgeEnabled: true,
      maxBridgeDistance: 1,
      repairSingletons: true,
      enforceBoundaryRealism: true,
      boundaryEps: 0.0005,
      boundaryRepairMode: "trim_first",
    });

    expect(Array.from(out)).toEqual(Array.from(mask));
  });
});
