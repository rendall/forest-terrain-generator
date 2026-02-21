import { describe, expect, it } from "vitest";
import { WATER_CLASS_CODE } from "../../src/domain/hydrology.js";
import { createGridShape } from "../../src/domain/topography.js";

describe("Phase 5 deterministic seed selection", () => {
  it("uses water-distance fallback when no water tiles exist", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(4, 3);
    const waterClass = new Uint8Array(shape.size).fill(WATER_CLASS_CODE.none);

    const distWater = navigation.deriveTrailDistWater(shape, waterClass, {
      waterSeedMaxDist: 6
    });

    expect(Array.from(distWater)).toEqual(new Array(shape.size).fill(6));
  });

  it("computes seedCount from playable area and applies deterministic tie-break by (y,x)", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(5, 5);
    const index = (x, y) => y * shape.width + x;

    const firmness = new Float32Array(shape.size).fill(0.2);
    const moisture = new Float32Array(shape.size).fill(0.55);
    const slopeMag = new Float32Array(shape.size).fill(0.1);
    const waterClass = new Uint8Array(shape.size).fill(WATER_CLASS_CODE.none);

    // Highest score
    firmness[index(1, 1)] = 0.9;
    // Equal scores (tie broken by y,x)
    firmness[index(2, 1)] = 0.8;
    firmness[index(1, 2)] = 0.8;

    // Excluded by filter rules.
    moisture[index(2, 2)] = 0.95;
    slopeMag[index(3, 2)] = 0.31;
    waterClass[index(3, 3)] = WATER_CLASS_CODE.lake;

    const seeds = navigation.selectTrailSeeds(
      shape,
      {
        firmness,
        moisture,
        slopeMag,
        waterClass
      },
      {
        playableInset: 1,
        waterSeedMaxDist: 6,
        seedTilesPerTrail: 3
      }
    );

    expect(seeds).toEqual([index(1, 1), index(2, 1), index(1, 2)]);
  });

  it("prefers near-water candidates when other score components are equal", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(5, 5);
    const index = (x, y) => y * shape.width + x;

    const firmness = new Float32Array(shape.size).fill(0.6);
    const moisture = new Float32Array(shape.size).fill(0.55);
    const slopeMag = new Float32Array(shape.size).fill(0.1);
    const waterClass = new Uint8Array(shape.size).fill(WATER_CLASS_CODE.none);

    // Put one stream tile in playable area so distance term differs by tile.
    waterClass[index(1, 1)] = WATER_CLASS_CODE.stream;

    const seeds = navigation.selectTrailSeeds(
      shape,
      {
        firmness,
        moisture,
        slopeMag,
        waterClass
      },
      {
        playableInset: 1,
        waterSeedMaxDist: 6,
        seedTilesPerTrail: 4
      }
    );

    const near = index(1, 2); // distance 1 to stream
    const far = index(3, 3); // distance 2+ to stream

    expect(seeds).toContain(near);
    expect(seeds.indexOf(near)).toBeLessThan(seeds.indexOf(far));
  });
});
