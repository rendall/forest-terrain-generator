import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { resolveInputs } from "../../src/app/run-generator.js";

const tempDirs = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "forest-terrain-generator-legacy-veg-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Legacy vegVarianceStrength compatibility", () => {
  it("uses top-level legacy vegVarianceStrength when nested strength is not explicitly provided", async () => {
    const cwd = await makeTempDir();
    const paramsPath = join(cwd, "params.json");
    await writeFile(
      paramsPath,
      `${JSON.stringify({ params: { vegVarianceStrength: 0.2 } }, null, 2)}\n`,
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

    expect(resolved.params.vegVarianceStrength).toBe(0.2);
    expect(resolved.params.vegVarianceNoise).toMatchObject({ strength: 0.2 });
  });

  it("keeps nested vegVarianceNoise.strength precedence when both are explicitly provided", async () => {
    const cwd = await makeTempDir();
    const paramsPath = join(cwd, "params.json");
    await writeFile(
      paramsPath,
      `${JSON.stringify(
        {
          params: {
            vegVarianceStrength: 0.2,
            vegVarianceNoise: { strength: 0.05 }
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

    expect(resolved.params.vegVarianceStrength).toBe(0.2);
    expect(resolved.params.vegVarianceNoise).toMatchObject({ strength: 0.05 });
  });
});
