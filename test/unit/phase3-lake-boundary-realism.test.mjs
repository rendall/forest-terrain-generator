import { describe, expect, it } from "vitest";
import { createGridShape, indexOf } from "../../src/domain/topography.js";

async function loadHydrologyModule() {
  return import("../../src/pipeline/hydrology.js");
}

describe("Phase 3 lake boundary realism", () => {
  it("exports boundary realism and lake-surface helpers", async () => {
    const hydrology = await loadHydrologyModule();
    const expected = [
      "deriveLakeBoundaryViolations",
      "applyBoundaryRealismTrimFirst",
      "applyLakeBoundaryRealism",
      "validateLakeBoundaryRealism",
      "deriveLakeSurfaceH",
    ];
    for (const fn of expected) {
      expect(typeof hydrology[fn]).toBe("function");
    }
  });

  it("detects boundary violations for perched lake edges", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(2, 1);
    const h = new Float32Array([0.6, 0.4]);
    const lakeMask = new Uint8Array([1, 0]);
    const violations = hydrology.deriveLakeBoundaryViolations(shape, lakeMask, h, {
      boundaryEps: 0.0005,
    });

    expect(violations).toEqual([0]);
  });

  it("trims violating boundary tiles in trim-first mode", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(2, 1);
    const h = new Float32Array([0.6, 0.4]);
    const lakeMask = new Uint8Array([1, 0]);
    const repaired = hydrology.applyBoundaryRealismTrimFirst(shape, lakeMask, h, {
      boundaryEps: 0.0005,
    });

    expect(Array.from(repaired)).toEqual([0, 0]);
  });

  it("fails validation when violations remain", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(2, 1);
    const h = new Float32Array([0.6, 0.4]);
    const lakeMask = new Uint8Array([1, 0]);

    expect(() =>
      hydrology.validateLakeBoundaryRealism(shape, lakeMask, h, {
        boundaryEps: 0.0005,
      }),
    ).toThrow(/lake_boundary_realism/);
  });

  it("bypasses boundary repair and validation when lake coherence is globally disabled", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(2, 1);
    const h = new Float32Array([0.6, 0.4]);
    const lakeMask = new Uint8Array([1, 0]);

    const repaired = hydrology.applyLakeBoundaryRealism(shape, lakeMask, h, {
      enabled: false,
    });
    expect(Array.from(repaired)).toEqual([1, 0]);

    expect(() =>
      hydrology.validateLakeBoundaryRealism(shape, lakeMask, h, {
        enabled: false,
      }),
    ).not.toThrow();
  });

  it("assigns deterministic component lakeSurfaceH and sets non-lake tiles to 0", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(3, 2);
    const h = new Float32Array([
      0.4, 0.2, 0.7,
      0.6, 0.1, 0.8,
    ]);
    const lakeMask = new Uint8Array([
      1, 1, 0,
      0, 1, 0,
    ]);

    const surface = hydrology.deriveLakeSurfaceH(shape, lakeMask, h);
    const expectedSurface = 0.4;

    expect(surface[indexOf(shape, 0, 0)]).toBeCloseTo(expectedSurface, 6);
    expect(surface[indexOf(shape, 1, 0)]).toBeCloseTo(expectedSurface, 6);
    expect(surface[indexOf(shape, 1, 1)]).toBeCloseTo(expectedSurface, 6);
    expect(surface[indexOf(shape, 2, 0)]).toBe(0);
    expect(surface[indexOf(shape, 2, 1)]).toBe(0);
  });
});
