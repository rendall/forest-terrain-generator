import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { resolveInputs } from "../../src/app/run-generator.js";
import { APPENDIX_A_DEFAULTS } from "../../src/lib/default-params.js";

const tempDirs = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "forest-terrain-generator-hydrology-structure-params-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Phase 3 hydrology-structure params contract", () => {
  it("exposes hydrology.structure defaults", () => {
    const hydrology = APPENDIX_A_DEFAULTS.hydrology;
    expect(hydrology).toBeTypeOf("object");
    expect(hydrology.structure).toMatchObject({
      enabled: true,
      sinkPersistenceRouteMax: 0.005,
      sinkPersistenceLakeMin: 0.02,
      basinTileCountMinLake: 3,
      inflowGateEnabled: false,
      lakeInflowMin: 0.15,
      unresolvedLakePolicy: "deny",
      spillAwareRouteThroughEnabled: false,
      retentionWeight: 0.2,
      retentionNormalization: "quantile",
    });
  });

  it("accepts hydrology.structure params in params files", async () => {
    const cwd = await makeTempDir();
    const paramsPath = join(cwd, "params.json");
    await writeFile(
      paramsPath,
      `${JSON.stringify(
        {
          params: {
            hydrology: {
              structure: {
                enabled: false,
                sinkPersistenceRouteMax: 0.01,
                sinkPersistenceLakeMin: 0.03,
                basinTileCountMinLake: 4,
                inflowGateEnabled: true,
                lakeInflowMin: 0.21,
                unresolvedLakePolicy: "allow_with_strict_gates",
                spillAwareRouteThroughEnabled: true,
                retentionWeight: 0.35,
                retentionNormalization: "minmax",
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
      structure: {
        enabled: false,
        sinkPersistenceRouteMax: 0.01,
        sinkPersistenceLakeMin: 0.03,
        basinTileCountMinLake: 4,
        inflowGateEnabled: true,
        lakeInflowMin: 0.21,
        unresolvedLakePolicy: "allow_with_strict_gates",
        spillAwareRouteThroughEnabled: true,
        retentionWeight: 0.35,
        retentionNormalization: "minmax",
      },
    });
  });

  it("rejects invalid hydrology.structure enum values", async () => {
    const cwd = await makeTempDir();
    const paramsPath = join(cwd, "params.json");
    await writeFile(
      paramsPath,
      `${JSON.stringify(
        {
          params: {
            hydrology: {
              structure: {
                unresolvedLakePolicy: "sometimes",
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
    ).rejects.toThrow(/unresolvedLakePolicy/);
  });

  it("rejects invalid hydrology.structure numeric values", async () => {
    const cwd = await makeTempDir();
    const paramsPath = join(cwd, "params.json");
    await writeFile(
      paramsPath,
      `${JSON.stringify(
        {
          params: {
            hydrology: {
              structure: {
                basinTileCountMinLake: -1,
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
    ).rejects.toThrow(/basinTileCountMinLake/);
  });

  it("normalizes hydrology structure params with locked defaults", async () => {
    const { normalizeHydrologyStructureParams } = await import(
      "../../src/pipeline/hydrology.js"
    );

    expect(typeof normalizeHydrologyStructureParams).toBe("function");

    const defaults = normalizeHydrologyStructureParams(undefined);
    expect(defaults).toMatchObject({
      enabled: true,
      sinkPersistenceRouteMax: 0.005,
      sinkPersistenceLakeMin: 0.02,
      basinTileCountMinLake: 3,
      inflowGateEnabled: false,
      lakeInflowMin: 0.15,
      unresolvedLakePolicy: "deny",
      spillAwareRouteThroughEnabled: false,
      retentionWeight: 0.2,
      retentionNormalization: "quantile",
    });

    const clamped = normalizeHydrologyStructureParams({
      sinkPersistenceRouteMax: -1,
      basinTileCountMinLake: -5,
      retentionWeight: -2,
      unresolvedLakePolicy: "allow",
      retentionNormalization: "raw",
    });
    expect(clamped.sinkPersistenceRouteMax).toBe(0);
    expect(clamped.basinTileCountMinLake).toBe(0);
    expect(clamped.retentionWeight).toBe(0);
    expect(clamped.unresolvedLakePolicy).toBe("allow");
    expect(clamped.retentionNormalization).toBe("raw");
  });
});
