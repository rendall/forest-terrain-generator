import { describe, expect, it } from "vitest";
import { createGridShape, indexOf, LANDFORM_CODE } from "../../src/domain/topography.js";

async function loadHydrologyModule() {
  // This module is expected to be implemented in Phase 3.
  return import("../../src/pipeline/hydrology.js");
}

function hasDirectedCycle(shape, fd) {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Uint8Array(shape.size).fill(WHITE);

  const DIR_TO_DELTA = {
    0: [1, 0], // E
    1: [1, 1], // SE
    2: [0, 1], // S
    3: [-1, 1], // SW
    4: [-1, 0], // W
    5: [-1, -1], // NW
    6: [0, -1], // N
    7: [1, -1] // NE
  };

  function downstreamIndex(i) {
    const dir = fd[i];
    if (dir === 255) {
      return -1;
    }
    const x = i % shape.width;
    const y = Math.floor(i / shape.width);
    const [dx, dy] = DIR_TO_DELTA[dir] ?? [0, 0];
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
      return -1;
    }
    return indexOf(shape, nx, ny);
  }

  function dfs(i) {
    color[i] = GRAY;
    const d = downstreamIndex(i);
    if (d !== -1) {
      if (color[d] === GRAY) {
        return true;
      }
      if (color[d] === WHITE && dfs(d)) {
        return true;
      }
    }
    color[i] = BLACK;
    return false;
  }

  for (let i = 0; i < shape.size; i += 1) {
    if (color[i] === WHITE && dfs(i)) {
      return true;
    }
  }
  return false;
}

describe("Phase 3 hydrology sanity (red tests before implementation)", () => {
  it("exports planned hydrology entrypoints", async () => {
    const hydrology = await loadHydrologyModule();
    const expected = [
      "tieBreakHash64",
      "deriveFlowDirection",
      "deriveFlowAccumulation",
      "normalizeFlowAccumulation",
      "deriveLakeMask",
      "deriveStreamMask",
      "deriveDistWater",
      "deriveMoisture",
      "classifyWaterClass"
    ];
    for (const fn of expected) {
      expect(typeof hydrology[fn]).toBe("function");
    }
  });

  it("uses deterministic hash-based tie-break for equal-drop candidates", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(3, 3);
    const h = new Float32Array([
      1.2, 1.2, 1.2,
      1.2, 1.0, 0.8,
      1.2, 0.8, 1.2
    ]);
    const params = {
      minDropThreshold: 0.1,
      tieEps: 0.000001
    };
    const seed = 42n;

    const fd1 = hydrology.deriveFlowDirection(shape, h, seed, params);
    const fd2 = hydrology.deriveFlowDirection(shape, h, seed, params);
    expect(Array.from(fd1)).toEqual(Array.from(fd2));

    const center = indexOf(shape, 1, 1);
    const tied = [0, 2]; // E, S in Dir8 order for this fixture
    const expectedDir = tied[Number(hydrology.tieBreakHash64(seed, 1, 1) % BigInt(tied.length))];
    expect(fd1[center]).toBe(expectedDir);
  });

  it("produces acyclic flow-direction graphs", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(4, 4);
    const h = new Float32Array([
      1.0, 0.9, 0.8, 0.7,
      1.0, 0.9, 0.8, 0.7,
      1.0, 0.9, 0.8, 0.7,
      1.0, 0.9, 0.8, 0.7
    ]);
    const fd = hydrology.deriveFlowDirection(shape, h, 7n, {
      minDropThreshold: 0.0005,
      tieEps: 0.000001
    });
    expect(hasDirectedCycle(shape, fd)).toBe(false);
  });

  it("applies no-water fallback for distWater", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(5, 4);
    const lakeMask = new Uint8Array(shape.size).fill(0);
    const isStream = new Uint8Array(shape.size).fill(0);
    const distWater = hydrology.deriveDistWater(shape, lakeMask, isStream, {
      waterProxMaxDist: 6
    });
    for (let i = 0; i < shape.size; i += 1) {
      expect(distWater[i]).toBe(6);
    }
  });

  it("applies exact threshold semantics for lake and stream masks", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(2, 1);
    const landform = new Uint8Array([LANDFORM_CODE.basin, LANDFORM_CODE.basin]);
    const slopeMag = new Float32Array([0.03, 0.029]);
    const faN = new Float32Array([0.65, 0.65]);

    const lakeMask = hydrology.deriveLakeMask(shape, landform, slopeMag, faN, {
      lakeFlatSlopeThreshold: 0.03,
      lakeAccumThreshold: 0.65
    });
    expect(Array.from(lakeMask)).toEqual([0, 1]);

    const isStream = hydrology.deriveStreamMask(shape, lakeMask, faN, slopeMag, {
      streamAccumThreshold: 0.65,
      streamMinSlopeThreshold: 0.03
    });
    // lake override + inclusive stream thresholds
    expect(Array.from(isStream)).toEqual([1, 0]);
  });
});
