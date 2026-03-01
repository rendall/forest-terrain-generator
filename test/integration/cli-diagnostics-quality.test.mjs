import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

describe("CLI diagnostics quality bar", () => {
  it("emits category/context diagnostics for exit code 2 (input)", async () => {
    const result = await runCli([
      "generate",
      "--seed",
      "1",
      "--width",
      "2",
      "--height",
      "2",
      "--output-file",
      "/tmp/ignored.json",
      "--unknown-flag",
      "1"
    ]);

    expect(result.code).toBe(2);
    expect(result.stderr).toContain("[input]");
    expect(result.stderr).toContain("Unknown CLI flag \"--unknown-flag\".");
    expect(result.stderr).not.toContain("\n    at ");
  });

  it("emits category/context diagnostics for exit code 3 (shape)", async () => {
    const dir = await makeTempDir();
    const mapH = join(dir, "map-h-bad.json");
    await writeFile(
      mapH,
      `${JSON.stringify({ width: 3, height: 2, data: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6] }, null, 2)}\n`,
      "utf8"
    );

    const result = await runCli([
      "derive",
      "--seed",
      "1",
      "--width",
      "2",
      "--height",
      "2",
      "--map-h",
      mapH,
      "--output-file",
      join(dir, "out.json")
    ]);

    expect(result.code).toBe(3);
    expect(result.stderr).toContain("[shape]");
    expect(result.stderr).toContain("dimensions 3x2 do not match expected 2x2");
    expect(result.stderr).not.toContain("\n    at ");
  });

  it("emits category/context diagnostics for exit code 4 (io)", async () => {
    const result = await runCli([
      "generate",
      "--seed",
      "1",
      "--width",
      "2",
      "--height",
      "2",
      "--output-file",
      "/proc/forest-terrain-generator-output.json"
    ]);

    expect(result.code).toBe(4);
    expect(result.stderr).toContain("[io]");
    expect(result.stderr).toContain("terrain output write");
    expect(result.stderr).toContain("/proc/forest-terrain-generator-output.json");
    expect(result.stderr).not.toContain("\n    at ");
  });

  it("emits category/context diagnostics for exit code 5 (internal)", async () => {
    const dir = await makeTempDir();
    const paramsPath = join(dir, "params.json");
    await writeFile(
      paramsPath,
      `${JSON.stringify({ landform: 0 }, null, 2)}\n`,
      "utf8"
    );

    const result = await runCli([
      "generate",
      "--seed",
      "1",
      "--width",
      "2",
      "--height",
      "2",
      "--params",
      paramsPath,
      "--output-file",
      join(dir, "out.json")
    ]);

    expect(result.code).toBe(5);
    expect(result.stderr).toContain("[internal]");
    expect(result.stderr).toContain("landform");
    expect(result.stderr).not.toContain("\n    at ");
  });
});
