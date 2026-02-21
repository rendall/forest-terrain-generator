import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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

describe("CLI command wiring and contract failures", () => {
  it("wires generate to write terrain output", async () => {
    const dir = await makeTempDir();
    const outputFile = join(dir, "generated.json");

    const result = await runCli([
      "generate",
      "--seed",
      "42",
      "--width",
      "4",
      "--height",
      "4",
      "--output-file",
      outputFile
    ]);

    expect(result.code).toBe(0);
    const written = await readFile(outputFile, "utf8");
    expect(written).toContain("\"specVersion\": \"forest-terrain-v1\"");
  });

  it("fails derive without required --map-h", async () => {
    const dir = await makeTempDir();
    const outputFile = join(dir, "derived.json");

    const result = await runCli([
      "derive",
      "--seed",
      "42",
      "--width",
      "4",
      "--height",
      "4",
      "--output-file",
      outputFile
    ]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Missing required authored map for derive mode: --map-h.");
  });

  it("fails debug with --output-file and shows corrective hint", async () => {
    const dir = await makeTempDir();
    const outputFile = join(dir, "not-allowed.json");
    const outputDir = join(dir, "debug");

    const result = await runCli([
      "debug",
      "--seed",
      "42",
      "--width",
      "4",
      "--height",
      "4",
      "--output-dir",
      outputDir,
      "--output-file",
      outputFile
    ]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("You might mean --debug-output-file.");
  });

  it("wires debug to output directory and optional debug output file", async () => {
    const dir = await makeTempDir();
    const outputDir = join(dir, "debug");
    const debugOutputFile = join(dir, "debug-envelope.json");

    const result = await runCli([
      "debug",
      "--seed",
      "42",
      "--width",
      "4",
      "--height",
      "4",
      "--output-dir",
      outputDir,
      "--debug-output-file",
      debugOutputFile
    ]);

    expect(result.code).toBe(0);
    const manifest = await readFile(join(outputDir, "debug-manifest.json"), "utf8");
    expect(manifest).toContain("\"mode\": \"debug\"");

    const envelope = await readFile(debugOutputFile, "utf8");
    expect(envelope).toContain("\"specVersion\": \"forest-terrain-v1\"");
  });
});
