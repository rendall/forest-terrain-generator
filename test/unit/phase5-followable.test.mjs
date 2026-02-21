import { describe, expect, it } from "vitest";
import { WATER_CLASS_CODE } from "../../src/domain/hydrology.js";
import { LANDFORM_CODE, createGridShape } from "../../src/domain/topography.js";

describe("Phase 5 followable derivation", () => {
  it("derives followable flags with canonical order and dedup", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(3, 3);
    const index = (x, y) => y * shape.width + x;

    const waterClass = new Uint8Array(shape.size).fill(WATER_CLASS_CODE.none);
    const landform = new Uint8Array(shape.size).fill(LANDFORM_CODE.flat);
    const gameTrail = new Uint8Array(shape.size).fill(0);

    // Tile (1,1): stream + ridge + game_trail.
    waterClass[index(1, 1)] = WATER_CLASS_CODE.stream;
    landform[index(1, 1)] = LANDFORM_CODE.ridge;
    gameTrail[index(1, 1)] = 1;

    // Lake diagonal neighbor gives shore via 8-way adjacency.
    waterClass[index(2, 2)] = WATER_CLASS_CODE.lake;

    const followable = navigation.deriveFollowableFlags(shape, {
      waterClass,
      landform,
      gameTrail
    });

    expect(navigation.followableFlagsToOrderedList(followable[index(1, 1)])).toEqual([
      "stream",
      "ridge",
      "game_trail",
      "shore"
    ]);
  });

  it("applies shore on diagonal lake adjacency and excludes lake tile itself", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(3, 3);
    const index = (x, y) => y * shape.width + x;

    const waterClass = new Uint8Array(shape.size).fill(WATER_CLASS_CODE.none);
    const landform = new Uint8Array(shape.size).fill(LANDFORM_CODE.flat);
    const gameTrail = new Uint8Array(shape.size).fill(0);

    waterClass[index(2, 2)] = WATER_CLASS_CODE.lake;

    const followable = navigation.deriveFollowableFlags(shape, {
      waterClass,
      landform,
      gameTrail
    });

    expect(navigation.followableFlagsToOrderedList(followable[index(1, 1)])).toEqual(["shore"]);
    expect(navigation.followableFlagsToOrderedList(followable[index(2, 2)])).toEqual([]);
  });

  it("returns empty list for tiles with no followable sources", async () => {
    const navigation = await import("../../src/pipeline/navigation.js");
    const shape = createGridShape(2, 2);

    const followable = navigation.deriveFollowableFlags(shape, {
      waterClass: new Uint8Array(shape.size).fill(WATER_CLASS_CODE.none),
      landform: new Uint8Array(shape.size).fill(LANDFORM_CODE.flat),
      gameTrail: new Uint8Array(shape.size).fill(0)
    });

    expect(navigation.followableFlagsToOrderedList(followable[0])).toEqual([]);
  });
});
