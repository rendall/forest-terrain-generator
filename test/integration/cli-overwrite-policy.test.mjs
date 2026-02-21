import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("CLI overwrite policy", () => {
  it("fails on existing output file without --force and succeeds with --force", async () => {
    const dir = await makeTempDir();
    const outputFile = join(dir, "terrain.json");
    await writeFile(outputFile, "old-content", "utf8");

    const withoutForce = await runCli([
      "generate",
      "--seed",
      "1",
      "--width",
      "2",
      "--height",
      "2",
      "--output-file",
      outputFile
    ]);
    expect(withoutForce.code).toBe(2);
    expect(withoutForce.stderr).toContain("Output file already exists");
    expect(await readFile(outputFile, "utf8")).toBe("old-content");

    const withForce = await runCli([
      "generate",
      "--seed",
      "1",
      "--width",
      "2",
      "--height",
      "2",
      "--output-file",
      outputFile,
      "--force"
    ]);
    expect(withForce.code).toBe(0);

    const written = await readFile(outputFile, "utf8");
    expect(written).toContain("\"specVersion\": \"forest-terrain-v1\"");
  });

  it("fails on existing debug output directory without --force and succeeds with --force", async () => {
    const dir = await makeTempDir();
    const outputDir = join(dir, "debug-output");
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, "old.txt"), "old-content", "utf8");

    const withoutForce = await runCli([
      "debug",
      "--seed",
      "1",
      "--width",
      "2",
      "--height",
      "2",
      "--output-dir",
      outputDir
    ]);
    expect(withoutForce.code).toBe(2);
    expect(withoutForce.stderr).toContain("Output directory already exists");

    const withForce = await runCli([
      "debug",
      "--seed",
      "1",
      "--width",
      "2",
      "--height",
      "2",
      "--output-dir",
      outputDir,
      "--force"
    ]);
    expect(withForce.code).toBe(0);

    await expect(stat(join(outputDir, "old.txt"))).rejects.toBeDefined();
    const manifest = await readFile(join(outputDir, "debug-manifest.json"), "utf8");
    expect(manifest).toContain("\"mode\": \"debug\"");
  });

  it("does not publish debug output directory when optional debug output file precondition fails", async () => {
    const dir = await makeTempDir();
    const outputDir = join(dir, "debug-output");
    const debugOutputFile = join(dir, "existing-debug-envelope.json");
    await writeFile(debugOutputFile, "existing-content", "utf8");

    const result = await runCli([
      "debug",
      "--seed",
      "1",
      "--width",
      "2",
      "--height",
      "2",
      "--output-dir",
      outputDir,
      "--debug-output-file",
      debugOutputFile
    ]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Output file already exists");
    await expect(stat(outputDir)).rejects.toBeDefined();
    expect(await readFile(debugOutputFile, "utf8")).toBe("existing-content");
  });
});
