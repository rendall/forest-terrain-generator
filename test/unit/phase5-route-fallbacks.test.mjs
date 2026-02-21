import { describe, expect, it } from "vitest";
import { WATER_CLASS_CODE } from "../../src/domain/hydrology.js";
import { LANDFORM_CODE, createGridShape } from "../../src/domain/topography.js";

describe("Phase 5 route fallback behavior", () => {
  it("returns no seeds and no requests when candidate filtering yields none", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(5, 5);

    const firmness = new Float32Array(shape.size).fill(0.6);
    const moisture = new Float32Array(shape.size).fill(0.95); // fails candidate filter
    const slopeMag = new Float32Array(shape.size).fill(0.1);
    const waterClass = new Uint8Array(shape.size).fill(WATER_CLASS_CODE.none);
    const faN = new Float32Array(shape.size).fill(0);
    const landform = new Uint8Array(shape.size).fill(LANDFORM_CODE.flat);

    const plan = navigation.buildTrailPlan(
      shape,
      {
        seed: { firmness, moisture, slopeMag, waterClass },
        endpoint: { waterClass, faN, landform, slopeMag }
      },
      {
        seed: {
          playableInset: 1,
          waterSeedMaxDist: 6,
          seedTilesPerTrail: 3
        },
        endpoint: {
          streamEndpointAccumThreshold: 0.7,
          ridgeEndpointMaxSlope: 0.12
        }
      }
    );

    expect(plan.seedIndices).toEqual([]);
    expect(plan.routeRequests).toEqual([]);
  });

  it("skips unreachable requests and continues processing later requests", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(3, 3);

    const cost = new Float32Array(shape.size).fill(1);
    const inf = 1000;

    // First request endpoint is non-traversable; second remains reachable.
    cost[2] = inf;
    const routeRequests = [
      { kind: "seed_to_water", seedIndex: 0, endpointIndex: 2 },
      { kind: "seed_to_ridge", seedIndex: 0, endpointIndex: 8 }
    ];

    const result = navigation.executeTrailRouteRequests(shape, cost, routeRequests, {
      inf,
      diagWeight: 1.41421356237,
      tieEps: 0.000001
    });

    expect(result.requested).toBe(2);
    expect(result.skippedUnreachable).toBe(1);
    expect(result.successfulPaths).toEqual([[0, 4, 8]]);
  });
});
