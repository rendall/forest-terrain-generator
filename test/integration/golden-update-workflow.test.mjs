import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const VITEST_ENTRY = resolve(process.cwd(), "node_modules/vitest/vitest.mjs");
const GOLDEN_TEST_FILE = resolve(process.cwd(), "test/golden/phase6-e2e-golden.test.mjs");
const tempDirs = [];

function runGoldenTest({
  baselinePath,
  updateGoldens
}) {
  return new Promise((resolveResult, rejectResult) => {
    const args = [VITEST_ENTRY, "run", GOLDEN_TEST_FILE];
    if (updateGoldens) {
      args.push("--", "--update-goldens");
    }

    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FORCE_COLOR: "0",
        FTG_PHASE6_E2E_BASELINE_PATH: baselinePath
      }
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

describe("golden update workflow", () => {
  it("fails on drift by default and updates only with --update-goldens", async () => {
    const dir = await makeTempDir();
    const baselinePath = join(dir, "phase6-e2e-hashes.json");
    await writeFile(
      baselinePath,
      `${JSON.stringify({ generate_1_16x16: "stale-hash" }, null, 2)}\n`,
      "utf8"
    );

    const staleBefore = await readFile(baselinePath, "utf8");

    const withoutUpdate = await runGoldenTest({
      baselinePath,
      updateGoldens: false
    });
    expect(withoutUpdate.code).toBe(1);
    expect(await readFile(baselinePath, "utf8")).toBe(staleBefore);

    const withUpdate = await runGoldenTest({
      baselinePath,
      updateGoldens: true
    });
    expect(withUpdate.code).toBe(0);
    const staleAfter = await readFile(baselinePath, "utf8");
    expect(staleAfter).not.toBe(staleBefore);
    const parsed = JSON.parse(staleAfter);
    expect(parsed.generate_1_16x16).toBeTypeOf("string");
    expect(parsed.debug_18446744073709551615_64x64).toBeTypeOf("string");
  }, 180000);
});
