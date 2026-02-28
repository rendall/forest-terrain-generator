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
  it("publishes full structure fields only in debug topography artifact", async () => {
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
    expect(debugTopography.tiles[0].index).toBe(0);
    expect(debugTopography.tiles[1].index).toBe(1);
    const debugStructure = debugTopography.tiles[0].topography.structure;

    expect(debugStructure.basinPersistence).not.toBeUndefined();
    expect(debugStructure.peakPersistence).not.toBeUndefined();
    expect(debugStructure.basinLike).not.toBeUndefined();
    expect(debugStructure.ridgeLike).not.toBeUndefined();

    expect(debugStructure.basinMinIdx).not.toBeUndefined();
    expect(debugStructure.basinMinH).not.toBeUndefined();
    expect(debugStructure.basinSpillH).not.toBeUndefined();
    expect(debugStructure.basinDepthLike).not.toBeUndefined();
    expect(debugStructure.peakMaxIdx).not.toBeUndefined();
    expect(debugStructure.peakMaxH).not.toBeUndefined();
    expect(debugStructure.peakSaddleH).not.toBeUndefined();
    expect(debugStructure.peakRiseLike).not.toBeUndefined();

    const envelope = JSON.parse(await readFile(debugOutputFile, "utf8"));
    expect(envelope.tiles[0].index).toBe(0);
    const envelopeStructure = envelope.tiles[0].topography.structure;
    expect(Object.keys(envelopeStructure)).toEqual([
      "basinPersistence",
      "peakPersistence",
      "basinLike",
      "ridgeLike",
    ]);
    expect(envelopeStructure.basinMinIdx).toBeUndefined();
    expect(envelopeStructure.peakMaxIdx).toBeUndefined();
  });
});
