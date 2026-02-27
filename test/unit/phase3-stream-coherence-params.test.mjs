import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { resolveInputs } from "../../src/app/run-generator.js";
import { APPENDIX_A_DEFAULTS } from "../../src/lib/default-params.js";
import { WATER_CLASS_CODE } from "../../src/domain/hydrology.js";

const tempDirs = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "forest-terrain-generator-stream-params-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Phase 3 stream-coherence params contract", () => {
  it("exposes v2 stream-threshold and headwater-boost defaults", () => {
    const hydrology = APPENDIX_A_DEFAULTS.hydrology;
    expect(hydrology).toBeTypeOf("object");

    expect(hydrology.streamThresholds).toMatchObject({
      sourceAccumMin: expect.any(Number),
      channelAccumMin: expect.any(Number),
      minSlope: expect.any(Number),
      maxGapFillSteps: expect.any(Number)
    });

    expect(hydrology.streamHeadwaterBoost).toMatchObject({
      enabled: false,
      minElevationPct: expect.any(Number),
      minSlope: expect.any(Number),
      minSourceSpacing: expect.any(Number),
      maxExtraSources: expect.any(Number)
    });
  });

  it("maps legacy stream params into v2 nested stream thresholds", async () => {
    const cwd = await makeTempDir();
    const paramsPath = join(cwd, "params.json");
    await writeFile(
      paramsPath,
      `${JSON.stringify(
        {
          params: {
            hydrology: {
              streamAccumThreshold: 0.66,
              streamMinSlopeThreshold: 0.021
            }
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const resolved = await resolveInputs({
      mode: "generate",
      cwd,
      args: {
        force: false,
        paramsPath
      }
    });

    const hydrology = resolved.params.hydrology;
    expect(hydrology).toBeTypeOf("object");
    expect(hydrology.streamThresholds).toMatchObject({
      sourceAccumMin: 0.66,
      minSlope: 0.021
    });
  });

  it("includes pool in water-class codes", () => {
    expect(WATER_CLASS_CODE.pool).toBe(4);
  });
});
