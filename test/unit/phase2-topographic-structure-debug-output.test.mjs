import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { runGenerator } from "../../src/app/run-generator.js";

const tempDirs = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "forest-terrain-generator-topo-debug-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Phase 2 topographic structure debug output", () => {
  it("omits topography.structure from debug-emitted tile payloads", async () => {
    const cwd = await makeTempDir();
    const outputDir = join(cwd, "debug");
    const debugOutputFile = join(cwd, "debug-output.json");

    await runGenerator({
      mode: "debug",
      cwd,
      args: {
        seed: "1",
        width: 8,
        height: 8,
        outputDir,
        debugOutputFile,
        force: false,
      },
    });

    const debugTopography = JSON.parse(
      await readFile(join(outputDir, "topography.json"), "utf8"),
    );
    expect(Array.isArray(debugTopography.features.basins)).toBe(true);
    expect(Array.isArray(debugTopography.features.peaks)).toBe(true);
    expect(debugTopography.features.basins.length).toBeGreaterThan(0);
    expect(debugTopography.features.peaks.length).toBeGreaterThan(0);
    expect(debugTopography.tiles[0].index).toBe(0);
    expect(debugTopography.tiles[1].index).toBe(1);
    expect(Array.isArray(debugTopography.tiles[0].featureIds)).toBe(true);
    expect(Array.isArray(debugTopography.tiles[0].activeFeatureIds)).toBe(true);
    expect(debugTopography.tiles[0].topography.structure).toBeUndefined();

    const envelope = JSON.parse(await readFile(debugOutputFile, "utf8"));
    expect(envelope.tiles[0].index).toBe(0);
    expect(Array.isArray(envelope.features.basins)).toBe(true);
    expect(Array.isArray(envelope.features.peaks)).toBe(true);
    expect(Array.isArray(envelope.tiles[0].featureIds)).toBe(true);
    expect(Array.isArray(envelope.tiles[0].activeFeatureIds)).toBe(true);
    expect(envelope.tiles[0].topography.structure).toBeUndefined();
  });
});
