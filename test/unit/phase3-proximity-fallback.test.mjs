import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";

async function loadHydrologyModule() {
  return import("../../src/pipeline/hydrology.js");
}

describe("Phase 3 proximity fallbacks", () => {
  it("sets distWater to waterProxMaxDist when no water tiles exist", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(4, 3);
    const lakeMask = new Uint8Array(shape.size).fill(0);
    const isStream = new Uint8Array(shape.size).fill(0);

    const distWater = hydrology.deriveDistWater(shape, lakeMask, isStream, {
      waterProxMaxDist: 6
    });
    expect(Array.from(distWater)).toEqual(new Array(shape.size).fill(6));
  });

  it("sets distStream to streamProxMaxDist when no stream tiles exist", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(4, 3);
    const isStream = new Uint8Array(shape.size).fill(0);

    const distStream = hydrology.deriveDistStream(shape, isStream, {
      streamProxMaxDist: 5
    });
    expect(Array.from(distStream)).toEqual(new Array(shape.size).fill(5));
  });

  it("uses fallback distance in moisture prox term (wet_prox=0 at max dist)", async () => {
    const hydrology = await loadHydrologyModule();
    const shape = createGridShape(1, 1);

    const moisture = hydrology.deriveMoisture(
      shape,
      new Float32Array([0.2]),
      new Float32Array([0.08]),
      new Uint32Array([6]),
      {
        moistureAccumStart: 0.35,
        flatnessThreshold: 0.06,
        waterProxMaxDist: 6,
        weights: {
          accum: 0.55,
          flat: 0.25,
          prox: 0.2
        }
      }
    );

    expect(moisture[0]).toBe(0);
  });
});
