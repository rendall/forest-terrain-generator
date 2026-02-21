import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";
import * as hydrology from "../../src/pipeline/hydrology.js";

describe("Phase 3 traversal-order conformance", () => {
  it("exposes canonical Dir8 order helper", () => {
    expect(hydrology.CANONICAL_DIR8_ORDER).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("exposes row-major full-grid enumeration helper", () => {
    const shape = createGridShape(3, 2);
    expect(hydrology.enumerateRowMajorIndices(shape)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("enumerates valid neighbors in canonical Dir8 order", () => {
    const shape = createGridShape(3, 3);
    expect(hydrology.enumerateNeighborIndices(shape, 4)).toEqual([5, 8, 7, 6, 3, 0, 1, 2]);
    expect(hydrology.enumerateNeighborIndices(shape, 0)).toEqual([1, 4, 3]);
  });
});
