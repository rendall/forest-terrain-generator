import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createGridShape, indexOf, LANDFORM_CODE } from "../../src/domain/topography.js";
import { APPENDIX_A_DEFAULTS } from "../../src/lib/default-params.js";
import { generateBaseMaps } from "../../src/pipeline/base-map-generation.js";
import { classifyLandform } from "../../src/pipeline/classify-landform.js";
import { deriveTopographyFromBaseMaps } from "../../src/pipeline/derive-topography.js";

function sha256TypedArray(array) {
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  return createHash("sha256").update(bytes).digest("hex");
}

function snapshotTopography(seed, width, height) {
  const shape = createGridShape(width, height);
  const base = generateBaseMaps(shape, seed, APPENDIX_A_DEFAULTS);
  const topo = deriveTopographyFromBaseMaps(shape, base, APPENDIX_A_DEFAULTS);
  return {
    seed: seed.toString(),
    width,
    height,
    artifacts: {
      H: sha256TypedArray(topo.h),
      R: sha256TypedArray(topo.r),
      V: sha256TypedArray(topo.v),
      SlopeMag: sha256TypedArray(topo.slopeMag),
      AspectDeg: sha256TypedArray(topo.aspectDeg),
      Landform: sha256TypedArray(topo.landform)
    }
  };
}

function loadGolden() {
  const goldenPath = resolve(process.cwd(), "test/golden/phase2-topography-golden.json");
  return JSON.parse(readFileSync(goldenPath, "utf8"));
}

describe("Phase 2 topography goldens", () => {
  it("matches committed balanced-scope snapshot hashes", () => {
    const golden = loadGolden();
    const actual = [
      snapshotTopography(1n, 16, 16),
      snapshotTopography(1n, 64, 64),
      snapshotTopography(42n, 16, 16),
      snapshotTopography(42n, 64, 64),
      snapshotTopography(123456789n, 16, 16),
      snapshotTopography(123456789n, 64, 64),
      snapshotTopography(18446744073709551615n, 16, 16),
      snapshotTopography(18446744073709551615n, 64, 64)
    ];
    expect(actual).toEqual(golden.entries);
  });

  it("handles 1xN and Nx1 boundary fixtures with finite outputs", () => {
    const shapes = [createGridShape(1, 8), createGridShape(8, 1)];
    for (const shape of shapes) {
      const base = generateBaseMaps(shape, 42n, APPENDIX_A_DEFAULTS);
      const topo = deriveTopographyFromBaseMaps(shape, base, APPENDIX_A_DEFAULTS);
      for (let i = 0; i < shape.size; i += 1) {
        expect(Number.isFinite(topo.h[i])).toBe(true);
        expect(Number.isFinite(topo.r[i])).toBe(true);
        expect(Number.isFinite(topo.v[i])).toBe(true);
        expect(Number.isFinite(topo.slopeMag[i])).toBe(true);
        expect(Number.isFinite(topo.aspectDeg[i])).toBe(true);
      }
    }
  });

  it("uses strict threshold handling in near-threshold fixtures", () => {
    const shape = createGridShape(3, 3);
    const h = new Float32Array([
      0.75001, 0.75001, 0.75001,
      0.75001, 0.5, 0.75001,
      0.75001, 0.75001, 0.75001
    ]);
    const center = indexOf(shape, 1, 1);

    const params = {
      landform: {
        eps: 0.25,
        flatSlopeThreshold: 0.25
      }
    };

    const slopeFlat = new Float32Array(shape.size).fill(0.24999);
    const landformFlat = classifyLandform(shape, h, slopeFlat, params);
    expect(landformFlat[center]).toBe(LANDFORM_CODE.basin);

    const slopeNonFlat = new Float32Array(shape.size).fill(0.25);
    const landformNonFlat = classifyLandform(shape, h, slopeNonFlat, params);
    expect(landformNonFlat[center]).toBe(LANDFORM_CODE.basin);
  });
});
