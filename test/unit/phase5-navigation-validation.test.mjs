import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";

describe("Phase 5 navigation payload and invariant validation", () => {
  it("accepts valid map contracts and emits canonical payload shape", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(2, 2);

    const maps = {
      moveCost: new Float32Array([1, 1.2, 1.3, 1.4]),
      passabilityPacked: new Uint16Array([0, 0, 0, 0]),
      followableFlags: new Uint8Array([0, 1, 2, 3]),
      gameTrailId: new Int32Array([-1, 1, -1, 2])
    };

    navigation.validateNavigationMaps(shape, maps);

    const tile0 = navigation.navigationTilePayloadAt(0, maps);
    const tile1 = navigation.navigationTilePayloadAt(1, maps);

    expect(Object.keys(tile0)).toEqual(["moveCost", "followable", "passability"]);
    expect(tile1).toHaveProperty("gameTrailId", 1);

    const passabilityKeys = Object.keys(tile0.passability);
    expect(passabilityKeys).toEqual(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
  });

  it("rejects invalid packed passability codes", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(1, 1);

    const maps = {
      moveCost: new Float32Array([1]),
      passabilityPacked: new Uint16Array([3]), // code 3 is reserved/invalid
      followableFlags: new Uint8Array([0]),
      gameTrailId: new Int32Array([-1])
    };

    expect(() => navigation.validateNavigationMaps(shape, maps)).toThrow(
      /invalid_passability_code/
    );
  });

  it("asserts optional post-processing remains disabled in v1", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");

    expect(() => navigation.assertPostProcessingDisabled(false)).not.toThrow();
    expect(() => navigation.assertPostProcessingDisabled(true)).toThrow(
      /post_processing_disabled_v1/
    );
  });
});
