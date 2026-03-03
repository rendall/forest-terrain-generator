import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { runGenerator } from "../../src/app/run-generator.js";

const tempDirs = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "forest-terrain-generator-topo-output-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Phase 2 topographic structure tile payload", () => {
  it("emits v2 tile payload without legacy feature/topography structure fields", async () => {
    const cwd = await makeTempDir();
    const outputFile = join(cwd, "out.json");

    await runGenerator({
      mode: "generate",
      cwd,
      args: {
        seed: "1",
        width: 8,
        height: 8,
        outputFile,
        force: false,
      },
    });

    const envelope = JSON.parse(await readFile(outputFile, "utf8"));
    expect(Array.isArray(envelope.tiles)).toBe(true);
    expect(envelope.tiles.length).toBe(64);
    expect(envelope.features).toBeDefined();
    expect(Array.isArray(envelope.features.basins)).toBe(true);
    expect(Array.isArray(envelope.features.peaks)).toBe(true);
    expect(envelope.features.basins.length).toBeGreaterThan(0);
    expect(envelope.features.peaks.length).toBeGreaterThan(0);

    const firstTile = envelope.tiles[0];
    expect(firstTile.index).toBe(0);
    expect(firstTile.featureIds).toBeUndefined();
    expect(firstTile.activeFeatureIds).toBeUndefined();
    expect(firstTile.topography.structure).toBeUndefined();
    expect(firstTile.topography.elevationMeters).toBeUndefined();
    expect(firstTile.hydrology).toBeDefined();
    expect(firstTile.hydrology).toHaveProperty("fd");
    expect(firstTile.hydrology).toHaveProperty("fa");
    expect(firstTile.hydrology).toHaveProperty("faN");
    expect(firstTile.hydrology).toHaveProperty("waterDepth");
    expect(firstTile.hydrology).toHaveProperty("basinId");

    for (const tile of envelope.tiles) {
      expect(tile.index).toBe(tile.y * 8 + tile.x);
      expect(tile.featureIds).toBeUndefined();
      expect(tile.activeFeatureIds).toBeUndefined();
      expect(tile.topography.structure).toBeUndefined();
      expect(tile.topography.elevationMeters).toBeUndefined();
      expect(tile.hydrology).toBeDefined();
      expect(typeof tile.hydrology.waterDepth).toBe("number");
      expect(
        typeof tile.hydrology.basinId === "string" ||
          tile.hydrology.basinId === null,
      ).toBe(true);
    }
  });
});
