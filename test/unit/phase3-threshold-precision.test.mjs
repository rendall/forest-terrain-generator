import { describe, expect, it } from "vitest";
import { LANDFORM_CODE, createGridShape } from "../../src/domain/topography.js";
import { deriveLakeMask, deriveStreamMask } from "../../src/pipeline/hydrology.js";

describe("Phase 3 threshold precision", () => {
  it("applies inclusive thresholds against float32 map values without precision drift", () => {
    const shape = createGridShape(2, 1);
    const landform = new Uint8Array([LANDFORM_CODE.basin, LANDFORM_CODE.basin]);
    const slopeMag = new Float32Array([0.03, 0.029]);
    const faN = new Float32Array([0.65, 0.65]);

    const lakeMask = deriveLakeMask(shape, landform, slopeMag, faN, {
      lakeFlatSlopeThreshold: 0.03,
      lakeAccumThreshold: 0.65
    });
    expect(Array.from(lakeMask)).toEqual([0, 1]);

    const isStream = deriveStreamMask(shape, lakeMask, faN, slopeMag, {
      streamThresholds: {
        sourceAccumMin: 0.65,
        channelAccumMin: 0.65,
        minSlope: 0.03
      }
    });
    expect(Array.from(isStream)).toEqual([1, 0]);
  });
});
