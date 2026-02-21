import { describe, expect, it } from "vitest";
import { WATER_CLASS_CODE } from "../../src/domain/hydrology.js";
import { LANDFORM_CODE, createGridShape } from "../../src/domain/topography.js";

const BASE_PARAMS = {
  playableInset: 1,
  inf: 1000,
  wSlope: 4.0,
  slopeScale: 0.18,
  wMoist: 3.0,
  moistStart: 0.55,
  wObs: 2.0,
  wRidge: 0.35,
  wStreamProx: 0.25,
  streamProxMaxDist: 5,
  wCross: 0.65,
  wMarsh: 1.25
};

describe("Phase 5 trail preference cost field", () => {
  it("uses stream-distance fallback when no stream tiles exist", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(4, 3);
    const isStream = new Uint8Array(shape.size).fill(0);

    const distStream = navigation.deriveTrailDistStream(shape, isStream, {
      streamProxMaxDist: 5
    });

    expect(Array.from(distStream)).toEqual(new Array(shape.size).fill(5));
  });

  it("computes deterministic C with stream proximity, ridge bonus, and non-playable INF", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(5, 5);

    const slopeMag = new Float32Array(shape.size).fill(0);
    const moisture = new Float32Array(shape.size).fill(0);
    const obstruction = new Float32Array(shape.size).fill(0);
    const landform = new Uint8Array(shape.size).fill(LANDFORM_CODE.flat);
    const waterClass = new Uint8Array(shape.size).fill(WATER_CLASS_CODE.none);
    const isStream = new Uint8Array(shape.size).fill(0);

    const index = (x, y) => y * shape.width + x;

    isStream[index(2, 2)] = 1;
    waterClass[index(2, 2)] = WATER_CLASS_CODE.stream;
    landform[index(2, 1)] = LANDFORM_CODE.ridge;

    const cost = navigation.deriveTrailPreferenceCost(
      shape,
      {
        slopeMag,
        moisture,
        obstruction,
        landform,
        waterClass,
        isStream
      },
      BASE_PARAMS
    );

    expect(cost[index(1, 1)]).toBeCloseTo(0.8, 6);
    expect(cost[index(2, 1)]).toBeCloseTo(0.45, 6);
    expect(cost[index(2, 2)]).toBeCloseTo(1.4, 6);
    expect(cost[index(0, 0)]).toBeGreaterThanOrEqual(BASE_PARAMS.inf);
  });

  it("does not mutate source maps while computing C", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(3, 3);

    const slopeMag = new Float32Array(shape.size).fill(0.2);
    const moisture = new Float32Array(shape.size).fill(0.7);
    const obstruction = new Float32Array(shape.size).fill(0.4);
    const landform = new Uint8Array(shape.size).fill(LANDFORM_CODE.slope);
    const waterClass = new Uint8Array(shape.size).fill(WATER_CLASS_CODE.marsh);
    const isStream = new Uint8Array(shape.size).fill(0);

    const before = {
      slopeMag: Array.from(slopeMag),
      moisture: Array.from(moisture),
      obstruction: Array.from(obstruction),
      landform: Array.from(landform),
      waterClass: Array.from(waterClass),
      isStream: Array.from(isStream)
    };

    navigation.deriveTrailPreferenceCost(
      shape,
      {
        slopeMag,
        moisture,
        obstruction,
        landform,
        waterClass,
        isStream
      },
      BASE_PARAMS
    );

    expect(Array.from(slopeMag)).toEqual(before.slopeMag);
    expect(Array.from(moisture)).toEqual(before.moisture);
    expect(Array.from(obstruction)).toEqual(before.obstruction);
    expect(Array.from(landform)).toEqual(before.landform);
    expect(Array.from(waterClass)).toEqual(before.waterClass);
    expect(Array.from(isStream)).toEqual(before.isStream);
  });
});
