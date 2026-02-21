import { describe, expect, it } from "vitest";
import { BIOME_CODE } from "../../src/domain/ecology.js";
import { WATER_CLASS_CODE } from "../../src/domain/hydrology.js";
import { createGridShape } from "../../src/domain/topography.js";

describe("Phase 5 movement cost derivation", () => {
  it("applies obstruction/moisture multipliers with marsh, open-bog, and trail modifiers", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(1, 1);

    const moveCost = navigation.deriveMoveCost(
      shape,
      {
        obstruction: new Float32Array([1]),
        moisture: new Float32Array([1]),
        waterClass: new Uint8Array([WATER_CLASS_CODE.marsh]),
        biome: new Uint8Array([BIOME_CODE.open_bog]),
        gameTrail: new Uint8Array([1])
      },
      {
        moveCostObstructionMax: 1.35,
        moveCostMoistureMax: 1.25,
        marshMoveCostMultiplier: 1.15,
        openBogMoveCostMultiplier: 1.2,
        gameTrailMoveCostMultiplier: 0.85
      }
    );

    expect(moveCost[0]).toBeCloseTo(1.9794375, 7);
  });

  it("does not apply marsh/open-bog multipliers for unrelated tiles", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(1, 1);

    const moveCost = navigation.deriveMoveCost(
      shape,
      {
        obstruction: new Float32Array([0]),
        moisture: new Float32Array([0]),
        waterClass: new Uint8Array([WATER_CLASS_CODE.none]),
        biome: new Uint8Array([BIOME_CODE.pine_heath]),
        gameTrail: new Uint8Array([0])
      },
      {
        moveCostObstructionMax: 1.35,
        moveCostMoistureMax: 1.25,
        marshMoveCostMultiplier: 1.15,
        openBogMoveCostMultiplier: 1.2,
        gameTrailMoveCostMultiplier: 0.85
      }
    );

    expect(moveCost[0]).toBeCloseTo(1.0, 7);
  });

  it("applies trail modifier only when GameTrail is true", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(2, 1);

    const moveCost = navigation.deriveMoveCost(
      shape,
      {
        obstruction: new Float32Array([0.5, 0.5]),
        moisture: new Float32Array([0.5, 0.5]),
        waterClass: new Uint8Array([WATER_CLASS_CODE.none, WATER_CLASS_CODE.none]),
        biome: new Uint8Array([BIOME_CODE.mixed_forest, BIOME_CODE.mixed_forest]),
        gameTrail: new Uint8Array([1, 0])
      },
      {
        moveCostObstructionMax: 1.35,
        moveCostMoistureMax: 1.25,
        marshMoveCostMultiplier: 1.15,
        openBogMoveCostMultiplier: 1.2,
        gameTrailMoveCostMultiplier: 0.85
      }
    );

    expect(moveCost[0]).toBeLessThan(moveCost[1]);
  });
});
