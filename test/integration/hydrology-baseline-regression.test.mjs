import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ENTRY = resolve(process.cwd(), "src/cli/hydrology-inspector.ts");
const FIXTURE_DIR = resolve(process.cwd(), "test/fixtures/hydrology-baseline");
const FIXTURE_ENVELOPE = join(FIXTURE_DIR, "debug-envelope.json");
const FIXTURE_DEBUG_DIR = join(FIXTURE_DIR, "debug");
const tempDirs = [];

const runCli = (args = []) =>
	new Promise((resolveResult, rejectResult) => {
		const child = spawn(process.execPath, ["--import", "tsx", ENTRY, ...args], {
			cwd: process.cwd(),
			env: { ...process.env, FORCE_COLOR: "0" },
		});
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

const makeTempDir = async () => {
	const dir = await mkdtemp(
		join(tmpdir(), "forest-terrain-generator-hydrology-baseline-"),
	);
	tempDirs.push(dir);
	return dir;
};

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("hydrology baseline regression", () => {
	it("keeps a stable hydrology signature on the frozen fixture", async () => {
		const outDir = await makeTempDir();
		const statsFile = join(outDir, "stats.json");
		const result = await runCli([
			"--input-json",
			FIXTURE_ENVELOPE,
			"--debug-dir",
			FIXTURE_DEBUG_DIR,
			"--stats",
			"--stats-file",
			statsFile,
		]);

		expect(result.code).toBe(0);
		const payload = JSON.parse(result.stdout);
		expect(payload.stats).toMatchObject({
			hydrologyMapsSource: "debug_artifacts",
			tileCount: 1024,
			sinkCount: 23,
			streamTileCount: 111,
			fa: {
				max: 130,
				p95: 27,
			},
			fdHistogram: {
				255: 23,
			},
		});
		expect(payload.stats.topAccumulationTiles[0]).toMatchObject({
			tileId: 436,
			x: 20,
			y: 13,
			fa: 130,
		});
		expect(payload.statsFilePath).toBe(statsFile);
		await expect(stat(statsFile)).resolves.toBeDefined();
		const writtenStats = JSON.parse(await readFile(statsFile, "utf8"));
		expect(writtenStats).toMatchObject({
			hydrologyMapsSource: "debug_artifacts",
			tileCount: 1024,
			sinkCount: 23,
			streamTileCount: 111,
		});
	});
});
