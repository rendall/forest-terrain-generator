import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const CLI_ENTRY = resolve(process.cwd(), "src/cli/main.ts");
const tempDirs = [];

function runCli(args = []) {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(process.execPath, ["--import", "tsx", CLI_ENTRY, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: "0" }
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.once("error", rejectResult);
    child.once("close", (code) => {
      resolveResult({
        code: code ?? 0,
        stdout,
        stderr
      });
    });
  });
}

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "forest-terrain-generator-"));
  tempDirs.push(dir);
  return dir;
}

async function writeAuthoredMap(path, width, height, data) {
  await writeFile(path, `${JSON.stringify({ width, height, data }, null, 2)}\n`, "utf8");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Phase 6 CLI integration matrix", () => {
  it("rejects invalid generate output-argument combination", async () => {
    const dir = await makeTempDir();
    const outputFile = join(dir, "out.json");
    const outputDir = join(dir, "debug");

    const result = await runCli([
      "generate",
      "--seed",
      "7",
      "--width",
      "3",
      "--height",
      "3",
      "--output-file",
      outputFile,
      "--output-dir",
      outputDir
    ]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("--output-dir is not valid in generate mode. Use --output-file.");
  });

  it("covers derive happy path and shape mismatch path", async () => {
    const dir = await makeTempDir();
    const outputFile = join(dir, "derived.json");
    const goodMapH = join(dir, "map-h-good.json");
    const badMapH = join(dir, "map-h-bad.json");

    await writeAuthoredMap(goodMapH, 2, 2, [0.1, 0.2, 0.3, 0.4]);
    await writeAuthoredMap(badMapH, 3, 2, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);

    const ok = await runCli([
      "derive",
      "--seed",
      "7",
      "--width",
      "2",
      "--height",
      "2",
      "--map-h",
      goodMapH,
      "--output-file",
      outputFile
    ]);
    expect(ok.code).toBe(0);
    const written = JSON.parse(await readFile(outputFile, "utf8"));
    expect(written.meta.specVersion).toBe("forest-terrain-v1");

    const shapeError = await runCli([
      "derive",
      "--seed",
      "7",
      "--width",
      "2",
      "--height",
      "2",
      "--map-h",
      badMapH,
      "--output-file",
      outputFile
    ]);
    expect(shapeError.code).toBe(3);
    expect(shapeError.stderr).toContain("do not match expected 2x2");
  });

  it("covers debug happy path without --debug-output-file", async () => {
    const dir = await makeTempDir();
    const outputDir = join(dir, "debug");

    const result = await runCli([
      "debug",
      "--seed",
      "99",
      "--width",
      "4",
      "--height",
      "4",
      "--output-dir",
      outputDir
    ]);

    expect(result.code).toBe(0);
    await expect(stat(join(outputDir, "debug-manifest.json"))).resolves.toBeDefined();
    await expect(stat(join(outputDir, "topography.json"))).resolves.toBeDefined();
    await expect(stat(join(outputDir, "hydrology.json"))).resolves.toBeDefined();
    await expect(stat(join(outputDir, "ecology.json"))).resolves.toBeDefined();
    await expect(stat(join(outputDir, "navigation.json"))).resolves.toBeDefined();
  });

  it("rejects unknown CLI flags in all modes", async () => {
    const generate = await runCli([
      "generate",
      "--seed",
      "1",
      "--width",
      "2",
      "--height",
      "2",
      "--output-file",
      "/tmp/should-not-write.json",
      "--unknown-flag",
      "1"
    ]);
    expect(generate.code).toBe(2);
    expect(generate.stderr).toContain('Unknown CLI flag "--unknown-flag".');

    const derive = await runCli([
      "derive",
      "--seed",
      "1",
      "--width",
      "2",
      "--height",
      "2",
      "--map-h",
      "/tmp/missing-map-h.json",
      "--output-file",
      "/tmp/should-not-write.json",
      "--unknown-flag",
      "1"
    ]);
    expect(derive.code).toBe(2);
    expect(derive.stderr).toContain('Unknown CLI flag "--unknown-flag".');

    const debug = await runCli([
      "debug",
      "--seed",
      "1",
      "--width",
      "2",
      "--height",
      "2",
      "--output-dir",
      "/tmp/should-not-write-dir",
      "--unknown-flag",
      "1"
    ]);
    expect(debug.code).toBe(2);
    expect(debug.stderr).toContain('Unknown CLI flag "--unknown-flag".');
  });
});
