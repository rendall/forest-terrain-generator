import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { APPENDIX_A_DEFAULTS } from "../../src/lib/default-params.js";
import { createGridShape } from "../../src/domain/topography.js";
import { generateBaseMaps } from "../../src/pipeline/base-map-generation.js";
import { deriveTopographyFromBaseMaps } from "../../src/pipeline/derive-topography.js";
import { deriveHydrology } from "../../src/pipeline/hydrology.js";
import { deriveEcology, dominantSlotsToOrderedList } from "../../src/pipeline/ecology.js";

const GOLDEN_CASES = [
  { seed: "1", width: 16, height: 16 },
  { seed: "42", width: 16, height: 16 },
  { seed: "123456789", width: 16, height: 16 },
  { seed: "18446744073709551615", width: 16, height: 16 },
  { seed: "1", width: 64, height: 64 },
  { seed: "42", width: 64, height: 64 },
  { seed: "123456789", width: 64, height: 64 },
  { seed: "18446744073709551615", width: 64, height: 64 }
];

function toArray(values) {
  return Array.from(values);
}

function toDominantLists(primary, secondary) {
  const out = [];
  for (let i = 0; i < primary.length; i += 1) {
    out.push(dominantSlotsToOrderedList(primary[i], secondary[i]));
  }
  return out;
}

async function loadSnapshot(seed, width, height) {
  const fileName = `${seed}_${width}x${height}.json`;
  const filePath = resolve(process.cwd(), "test/golden/ecology", fileName);
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function expectFloatArrayClose(actual, expected, epsilon = 1e-6) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i += 1) {
    expect(actual[i]).toBeCloseTo(expected[i], Math.abs(Math.log10(epsilon)));
  }
}

describe("Phase 4 ecology golden regressions", () => {
  for (const testCase of GOLDEN_CASES) {
    const { seed, width, height } = testCase;
    const title = `matches golden ecology artifacts for seed=${seed} size=${width}x${height}`;

    it(title, async () => {
      const shape = createGridShape(width, height);
      const seedBigInt = BigInt(seed);

      const baseMaps = generateBaseMaps(shape, seedBigInt, APPENDIX_A_DEFAULTS);
      const topography = deriveTopographyFromBaseMaps(shape, baseMaps, APPENDIX_A_DEFAULTS);
      const hydrology = deriveHydrology(
        shape,
        topography.h,
        topography.slopeMag,
        topography.landform,
        seedBigInt,
        {
          ...(APPENDIX_A_DEFAULTS.hydrology),
          streamProxMaxDist: APPENDIX_A_DEFAULTS.gameTrails.streamProxMaxDist
        }
      );
      const ecology = deriveEcology(
        shape,
        {
          waterClass: hydrology.waterClass,
          h: topography.h,
          r: topography.r,
          v: topography.v,
          moisture: hydrology.moisture,
          slopeMag: topography.slopeMag,
          landform: topography.landform
        },
        {
          vegVarianceNoise: { strength: APPENDIX_A_DEFAULTS.vegVarianceNoise.strength },
          ground: APPENDIX_A_DEFAULTS.ground,
          roughnessFeatures: APPENDIX_A_DEFAULTS.roughnessFeatures
        }
      );

      const expected = await loadSnapshot(seed, width, height);
      expect(toArray(ecology.biome)).toEqual(expected.biome);
      expect(toArray(ecology.soilType)).toEqual(expected.soilType);
      expectFloatArrayClose(toArray(ecology.treeDensity), expected.treeDensity);
      expectFloatArrayClose(toArray(ecology.canopyCover), expected.canopyCover);
      expectFloatArrayClose(toArray(ecology.obstruction), expected.obstruction);
      expect(toArray(ecology.surfaceFlags)).toEqual(expected.surfaceFlags);
      expect(toArray(ecology.featureFlags)).toEqual(expected.featureFlags);
      expect(toDominantLists(ecology.dominantPrimary, ecology.dominantSecondary)).toEqual(
        expected.dominant
      );
    });
  }
});
