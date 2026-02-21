import { describe, expect, it } from "vitest";

describe("Phase 5 navigation payload mapping", () => {
  it("omits navigation.gameTrailId for sentinel -1 and emits it for non-negative ids", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");

    const inputs = {
      moveCost: new Float32Array([1.2, 1.4]),
      passabilityPacked: new Uint16Array([0, 0]),
      followableFlags: new Uint8Array([0, 0]),
      gameTrailId: new Int32Array([-1, 7])
    };

    const tile0 = navigation.navigationTilePayloadAt(0, inputs);
    const tile1 = navigation.navigationTilePayloadAt(1, inputs);

    expect(tile0).not.toHaveProperty("gameTrailId");
    expect(tile1).toHaveProperty("gameTrailId", 7);
  });
});
