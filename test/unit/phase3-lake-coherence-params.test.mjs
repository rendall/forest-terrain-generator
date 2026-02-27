import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { resolveInputs } from "../../src/app/run-generator.js";
import { APPENDIX_A_DEFAULTS } from "../../src/lib/default-params.js";

const tempDirs = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "forest-terrain-generator-lake-params-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Phase 3 lake-coherence params contract", () => {
  it("exposes v2 lake-coherence defaults", () => {
    const hydrology = APPENDIX_A_DEFAULTS.hydrology;
    expect(hydrology).toBeTypeOf("object");
    expect(hydrology.lakeCoherence).toMatchObject({
      enabled: true,
      microLakeMaxSize: 2,
      microLakeMode: "merge",
      bridgeEnabled: true,
      maxBridgeDistance: 1,
      repairSingletons: true,
      enforceBoundaryRealism: true,
      boundaryEps: 0.0005,
      boundaryRepairMode: "trim_first",
    });
  });

  it("accepts lakeCoherence params in params files", async () => {
    const cwd = await makeTempDir();
    const paramsPath = join(cwd, "params.json");
    await writeFile(
      paramsPath,
      `${JSON.stringify(
        {
          params: {
            hydrology: {
              lakeCoherence: {
                enabled: false,
                microLakeMaxSize: 3,
                microLakeMode: "leave",
                bridgeEnabled: false,
                maxBridgeDistance: 2,
                repairSingletons: false,
                enforceBoundaryRealism: false,
                boundaryEps: 0.001,
                boundaryRepairMode: "trim_first",
              },
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const resolved = await resolveInputs({
      mode: "generate",
      cwd,
      args: {
        force: false,
        paramsPath,
      },
    });

    expect(resolved.params.hydrology).toMatchObject({
      lakeCoherence: {
        enabled: false,
        microLakeMaxSize: 3,
        microLakeMode: "leave",
        bridgeEnabled: false,
        maxBridgeDistance: 2,
        repairSingletons: false,
        enforceBoundaryRealism: false,
        boundaryEps: 0.001,
        boundaryRepairMode: "trim_first",
      },
    });
  });

  it("rejects invalid lakeCoherence enum values", async () => {
    const cwd = await makeTempDir();
    const paramsPath = join(cwd, "params.json");
    await writeFile(
      paramsPath,
      `${JSON.stringify(
        {
          params: {
            hydrology: {
              lakeCoherence: {
                microLakeMode: "bad_mode",
              },
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await expect(
      resolveInputs({
        mode: "generate",
        cwd,
        args: {
          force: false,
          paramsPath,
        },
      }),
    ).rejects.toThrow(/microLakeMode/);
  });

  it("rejects invalid lakeCoherence numeric values", async () => {
    const cwd = await makeTempDir();
    const paramsPath = join(cwd, "params.json");
    await writeFile(
      paramsPath,
      `${JSON.stringify(
        {
          params: {
            hydrology: {
              lakeCoherence: {
                microLakeMaxSize: -1,
              },
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await expect(
      resolveInputs({
        mode: "generate",
        cwd,
        args: {
          force: false,
          paramsPath,
        },
      }),
    ).rejects.toThrow(/microLakeMaxSize/);
  });
});
