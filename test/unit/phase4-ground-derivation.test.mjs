import { describe, expect, it } from "vitest";
import { SOIL_TYPE_CODE, SURFACE_FLAG_BIT } from "../../src/domain/ecology.js";
import { LANDFORM_CODE, createGridShape } from "../../src/domain/topography.js";

describe("Phase 4 ground derivation", () => {
  it("derives SoilType, Firmness, and SurfaceFlags from locked deterministic rules", async () => {
    const { deriveGround } = await import("../../src/pipeline/ecology.js");
    const shape = createGridShape(5, 1);
    const moisture = new Float32Array([0.7, 0.34, 0.5, 0.8, 0.2]);
    const slopeMag = new Float32Array([0.1, 0.02, 0.2, 0.03, 0.01]);
    const h = new Float32Array([0.2, 0.2, 0.2, 0.2, 0.8]);
    const r = new Float32Array([0.2, 0.2, 0.2, 0.2, 0.6]);
    const landform = new Uint8Array([
      LANDFORM_CODE.flat,
      LANDFORM_CODE.ridge,
      LANDFORM_CODE.flat,
      LANDFORM_CODE.flat,
      LANDFORM_CODE.flat
    ]);

    const { soilType, firmness, surfaceFlags } = deriveGround(
      shape,
      moisture,
      slopeMag,
      h,
      r,
      landform,
      {
        peatMoistureThreshold: 0.7,
        standingWaterMoistureThreshold: 0.78,
        standingWaterSlopeMax: 0.04,
        lichenMoistureMax: 0.35,
        exposedSandMoistureMax: 0.4,
        bedrockHeightMin: 0.75,
        bedrockRoughnessMin: 0.55
      }
    );

    expect(Array.from(soilType)).toEqual([
      SOIL_TYPE_CODE.peat,
      SOIL_TYPE_CODE.sandy_till,
      SOIL_TYPE_CODE.rocky_till,
      SOIL_TYPE_CODE.peat,
      SOIL_TYPE_CODE.sandy_till
    ]);

    expect(firmness[0]).toBeCloseTo(0.42, 6);
    expect(firmness[1]).toBeCloseTo(0.726, 6);
    expect(firmness[2]).toBeCloseTo(0.575, 6);
    expect(firmness[3]).toBeCloseTo(0.334, 6);
    expect(firmness[4]).toBeCloseTo(0.8375, 6);

    expect(surfaceFlags[0]).toBe(SURFACE_FLAG_BIT.sphagnum);
    expect(surfaceFlags[1]).toBe(SURFACE_FLAG_BIT.lichen | SURFACE_FLAG_BIT.exposed_sand);
    expect(surfaceFlags[2]).toBe(0);
    expect(surfaceFlags[3]).toBe(SURFACE_FLAG_BIT.standing_water | SURFACE_FLAG_BIT.sphagnum);
    expect(surfaceFlags[4]).toBe(
      SURFACE_FLAG_BIT.lichen | SURFACE_FLAG_BIT.exposed_sand | SURFACE_FLAG_BIT.bedrock
    );
  });
});
