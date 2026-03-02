import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const CLI_ENTRY = resolve(process.cwd(), "src/cli/main.ts");
const tempDirs = [];

function runCli(args = []) {
	return new Promise((resolveResult, rejectResult) => {
		const child = spawn(
			process.execPath,
			["--import", "tsx", CLI_ENTRY, ...args],
			{
				cwd: process.cwd(),
				env: { ...process.env, FORCE_COLOR: "0" },
			},
		);
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => (stdout += chunk));
		child.stderr.on("data", (chunk) => (stderr += chunk));
		child.once("error", rejectResult);
		child.once("close", (code) =>
			resolveResult({ code: code ?? 0, stdout, stderr }),
		);
	});
}

async function makeTempDir() {
	const dir = await mkdtemp(
		join(tmpdir(), "forest-terrain-generator-hydrology-debug-"),
	);
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("hydrology debug artifacts", () => {
	it("emits hydrology fd/fa/faN/isStream in debug output for generated terrain", async () => {
		const dir = await makeTempDir();
		const outDir = join(dir, "debug");
		const result = await runCli([
			"debug",
			"--seed",
			"42",
			"--width",
			"4",
			"--height",
			"4",
			"--output-dir",
			outDir,
		]);
		expect(result.code).toBe(0);
			const hydrologyRaw = await readFile(join(outDir, "hydrology.json"), "utf8");
			const hydrology = JSON.parse(hydrologyRaw);
			expect(hydrology.lakeAccounting).toBeDefined();
			expect(Array.isArray(hydrology.lakeAccounting.basins)).toBe(true);
			expect(Array.isArray(hydrology.tiles)).toBe(true);
			expect(hydrology.tiles[0].hydrology).toHaveProperty("fd");
			expect(hydrology.tiles[0].hydrology).toHaveProperty("fa");
			expect(hydrology.tiles[0].hydrology).toHaveProperty("faN");
			expect(hydrology.tiles[0].hydrology).toHaveProperty("isStream");
			expect(hydrology.tiles[0].hydrology).toHaveProperty("lakeDepth");
			expect(hydrology.tiles[0].hydrology).toHaveProperty("lakeBasinId");

		await expect(stat(join(outDir, "fd.json"))).resolves.toBeDefined();
		await expect(stat(join(outDir, "fa.json"))).resolves.toBeDefined();
		await expect(
			stat(join(outDir, "fa-normalized.json")),
		).resolves.toBeDefined();
		await expect(stat(join(outDir, "stream-mask.json"))).resolves.toBeDefined();

		const fd = JSON.parse(await readFile(join(outDir, "fd.json"), "utf8"));
		const fa = JSON.parse(await readFile(join(outDir, "fa.json"), "utf8"));
		const faNormalized = JSON.parse(
			await readFile(join(outDir, "fa-normalized.json"), "utf8"),
		);
		const streamMask = JSON.parse(
			await readFile(join(outDir, "stream-mask.json"), "utf8"),
		);
		expect(fd.tiles[0]).toHaveProperty("fd");
		expect(fa.tiles[0]).toHaveProperty("fa");
		expect(faNormalized.tiles[0]).toHaveProperty("faN");
		expect(streamMask.tiles[0]).toHaveProperty("isStream");
	});
});
