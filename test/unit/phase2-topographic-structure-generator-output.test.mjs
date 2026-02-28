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
  it("emits minimal topography.structure fields and excludes internals", async () => {
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

    const firstTile = envelope.tiles[0];
    expect(firstTile.topography.structure).toBeDefined();
    expect(firstTile.topography.structure.basinPersistence === null
      || typeof firstTile.topography.structure.basinPersistence === "number").toBe(true);
    expect(firstTile.topography.structure.peakPersistence === null
      || typeof firstTile.topography.structure.peakPersistence === "number").toBe(true);
    expect(typeof firstTile.topography.structure.basinLike).toBe("boolean");
    expect(typeof firstTile.topography.structure.ridgeLike).toBe("boolean");
    expect(firstTile.topography.structure.basinMinIdx).toBeUndefined();
    expect(firstTile.topography.structure.peakMaxIdx).toBeUndefined();

    for (const tile of envelope.tiles) {
      expect(tile.topography.structure).toBeDefined();
      expect(Object.keys(tile.topography.structure)).toEqual([
        "basinPersistence",
        "peakPersistence",
        "basinLike",
        "ridgeLike",
      ]);
    }
  });
});
