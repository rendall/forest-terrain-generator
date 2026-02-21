import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";

describe("Phase 5 deterministic route ordering and tieEps boundaries", () => {
  it("treats cost delta exactly equal to tieEps as equal (yx tie-break remains stable)", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(2, 2);

    const cost = new Float32Array([
      1,
      1.000001,
      1,
      1
    ]);

    const path = navigation.findLeastCostPath(shape, cost, 0, 3, {
      inf: 1000,
      diagWeight: 10,
      tieEps: 0.000001
    });

    expect(path).toEqual([0, 1, 3]);
  });

  it("treats cost delta above tieEps as strictly better for lower-cost alternative", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(2, 2);

    const cost = new Float32Array([
      1,
      1.0000012,
      1,
      1
    ]);

    const path = navigation.findLeastCostPath(shape, cost, 0, 3, {
      inf: 1000,
      diagWeight: 10,
      tieEps: 0.000001
    });

    expect(path).toEqual([0, 2, 3]);
  });

  it("preserves route request order while skipping unreachable requests", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(3, 3);
    const cost = new Float32Array(shape.size).fill(1);
    const inf = 1000;

    cost[2] = inf; // first request unreachable

    const routed = navigation.executeTrailRouteRequests(
      shape,
      cost,
      [
        { kind: "seed_to_water", seedIndex: 0, endpointIndex: 2 },
        { kind: "seed_to_ridge", seedIndex: 0, endpointIndex: 8 },
        { kind: "seed_to_ridge", seedIndex: 8, endpointIndex: 0 }
      ],
      {
        inf,
        diagWeight: 1.41421356237,
        tieEps: 0.000001
      }
    );

    expect(routed.skippedUnreachable).toBe(1);
    expect(routed.successfulPaths).toEqual([
      [0, 4, 8],
      [8, 4, 0]
    ]);
  });
});
