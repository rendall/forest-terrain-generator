import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { runGenerator } from "../../src/app/run-generator.js";

const tempDirs = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "forest-terrain-generator-lake-debug-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Phase 3 lake coherence debug output", () => {
  it("publishes lakeCoherence manifest metrics and lakeSurfaceH on lake tiles", async () => {
    const cwd = await makeTempDir();
    const outputDir = join(cwd, "debug");
    const debugOutputFile = join(cwd, "debug-output.json");

    await runGenerator({
      mode: "debug",
      cwd,
      args: {
        seed: "1",
        width: 16,
        height: 16,
        outputDir,
        debugOutputFile,
        force: false,
      },
    });

    const manifest = JSON.parse(
      await readFile(join(outputDir, "debug-manifest.json"), "utf8"),
    );
    expect(manifest.lakeCoherence).toMatchObject({
      componentCount: expect.any(Number),
      singletonCount: expect.any(Number),
      largestComponentSize: expect.any(Number),
      largestComponentShare: expect.any(Number),
      totalLakeShare: expect.any(Number),
      boundaryViolationCount: expect.any(Number),
    });

    const envelope = JSON.parse(await readFile(debugOutputFile, "utf8"));
    const lakeTiles = envelope.tiles.filter(
      (tile) => tile?.hydrology?.lakeMask === true,
    );
    expect(lakeTiles.length).toBeGreaterThan(0);
    for (const tile of lakeTiles) {
      expect(typeof tile.hydrology.lakeSurfaceH).toBe("number");
    }
  });
});
