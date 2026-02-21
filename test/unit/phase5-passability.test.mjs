import { describe, expect, it } from "vitest";
import { WATER_CLASS_CODE } from "../../src/domain/hydrology.js";
import { createGridShape } from "../../src/domain/topography.js";

describe("Phase 5 directional passability", () => {
  it("derives packed passability and cliff edge from ordered rules", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(3, 3);
    const index = (x, y) => y * shape.width + x;

    const h = new Float32Array([
      0.45, 0.5, 0.63,
      0.45, 0.5, 0.73,
      0.45, 0.45, 0.45
    ]);
    const moisture = new Float32Array(shape.size).fill(0.5);
    const slopeMag = new Float32Array(shape.size).fill(0.05);
    slopeMag[index(1, 1)] = 0.2;
    const waterClass = new Uint8Array(shape.size).fill(WATER_CLASS_CODE.none);
    waterClass[index(2, 2)] = WATER_CLASS_CODE.lake;

    const pass = navigation.deriveDirectionalPassability(
      shape,
      {
        h,
        moisture,
        slopeMag,
        waterClass,
        playableInset: 0
      },
      {
        steepBlockDelta: 0.22,
        steepDifficultDelta: 0.12,
        cliffSlopeMin: 0.18
      }
    );

    const centerPass = navigation.passabilityPackedToObject(pass.passabilityPacked[index(1, 1)]);
    expect(centerPass).toEqual({
      N: "passable",
      NE: "difficult",
      E: "blocked",
      SE: "blocked",
      S: "passable",
      SW: "passable",
      W: "passable",
      NW: "passable"
    });

    const cliffDirs = navigation.cliffEdgePackedToObject(pass.cliffEdgePacked[index(1, 1)]);
    expect(cliffDirs).toEqual({
      N: false,
      NE: false,
      E: true,
      SE: false,
      S: false,
      SW: false,
      W: false,
      NW: false
    });
  });

  it("marks out-of-bounds directions as blocked", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(2, 2);

    const h = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    const moisture = new Float32Array(shape.size).fill(0.1);
    const slopeMag = new Float32Array(shape.size).fill(0.01);
    const waterClass = new Uint8Array(shape.size).fill(WATER_CLASS_CODE.none);

    const pass = navigation.deriveDirectionalPassability(
      shape,
      {
        h,
        moisture,
        slopeMag,
        waterClass,
        playableInset: 0
      },
      {
        steepBlockDelta: 0.22,
        steepDifficultDelta: 0.12,
        cliffSlopeMin: 0.18
      }
    );

    const topLeft = navigation.passabilityPackedToObject(pass.passabilityPacked[0]);
    expect(topLeft.N).toBe("blocked");
    expect(topLeft.NE).toBe("blocked");
    expect(topLeft.W).toBe("blocked");
    expect(topLeft.NW).toBe("blocked");
  });

  it("applies suction-bog difficult rule before steepness checks", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(3, 3);
    const index = (x, y) => y * shape.width + x;

    const h = new Float32Array(shape.size).fill(0.9);
    h[index(1, 1)] = 0.5;
    const moisture = new Float32Array(shape.size).fill(0.2);
    moisture[index(1, 1)] = 0.95;
    const slopeMag = new Float32Array(shape.size).fill(0.2);
    slopeMag[index(1, 1)] = 0.02;
    const waterClass = new Uint8Array(shape.size).fill(WATER_CLASS_CODE.none);

    const pass = navigation.deriveDirectionalPassability(
      shape,
      {
        h,
        moisture,
        slopeMag,
        waterClass,
        playableInset: 0
      },
      {
        steepBlockDelta: 0.22,
        steepDifficultDelta: 0.12,
        cliffSlopeMin: 0.18
      }
    );

    const center = navigation.passabilityPackedToObject(pass.passabilityPacked[index(1, 1)]);
    expect(center).toEqual({
      N: "difficult",
      NE: "difficult",
      E: "difficult",
      SE: "difficult",
      S: "difficult",
      SW: "difficult",
      W: "difficult",
      NW: "difficult"
    });
  });
});
