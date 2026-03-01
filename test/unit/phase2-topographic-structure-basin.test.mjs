import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";

describe("Phase 2 topographic structure basin sweep", () => {
  it("exports basin sweep helpers and canonical Dir8 order", async () => {
    const structure = await import("../../src/pipeline/derive-topographic-structure.js");
    expect(typeof structure.deriveBasinStructure).toBe("function");
    expect(typeof structure.derivePeakStructure).toBe("function");
    expect(typeof structure.deriveTopographicStructure).toBe("function");
    expect(Array.isArray(structure.STRUCTURE_DIR8_NEIGHBORS)).toBe(true);
    expect(structure.STRUCTURE_DIR8_NEIGHBORS.map((n) => n.dir)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it("records first merge spill for losing minimum and preserves unresolved winners", async () => {
    const { deriveBasinStructure } = await import(
      "../../src/pipeline/derive-topographic-structure.js"
    );
    const shape = createGridShape(3, 1);
    const h = new Float32Array([0.0, 0.2, 0.1]);

    const out = deriveBasinStructure(shape, h, {
      connectivity: "dir8",
      hEps: 0.000001,
      persistenceMin: 0.05,
      grab: 0.35,
      unresolvedPolicy: "nan",
    });

    expect(Array.from(out.basinMinIdx)).toEqual([0, 0, 2]);
    expect(out.basinMinH[0]).toBeCloseTo(0.0, 6);
    expect(out.basinMinH[2]).toBeCloseTo(0.1, 6);

    expect(Number.isNaN(out.basinSpillH[0])).toBe(true);
    expect(out.basinSpillH[2]).toBeCloseTo(0.2, 6);

    expect(Number.isNaN(out.basinPersistence[0])).toBe(true);
    expect(out.basinPersistence[2]).toBeCloseTo(0.1, 6);

    expect(Number.isNaN(out.basinDepthLike[0])).toBe(true);
    expect(out.basinDepthLike[2]).toBeCloseTo(0.1, 6);

    expect(Array.from(out.basinLike)).toEqual([0, 0, 1]);
  });

  it("records first merge saddle for losing maximum and preserves unresolved winners", async () => {
    const { derivePeakStructure } = await import(
      "../../src/pipeline/derive-topographic-structure.js"
    );
    const shape = createGridShape(3, 1);
    const h = new Float32Array([0.2, 0.0, 0.1]);

    const out = derivePeakStructure(shape, h, {
      connectivity: "dir8",
      hEps: 0.000001,
      persistenceMin: 0.05,
      grab: 0.35,
      unresolvedPolicy: "nan",
    });

    expect(Array.from(out.peakMaxIdx)).toEqual([0, 0, 2]);
    expect(out.peakMaxH[0]).toBeCloseTo(0.2, 6);
    expect(out.peakMaxH[2]).toBeCloseTo(0.1, 6);

    expect(Number.isNaN(out.peakSaddleH[0])).toBe(true);
    expect(out.peakSaddleH[2]).toBeCloseTo(0.0, 6);

    expect(Number.isNaN(out.peakPersistence[0])).toBe(true);
    expect(out.peakPersistence[2]).toBeCloseTo(0.1, 6);

    expect(Number.isNaN(out.peakRiseLike[0])).toBe(true);
    expect(out.peakRiseLike[2]).toBeCloseTo(0.1, 6);

    expect(Array.from(out.ridgeLike)).toEqual([0, 0, 1]);
  });

  it("orchestrates basin and peak outputs and honors enabled gate", async () => {
    const { deriveTopographicStructure } = await import(
      "../../src/pipeline/derive-topographic-structure.js"
    );
    const shape = createGridShape(3, 1);
    const h = new Float32Array([0.2, 0.0, 0.1]);

    const disabled = deriveTopographicStructure(shape, h, {
      enabled: false,
      connectivity: "dir8",
      hEps: 0.000001,
      persistenceMin: 0.05,
      grab: 0.35,
      unresolvedPolicy: "nan",
    });
    expect(Array.from(disabled.basinMinIdx)).toEqual([-1, -1, -1]);
    expect(Array.from(disabled.peakMaxIdx)).toEqual([-1, -1, -1]);

    const enabled = deriveTopographicStructure(shape, h, {
      enabled: true,
      connectivity: "dir8",
      hEps: 0.000001,
      persistenceMin: 0.05,
      grab: 0.35,
      unresolvedPolicy: "nan",
    });
    expect(Array.from(enabled.basinMinIdx)).toEqual([1, 1, 1]);
    expect(Array.from(enabled.peakMaxIdx)).toEqual([0, 0, 2]);
  });

  it("resolves unresolved basin spill/persistence to max_h when policy is max_h", async () => {
    const { deriveBasinStructure } = await import(
      "../../src/pipeline/derive-topographic-structure.js"
    );
    const shape = createGridShape(3, 1);
    const h = new Float32Array([0.0, 0.2, 0.1]);

    const out = deriveBasinStructure(shape, h, {
      connectivity: "dir8",
      hEps: 0.000001,
      persistenceMin: 0.05,
      grab: 0.35,
      unresolvedPolicy: "max_h",
    });

    // The global-minimum lineage (index 0) never merges in-map; under max_h it resolves to max(h)=0.2.
    expect(out.basinSpillH[0]).toBeCloseTo(0.2, 6);
    expect(out.basinPersistence[0]).toBeCloseTo(0.2, 6);
    expect(out.basinDepthLike[0]).toBeCloseTo(0.2, 6);
    expect(out.basinLike[0]).toBe(1);

    // Losing minima still keep first-merge spill behavior.
    expect(out.basinSpillH[2]).toBeCloseTo(0.2, 6);
    expect(out.basinPersistence[2]).toBeCloseTo(0.1, 6);
    expect(out.basinLike[2]).toBe(1);
  });
});
