import { describe, expect, it } from "vitest";
import { BIOME_CODE, SPECIES_CODE, SPECIES_NONE } from "../../src/domain/ecology.js";
import { createGridShape } from "../../src/domain/topography.js";

describe("Phase 4 dominant species", () => {
  it("derives dominant primary/secondary slots for every normative branch", async () => {
    const { deriveDominantSpecies } = await import("../../src/pipeline/ecology.js");
    const shape = createGridShape(9, 1);
    const biome = new Uint8Array([
      BIOME_CODE.pine_heath,
      BIOME_CODE.esker_pine,
      BIOME_CODE.spruce_swamp,
      BIOME_CODE.mixed_forest,
      BIOME_CODE.mixed_forest,
      BIOME_CODE.stream_bank,
      BIOME_CODE.open_bog,
      BIOME_CODE.open_bog,
      BIOME_CODE.lake
    ]);
    const moisture = new Float32Array([0.3, 0.3, 0.9, 0.52, 0.51, 0.5, 0.75, 0.74, 0.5]);

    const { dominantPrimary, dominantSecondary } = deriveDominantSpecies(shape, biome, moisture);

    expect(Array.from(dominantPrimary)).toEqual([
      SPECIES_CODE.scots_pine,
      SPECIES_CODE.scots_pine,
      SPECIES_CODE.norway_spruce,
      SPECIES_CODE.norway_spruce,
      SPECIES_CODE.birch,
      SPECIES_CODE.birch,
      SPECIES_NONE,
      SPECIES_CODE.birch,
      SPECIES_NONE
    ]);
    expect(Array.from(dominantSecondary)).toEqual([
      SPECIES_NONE,
      SPECIES_NONE,
      SPECIES_NONE,
      SPECIES_CODE.birch,
      SPECIES_CODE.norway_spruce,
      SPECIES_NONE,
      SPECIES_NONE,
      SPECIES_NONE,
      SPECIES_NONE
    ]);
  });

  it("maps dominant slots to ordered output species lists", async () => {
    const { dominantSlotsToOrderedList } = await import("../../src/pipeline/ecology.js");

    expect(dominantSlotsToOrderedList(SPECIES_NONE, SPECIES_NONE)).toEqual([]);
    expect(dominantSlotsToOrderedList(SPECIES_CODE.scots_pine, SPECIES_NONE)).toEqual([
      "scots_pine"
    ]);
    expect(
      dominantSlotsToOrderedList(SPECIES_CODE.norway_spruce, SPECIES_CODE.birch)
    ).toEqual(["norway_spruce", "birch"]);
  });
});
