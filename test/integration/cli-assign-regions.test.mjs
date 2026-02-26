import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const MAIN_CLI_ENTRY = resolve(process.cwd(), "src/cli/main.ts");
const ASSIGN_REGIONS_CLI_ENTRY = resolve(
	process.cwd(),
	"src/cli/assign-regions.ts",
);
const tempDirs = [];

function runCli(entry, args = []) {
	return new Promise((resolveResult, rejectResult) => {
		const child = spawn(process.execPath, ["--import", "tsx", entry, ...args], {
			cwd: process.cwd(),
			env: { ...process.env, FORCE_COLOR: "0" },
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
				stderr,
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
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("assign-regions CLI", () => {
	it("writes enriched envelope with required top-level regions and per-tile region IDs", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source.json");
		const enrichedFile = join(dir, "enriched.json");

		const generateResult = await runCli(MAIN_CLI_ENTRY, [
			"generate",
			"--seed",
			"42",
			"--width",
			"4",
			"--height",
			"4",
			"--output-file",
			sourceFile,
		]);
		expect(generateResult.code).toBe(0);

		const assignResult = await runCli(ASSIGN_REGIONS_CLI_ENTRY, [
			"--input-file",
			sourceFile,
			"--output-file",
			enrichedFile,
		]);
		expect(assignResult.code).toBe(0);

		const parsed = JSON.parse(await readFile(enrichedFile, "utf8"));
		expect(Array.isArray(parsed.regions)).toBe(true);
		expect(parsed.regions.length).toBeGreaterThan(0);
		expect(parsed.tiles).toHaveLength(16);
		expect(Number.isInteger(parsed.tiles[0].region.biomeRegionId)).toBe(true);
	});

	it("follows output overwrite policy and supports --force", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source.json");
		const enrichedFile = join(dir, "enriched.json");

		const generateResult = await runCli(MAIN_CLI_ENTRY, [
			"generate",
			"--seed",
			"99",
			"--width",
			"4",
			"--height",
			"4",
			"--output-file",
			sourceFile,
		]);
		expect(generateResult.code).toBe(0);

		const firstAssign = await runCli(ASSIGN_REGIONS_CLI_ENTRY, [
			"--input-file",
			sourceFile,
			"--output-file",
			enrichedFile,
		]);
		expect(firstAssign.code).toBe(0);

		const secondWithoutForce = await runCli(ASSIGN_REGIONS_CLI_ENTRY, [
			"--input-file",
			sourceFile,
			"--output-file",
			enrichedFile,
		]);
		expect(secondWithoutForce.code).toBe(2);
		expect(secondWithoutForce.stderr).toContain("Output file already exists");

		const thirdWithForce = await runCli(ASSIGN_REGIONS_CLI_ENTRY, [
			"--input-file",
			sourceFile,
			"--output-file",
			enrichedFile,
			"--force",
		]);
		expect(thirdWithForce.code).toBe(0);
	});
});

