import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";

describe("Phase 5 trail marking semantics", () => {
  it("marks GameTrail as union of all paths and keeps first-writer GameTrailId on overlap", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(3, 3);

    const paths = [
      [0, 1, 2],
      [2, 5, 8],
      [0, 3, 6]
    ];

    const marked = navigation.markTrailPaths(shape, paths);

    expect(Array.from(marked.gameTrail)).toEqual([
      1, 1, 1,
      1, 0, 1,
      1, 0, 1
    ]);

    expect(Array.from(marked.gameTrailId)).toEqual([
      0, 0, 0,
      2, -1, 1,
      2, -1, 1
    ]);
  });

  it("returns empty trail maps when no paths are supplied", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(2, 2);

    const marked = navigation.markTrailPaths(shape, []);

    expect(Array.from(marked.gameTrail)).toEqual([0, 0, 0, 0]);
    expect(Array.from(marked.gameTrailId)).toEqual([-1, -1, -1, -1]);
  });
});
