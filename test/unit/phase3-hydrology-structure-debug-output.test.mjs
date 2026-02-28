import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { runGenerator } from "../../src/app/run-generator.js";

const tempDirs = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "forest-terrain-generator-hydrology-structure-debug-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Phase 3 hydrology-structure debug output", () => {
  it("publishes hydrologyStructureDiagnostics in debug manifest", async () => {
    const cwd = await makeTempDir();
    const outputDir = join(cwd, "debug");

    await runGenerator({
      mode: "debug",
      cwd,
      args: {
        seed: "1",
        width: 16,
        height: 16,
        outputDir,
        force: false,
      },
    });

    const manifest = JSON.parse(
      await readFile(join(outputDir, "debug-manifest.json"), "utf8"),
    );

    expect(manifest.hydrologyStructureDiagnostics).toBeDefined();
    expect(manifest.hydrologyStructureDiagnostics.params).toBeDefined();
    expect(manifest.hydrologyStructureDiagnostics.sinkCandidates).toBeDefined();
    expect(manifest.hydrologyStructureDiagnostics.sinkRejections).toBeDefined();
    expect(manifest.hydrologyStructureDiagnostics.endpointReasons).toBeDefined();
    expect(manifest.hydrologyStructureDiagnostics.moistureDecomposition).toBeDefined();
  });
});
