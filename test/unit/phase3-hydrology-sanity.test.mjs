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
      "deriveDistStream",
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

  it("uses FA_N=0 when FAmax equals FAmin", async () => {
    const hydrology = await loadHydrologyModule();
    const fa = new Uint32Array([7, 7, 7, 7]);
    const faN = hydrology.normalizeFlowAccumulation(fa);
    expect(Array.from(faN)).toEqual([0, 0, 0, 0]);
  });

  it("keeps FD values in Dir8 domain or NONE", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(5, 5);
    const h = new Float32Array([
      1.0, 0.9, 0.8, 0.7, 0.6,
      1.0, 0.9, 0.8, 0.7, 0.6,
      1.0, 0.9, 0.8, 0.7, 0.6,
      1.0, 0.9, 0.8, 0.7, 0.6,
      1.0, 0.9, 0.8, 0.7, 0.6
    ]);
    const fd = hydrology.deriveFlowDirection(shape, h, 99n, {
      minDropThreshold: 0.0005,
      tieEps: 0.000001
    });
    for (const dir of fd) {
      expect((dir >= 0 && dir <= 7) || dir === 255).toBe(true);
    }
  });

  it("applies no-stream fallback for distStream", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(4, 4);
    const isStream = new Uint8Array(shape.size).fill(0);
    const distStream = hydrology.deriveDistStream(shape, isStream, {
      streamProxMaxDist: 5
    });
    for (let i = 0; i < shape.size; i += 1) {
      expect(distStream[i]).toBe(5);
    }
  });

  it("applies water-class precedence lake > stream > marsh > none", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(1, 1);
    const slopeLow = new Float32Array([0.01]);
    const slopeHigh = new Float32Array([0.2]);
    const moistureHigh = new Float32Array([0.9]);
    const moistureLow = new Float32Array([0.1]);
    const params = {
      marshMoistureThreshold: 0.78,
      marshSlopeThreshold: 0.04
    };

    const lakeOverAll = hydrology.classifyWaterClass(
      shape,
      new Uint8Array([1]),
      new Uint8Array([1]),
      moistureHigh,
      slopeLow,
      params
    )[0];
    const streamOverMarsh = hydrology.classifyWaterClass(
      shape,
      new Uint8Array([0]),
      new Uint8Array([1]),
      moistureHigh,
      slopeLow,
      params
    )[0];
    const marshOnly = hydrology.classifyWaterClass(
      shape,
      new Uint8Array([0]),
      new Uint8Array([0]),
      moistureHigh,
      slopeLow,
      params
    )[0];
    const none = hydrology.classifyWaterClass(
      shape,
      new Uint8Array([0]),
      new Uint8Array([0]),
      moistureLow,
      slopeHigh,
      params
    )[0];

    expect(lakeOverAll).not.toBe(streamOverMarsh);
    expect(streamOverMarsh).not.toBe(marshOnly);
    expect(marshOnly).not.toBe(none);
  });

  it("is deterministic across repeated full hydrology runs", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(4, 4);
    const h = new Float32Array([
      1.0, 0.9, 0.8, 0.7,
      1.0, 0.9, 0.8, 0.7,
      1.0, 0.9, 0.8, 0.7,
      1.0, 0.9, 0.8, 0.7
    ]);
    const slopeMag = new Float32Array(shape.size).fill(0.02);
    const landform = new Uint8Array(shape.size).fill(LANDFORM_CODE.flat);
    const params = {
      minDropThreshold: 0.0005,
      tieEps: 0.000001,
      lakeFlatSlopeThreshold: 0.03,
      lakeAccumThreshold: 0.65,
      streamAccumThreshold: 0.55,
      streamMinSlopeThreshold: 0.01,
      waterProxMaxDist: 6,
      moistureAccumStart: 0.35,
      flatnessThreshold: 0.06,
      weights: { accum: 0.55, flat: 0.25, prox: 0.2 },
      marshMoistureThreshold: 0.78,
      marshSlopeThreshold: 0.04
    };
    const seed = 123n;

    const fdA = hydrology.deriveFlowDirection(shape, h, seed, params);
    const faA = hydrology.deriveFlowAccumulation(shape, fdA);
    const faNA = hydrology.normalizeFlowAccumulation(faA);
    const lakeA = hydrology.deriveLakeMask(shape, landform, slopeMag, faNA, params);
    const streamA = hydrology.deriveStreamMask(shape, lakeA, faNA, slopeMag, params);
    const distWaterA = hydrology.deriveDistWater(shape, lakeA, streamA, params);
    const moistureA = hydrology.deriveMoisture(shape, faNA, slopeMag, distWaterA, params);
    const wcA = hydrology.classifyWaterClass(shape, lakeA, streamA, moistureA, slopeMag, params);

    const fdB = hydrology.deriveFlowDirection(shape, h, seed, params);
    const faB = hydrology.deriveFlowAccumulation(shape, fdB);
    const faNB = hydrology.normalizeFlowAccumulation(faB);
    const lakeB = hydrology.deriveLakeMask(shape, landform, slopeMag, faNB, params);
    const streamB = hydrology.deriveStreamMask(shape, lakeB, faNB, slopeMag, params);
    const distWaterB = hydrology.deriveDistWater(shape, lakeB, streamB, params);
    const moistureB = hydrology.deriveMoisture(shape, faNB, slopeMag, distWaterB, params);
    const wcB = hydrology.classifyWaterClass(shape, lakeB, streamB, moistureB, slopeMag, params);

    expect(Array.from(fdA)).toEqual(Array.from(fdB));
    expect(Array.from(faA)).toEqual(Array.from(faB));
    expect(Array.from(faNA)).toEqual(Array.from(faNB));
    expect(Array.from(lakeA)).toEqual(Array.from(lakeB));
    expect(Array.from(streamA)).toEqual(Array.from(streamB));
    expect(Array.from(distWaterA)).toEqual(Array.from(distWaterB));
    expect(Array.from(moistureA)).toEqual(Array.from(moistureB));
    expect(Array.from(wcA)).toEqual(Array.from(wcB));
  });
});
