import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const CLI_ENTRY = resolve(process.cwd(), "src/cli/main.ts");
const GOLDEN_BASELINES_PATH = resolve(process.cwd(), "test/golden/e2e/phase6-e2e-hashes.json");
const SEEDS = ["1", "42", "123456789", "18446744073709551615"];
const SIZES = [
  { width: 16, height: 16 },
  { width: 64, height: 64 }
];
const DEBUG_ARTIFACTS = [
  "debug-manifest.json",
  "topography.json",
  "hydrology.json",
  "ecology.json",
  "navigation.json"
];

const tempDirs = [];

function hashText(value) {
  return createHash("sha256").update(value).digest("hex");
}

function caseKey(mode, seed, width, height) {
  return `${mode}_${seed}_${width}x${height}`;
}

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

async function createDeriveMap(path, width, height) {
  const data = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Deterministic authored H map for derive-mode golden runs.
      data.push(Number(((x + y) / (width + height - 2)).toFixed(6)));
    }
  }
  await writeFile(path, `${JSON.stringify({ width, height, data }, null, 2)}\n`, "utf8");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("Phase 6 end-to-end fixed-seed goldens", () => {
  it("matches locked generate/derive/debug golden baselines and debug invariants", async () => {
    const baseline = JSON.parse(await readFile(GOLDEN_BASELINES_PATH, "utf8"));

    for (const seed of SEEDS) {
      for (const size of SIZES) {
        const { width, height } = size;
        const dir = await makeTempDir();

        const generateOutput = join(dir, `generate-${width}x${height}.json`);
        const generateResult = await runCli([
          "generate",
          "--seed",
          seed,
          "--width",
          String(width),
          "--height",
          String(height),
          "--output-file",
          generateOutput
        ]);
        expect(generateResult.code).toBe(0);
        const generateRaw = await readFile(generateOutput, "utf8");
        expect(hashText(generateRaw)).toBe(baseline[caseKey("generate", seed, width, height)]);

        const deriveMapH = join(dir, `derive-map-h-${width}x${height}.json`);
        await createDeriveMap(deriveMapH, width, height);
        const deriveOutput = join(dir, `derive-${width}x${height}.json`);
        const deriveResult = await runCli([
          "derive",
          "--seed",
          seed,
          "--width",
          String(width),
          "--height",
          String(height),
          "--map-h",
          deriveMapH,
          "--output-file",
          deriveOutput
        ]);
        expect(deriveResult.code).toBe(0);
        const deriveRaw = await readFile(deriveOutput, "utf8");
        expect(hashText(deriveRaw)).toBe(baseline[caseKey("derive", seed, width, height)]);

        const debugDir = join(dir, `debug-${width}x${height}`);
        const debugOutput = join(dir, `debug-output-${width}x${height}.json`);
        const debugResult = await runCli([
          "debug",
          "--seed",
          seed,
          "--width",
          String(width),
          "--height",
          String(height),
          "--output-dir",
          debugDir,
          "--debug-output-file",
          debugOutput
        ]);
        expect(debugResult.code).toBe(0);
        const debugRaw = await readFile(debugOutput, "utf8");
        expect(hashText(debugRaw)).toBe(baseline[caseKey("debug", seed, width, height)]);

        for (const artifact of DEBUG_ARTIFACTS) {
          await expect(stat(join(debugDir, artifact))).resolves.toBeDefined();
        }
        const manifest = JSON.parse(await readFile(join(debugDir, "debug-manifest.json"), "utf8"));
        expect(manifest.mode).toBe("debug");
        expect(manifest.specVersion).toBe("forest-terrain-v1");
        expect(manifest.width).toBe(width);
        expect(manifest.height).toBe(height);
        expect(manifest.tileCount).toBe(width * height);
        expect(manifest.artifacts).toEqual([
          "topography.json",
          "hydrology.json",
          "ecology.json",
          "navigation.json"
        ]);
      }
    }
  }, 120000);
});
