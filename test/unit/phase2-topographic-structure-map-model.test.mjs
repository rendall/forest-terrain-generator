import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";

describe("Phase 2 topographic structure map model", () => {
  it("creates typed row-major topographic structure maps with expected contracts", async () => {
    const { createTopographicStructureMaps } = await import(
      "../../src/domain/topography.js"
    );

    const shape = createGridShape(4, 3);
    const maps = createTopographicStructureMaps(shape);

    expect(maps.basinMinIdx).toBeInstanceOf(Int32Array);
    expect(maps.basinMinH).toBeInstanceOf(Float32Array);
    expect(maps.basinSpillH).toBeInstanceOf(Float32Array);
    expect(maps.basinPersistence).toBeInstanceOf(Float32Array);
    expect(maps.basinDepthLike).toBeInstanceOf(Float32Array);
    expect(maps.peakMaxIdx).toBeInstanceOf(Int32Array);
    expect(maps.peakMaxH).toBeInstanceOf(Float32Array);
    expect(maps.peakSaddleH).toBeInstanceOf(Float32Array);
    expect(maps.peakPersistence).toBeInstanceOf(Float32Array);
    expect(maps.peakRiseLike).toBeInstanceOf(Float32Array);
    expect(maps.basinLike).toBeInstanceOf(Uint8Array);
    expect(maps.ridgeLike).toBeInstanceOf(Uint8Array);

    expect(maps.basinMinIdx.length).toBe(shape.size);
    expect(maps.basinMinH.length).toBe(shape.size);
    expect(maps.basinSpillH.length).toBe(shape.size);
    expect(maps.basinPersistence.length).toBe(shape.size);
    expect(maps.basinDepthLike.length).toBe(shape.size);
    expect(maps.peakMaxIdx.length).toBe(shape.size);
    expect(maps.peakMaxH.length).toBe(shape.size);
    expect(maps.peakSaddleH.length).toBe(shape.size);
    expect(maps.peakPersistence.length).toBe(shape.size);
    expect(maps.peakRiseLike.length).toBe(shape.size);
    expect(maps.basinLike.length).toBe(shape.size);
    expect(maps.ridgeLike.length).toBe(shape.size);
  });
});
