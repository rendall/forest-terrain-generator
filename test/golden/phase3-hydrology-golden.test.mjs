import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveHydrology } from "../../src/pipeline/hydrology.js";
import { APPENDIX_A_DEFAULTS } from "../../src/lib/default-params.js";
import { generateBaseMaps } from "../../src/pipeline/base-map-generation.js";
import { deriveTopographyFromBaseMaps } from "../../src/pipeline/derive-topography.js";
import { createGridShape } from "../../src/domain/topography.js";

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

async function loadSnapshot(seed, width, height) {
  const fileName = `${seed}_${width}x${height}.json`;
  const filePath = resolve(process.cwd(), "test/golden/hydrology", fileName);
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function expectFloatArrayClose(actual, expected, epsilon = 1e-6) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i += 1) {
    expect(actual[i]).toBeCloseTo(expected[i], Math.abs(Math.log10(epsilon)));
  }
}

describe("Phase 3 hydrology golden regressions", () => {
  for (const testCase of GOLDEN_CASES) {
    const { seed, width, height } = testCase;
    const title = `matches golden hydrology artifacts for seed=${seed} size=${width}x${height}`;

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

      const expected = await loadSnapshot(seed, width, height);
      expect(toArray(hydrology.fd)).toEqual(expected.fd);
      expect(toArray(hydrology.fa)).toEqual(expected.fa);
      expectFloatArrayClose(toArray(hydrology.faN), expected.faN);
      expect(toArray(hydrology.lakeMask)).toEqual(expected.lakeMask);
      expect(toArray(hydrology.isStream)).toEqual(expected.isStream);
      expect(toArray(hydrology.distWater)).toEqual(expected.distWater);
      expectFloatArrayClose(toArray(hydrology.moisture), expected.moisture);
      expect(toArray(hydrology.waterClass)).toEqual(expected.waterClass);
    });
  }
});
