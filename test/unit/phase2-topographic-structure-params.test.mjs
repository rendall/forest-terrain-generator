import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { resolveInputs } from "../../src/app/run-generator.js";
import { APPENDIX_A_DEFAULTS } from "../../src/lib/default-params.js";

const tempDirs = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "forest-terrain-generator-topo-params-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Phase 2 topographic-structure params contract", () => {
  it("exposes topography.structure defaults", () => {
    const topography = APPENDIX_A_DEFAULTS.topography;
    expect(topography).toBeTypeOf("object");
    expect(topography.structure).toMatchObject({
      enabled: true,
      connectivity: "dir8",
      hEps: 0.000001,
      persistenceMin: 0.01,
      unresolvedPolicy: "nan",
    });
  });

  it("accepts topography.structure params in params files", async () => {
    const cwd = await makeTempDir();
    const paramsPath = join(cwd, "params.json");
    await writeFile(
      paramsPath,
      `${JSON.stringify(
        {
          params: {
            topography: {
              structure: {
                enabled: false,
                connectivity: "dir8",
                hEps: 0.0005,
                persistenceMin: 0.25,
                unresolvedPolicy: "max_h",
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

    expect(resolved.params.topography).toMatchObject({
      structure: {
        enabled: false,
        connectivity: "dir8",
        hEps: 0.0005,
        persistenceMin: 0.25,
        unresolvedPolicy: "max_h",
      },
    });
  });

  it("rejects invalid topography.structure enum values", async () => {
    const cwd = await makeTempDir();
    const paramsPath = join(cwd, "params.json");
    await writeFile(
      paramsPath,
      `${JSON.stringify(
        {
          params: {
            topography: {
              structure: {
                connectivity: "dir4",
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
    ).rejects.toThrow(/connectivity/);
  });

  it("rejects removed topography.structure.grab key", async () => {
    const cwd = await makeTempDir();
    const paramsPath = join(cwd, "params.json");
    await writeFile(
      paramsPath,
      `${JSON.stringify(
        {
          params: {
            topography: {
              structure: {
                grab: 0.5,
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
    ).rejects.toThrow(/Unknown params key "params\.topography\.structure\.grab"/);
  });

  it("rejects non-object topography values", async () => {
    const cwd = await makeTempDir();
    const paramsPath = join(cwd, "params.json");
    await writeFile(
      paramsPath,
      `${JSON.stringify(
        {
          params: {
            topography: 0,
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
    ).rejects.toThrow(/params\.topography/);
  });
});
