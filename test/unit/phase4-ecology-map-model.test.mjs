import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";

describe("Phase 4 ecology map model", () => {
  it("creates typed row-major ecology maps with fixed code contracts", async () => {
    const {
      createEcologyMaps,
      BIOME_CODE,
      SOIL_TYPE_CODE,
      SURFACE_FLAG_BIT,
      FEATURE_FLAG_BIT,
      SPECIES_CODE,
      SPECIES_NONE
    } = await import("../../src/domain/ecology.js");

    const shape = createGridShape(4, 3);
    const maps = createEcologyMaps(shape);

    expect(maps.biome).toBeInstanceOf(Uint8Array);
    expect(maps.soilType).toBeInstanceOf(Uint8Array);
    expect(maps.treeDensity).toBeInstanceOf(Float32Array);
    expect(maps.canopyCover).toBeInstanceOf(Float32Array);
    expect(maps.obstruction).toBeInstanceOf(Float32Array);
    expect(maps.surfaceFlags).toBeInstanceOf(Uint16Array);
    expect(maps.featureFlags).toBeInstanceOf(Uint16Array);
    expect(maps.dominantPrimary).toBeInstanceOf(Uint8Array);
    expect(maps.dominantSecondary).toBeInstanceOf(Uint8Array);

    expect(maps.biome.length).toBe(shape.size);
    expect(maps.soilType.length).toBe(shape.size);
    expect(maps.treeDensity.length).toBe(shape.size);
    expect(maps.canopyCover.length).toBe(shape.size);
    expect(maps.obstruction.length).toBe(shape.size);
    expect(maps.surfaceFlags.length).toBe(shape.size);
    expect(maps.featureFlags.length).toBe(shape.size);
    expect(maps.dominantPrimary.length).toBe(shape.size);
    expect(maps.dominantSecondary.length).toBe(shape.size);

    expect(BIOME_CODE).toEqual({
      open_bog: 0,
      spruce_swamp: 1,
      mixed_forest: 2,
      pine_heath: 3,
      esker_pine: 4,
      lake: 5,
      stream_bank: 6
    });
    expect(SOIL_TYPE_CODE).toEqual({
      peat: 0,
      sandy_till: 1,
      rocky_till: 2
    });
    expect(SURFACE_FLAG_BIT).toEqual({
      standing_water: 1 << 0,
      sphagnum: 1 << 1,
      lichen: 1 << 2,
      exposed_sand: 1 << 3,
      bedrock: 1 << 4
    });
    expect(FEATURE_FLAG_BIT).toEqual({
      fallen_log: 1 << 0,
      root_tangle: 1 << 1,
      boulder: 1 << 2,
      windthrow: 1 << 3
    });
    expect(SPECIES_CODE).toEqual({
      scots_pine: 0,
      norway_spruce: 1,
      birch: 2
    });
    expect(SPECIES_NONE).toBe(255);

    expect(new Set(maps.dominantPrimary)).toEqual(new Set([SPECIES_NONE]));
    expect(new Set(maps.dominantSecondary)).toEqual(new Set([SPECIES_NONE]));
  });
});
