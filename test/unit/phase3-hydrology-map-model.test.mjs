import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";

describe("Phase 3 hydrology map model", () => {
  it("creates typed row-major hydrology maps with expected contracts", async () => {
    const { createHydrologyMaps, WATER_CLASS_CODE, DIR8_NONE } = await import(
      "../../src/domain/hydrology.js"
    );

    const shape = createGridShape(4, 3);
    const maps = createHydrologyMaps(shape);

    expect(maps.fd).toBeInstanceOf(Uint8Array);
    expect(maps.fa).toBeInstanceOf(Uint32Array);
    expect(maps.faN).toBeInstanceOf(Float32Array);
    expect(maps.lakeMask).toBeInstanceOf(Uint8Array);
    expect(maps.isStream).toBeInstanceOf(Uint8Array);
    expect(maps.distWater).toBeInstanceOf(Uint32Array);
    expect(maps.moisture).toBeInstanceOf(Float32Array);
    expect(maps.waterClass).toBeInstanceOf(Uint8Array);
    expect(maps.inDeg).toBeInstanceOf(Uint8Array);

    expect(maps.fd.length).toBe(shape.size);
    expect(maps.fa.length).toBe(shape.size);
    expect(maps.faN.length).toBe(shape.size);
    expect(maps.lakeMask.length).toBe(shape.size);
    expect(maps.isStream.length).toBe(shape.size);
    expect(maps.distWater.length).toBe(shape.size);
    expect(maps.moisture.length).toBe(shape.size);
    expect(maps.waterClass.length).toBe(shape.size);
    expect(maps.inDeg.length).toBe(shape.size);

    expect(DIR8_NONE).toBe(255);
    expect(WATER_CLASS_CODE.none).toBe(0);
    expect(WATER_CLASS_CODE.lake).toBe(1);
    expect(WATER_CLASS_CODE.stream).toBe(2);
    expect(WATER_CLASS_CODE.marsh).toBe(3);
  });
});
