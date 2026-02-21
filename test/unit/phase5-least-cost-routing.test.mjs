import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";

describe("Phase 5 least-cost routing", () => {
  it("returns null when start or end is non-traversable", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(3, 3);
    const cost = new Float32Array(shape.size).fill(1);
    cost[0] = 1000;

    const path = navigation.findLeastCostPath(shape, cost, 0, 8, {
      inf: 1000,
      diagWeight: 1.41421356237,
      tieEps: 0.000001
    });

    expect(path).toBeNull();
  });

  it("uses deterministic queue tie-breaks on equal-cost paths", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(2, 2);

    // Start=0, End=3. Two equal-cost cardinal routes with diag discouraged.
    const cost = new Float32Array([
      1, 1,
      1, 1
    ]);

    const path = navigation.findLeastCostPath(shape, cost, 0, 3, {
      inf: 1000,
      diagWeight: 10,
      tieEps: 0.000001
    });

    // Tie should resolve through (1,0) first due queue ordering by (y,x).
    expect(path).toEqual([0, 1, 3]);
  });

  it("applies strict-better relaxation with tieEps boundary", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(2, 2);

    // Route through E is discovered first but is slightly more expensive than route through S
    // by less than tieEps; strict-better rule keeps first predecessor.
    const cost = new Float32Array([
      1,
      1.0000004,
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
});
