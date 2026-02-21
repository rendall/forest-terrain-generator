import { describe, expect, it } from "vitest";
import { createGridShape, indexOf } from "../../src/domain/topography.js";

async function loadHydrologyModule() {
  return import("../../src/pipeline/hydrology.js");
}

describe("Phase 3 flow direction", () => {
  it("matches normative tieBreakHash64 vectors", async () => {
    const hydrology = await loadHydrologyModule();
    const vectors = [
      [0n, 0, 0, 0n],
      [1n, 0, 0, 6238072747940578789n],
      [42n, 1, 1, 7160109091909588253n],
      [123456789n, 63, 17, 9672262271120887731n],
      [18446744073709551615n, 15, 31, 10179000537863991047n]
    ];

    for (const [seed, x, y, expected] of vectors) {
      expect(hydrology.tieBreakHash64(seed, x, y)).toBe(expected);
    }
  });

  it("uses deterministic hash tie-break over canonical tied candidates", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(3, 3);
    const h = new Float32Array([
      1.2, 1.2, 1.2,
      1.2, 1.0, 0.8,
      1.2, 0.8, 1.2
    ]);
    const seed = 42n;
    const params = { minDropThreshold: 0.1, tieEps: 0.000001 };

    const fdA = hydrology.deriveFlowDirection(shape, h, seed, params);
    const fdB = hydrology.deriveFlowDirection(shape, h, seed, params);
    expect(Array.from(fdA)).toEqual(Array.from(fdB));

    const center = indexOf(shape, 1, 1);
    const tiedCandidates = [0, 2];
    const expected =
      tiedCandidates[Number(hydrology.tieBreakHash64(seed, 1, 1) % BigInt(tiedCandidates.length))];
    expect(fdA[center]).toBe(expected);

    for (const dir of fdA) {
      expect((dir >= 0 && dir <= 7) || dir === hydrology.DIR8_NONE).toBe(true);
    }
  });

  it("builds tie candidates from true maxDrop when tieEps is non-trivial", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(3, 3);
    const center = indexOf(shape, 1, 1);

    // Center height = 2.0.
    // Drops in canonical Dir8 order at center:
    // E=1.00, SE=1.09, S=1.15, others < minDropThreshold or not tied.
    // With tieEps=0.1, T must contain SE and S (dirs 1 and 2), but not E.
    const h = new Float32Array([
      2.0, 2.0, 2.0,
      2.0, 2.0, 1.0,
      2.0, 0.85, 0.91
    ]);
    const seed = 123n;
    const params = { minDropThreshold: 0.1, tieEps: 0.1 };

    const fd = hydrology.deriveFlowDirection(shape, h, seed, params);

    const tiedCandidates = [1, 2];
    const expected =
      tiedCandidates[Number(hydrology.tieBreakHash64(seed, 1, 1) % BigInt(tiedCandidates.length))];
    expect(fd[center]).toBe(expected);
  });
});
