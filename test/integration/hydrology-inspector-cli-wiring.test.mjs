import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ENTRY = resolve(process.cwd(), "src/cli/hydrology-inspector.ts");
const BASELINE_ENVELOPE_FIXTURE = resolve(
	process.cwd(),
	"test/fixtures/hydrology-baseline/debug-envelope.json",
);
const tempDirs = [];

function runCli(args = []) {
	return new Promise((resolveResult, rejectResult) => {
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
}

async function makeTempDir() {
	const dir = await mkdtemp(
		join(tmpdir(), "forest-terrain-generator-hydrology-inspector-"),
	);
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("hydrology-inspector CLI", () => {
	it("requires at least one requested action (--viz and/or --stats)", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source.json");
		await writeFile(
			sourceFile,
			`${JSON.stringify({
				meta: { specVersion: "forest-terrain-v1" },
				tiles: [{ x: 0, y: 0, topography: { h: 0.8, r: 0, v: 0 } }],
				features: { basins: [], peaks: [] },
			})}\n`,
			"utf8",
		);

		const result = await runCli(["--input-json", sourceFile]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain(
			"Nothing to do. Provide --viz and/or --stats.",
		);
	});

	it("prefers envelope hydrology maps when present (stats mode)", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-with-hydrology.json");
		const statsFile = join(dir, "stats.json");
		await writeFile(
			sourceFile,
			`${JSON.stringify({
				meta: { specVersion: "forest-terrain-v1" },
				tiles: [
					{
						x: 0,
						y: 0,
						topography: { h: 0.8, r: 0, v: 0 },
						hydrology: { fd: 3, fa: 11, faN: 0.25, isStream: true },
					},
					{
						x: 1,
						y: 0,
						topography: { h: 0.5, r: 0, v: 0 },
						hydrology: { fd: 255, fa: 2, faN: 0.05, isStream: false },
					},
				],
				features: { basins: [], peaks: [] },
			})}\n`,
			"utf8",
		);

		const result = await runCli([
			"--input-json",
			sourceFile,
			"--stats",
			"--stats-file",
			statsFile,
		]);
		expect(result.code).toBe(0);
		const payload = JSON.parse(result.stdout.trim());
		expect(payload.hydrologyMapsSource).toBe("envelope");
		expect(payload.stats).toBeDefined();
		expect(payload.statsFilePath).toBe(statsFile);
	});

	it("recomputes hydrology maps when envelope hydrology is absent (stats mode)", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-no-hydrology.json");
		const statsFile = join(dir, "stats.json");
		await writeFile(
			sourceFile,
			`${JSON.stringify({
				meta: { specVersion: "forest-terrain-v1" },
				tiles: [
					{ x: 0, y: 0, topography: { h: 0.9, r: 0, v: 0 } },
					{ x: 1, y: 0, topography: { h: 0.4, r: 0, v: 0 } },
				],
				features: { basins: [], peaks: [] },
			})}\n`,
			"utf8",
		);

		const result = await runCli([
			"--input-json",
			sourceFile,
			"--stats",
			"--stats-file",
			statsFile,
		]);
		expect(result.code).toBe(0);
			const payload = JSON.parse(result.stdout.trim());
			expect(payload.hydrologyMapsSource).toBe("recomputed");
			expect(payload.stats).toMatchObject({
				sinkCount: expect.any(Number),
				streamTileCount: expect.any(Number),
				lakeTileCount: expect.any(Number),
				lakeDepth: {
					max: expect.any(Number),
					mean: expect.any(Number),
				},
				basins: {
					total: expect.any(Number),
					sink: expect.any(Number),
					overflowCarrier: expect.any(Number),
					terminalLake: expect.any(Number),
				},
			});
		});

	it("applies envelope paramOverrides when recomputing hydrology maps", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-with-overrides.json");
		const statsFile = join(dir, "stats.json");
		await writeFile(
			sourceFile,
			`${JSON.stringify({
				meta: { specVersion: "forest-terrain-v1" },
				paramOverrides: {
					hydrology: {
						faQuantileThreshold: 1,
					},
				},
				tiles: [
					{ x: 0, y: 0, topography: { h: 0.9, r: 0, v: 0 } },
					{ x: 1, y: 0, topography: { h: 0.4, r: 0, v: 0 } },
					{ x: 0, y: 1, topography: { h: 0.6, r: 0, v: 0 } },
					{ x: 1, y: 1, topography: { h: 0.1, r: 0, v: 0 } },
				],
				features: { basins: [], peaks: [] },
			})}\n`,
			"utf8",
		);

		const result = await runCli([
			"--input-json",
			sourceFile,
			"--stats",
			"--stats-file",
			statsFile,
		]);
		expect(result.code).toBe(0);
		const payload = JSON.parse(result.stdout.trim());
		expect(payload.hydrologyMapsSource).toBe("recomputed");
		expect(payload.stats.streamTileCount).toBe(1);
	});

	it("treats --sink-mode as an explicit override only", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-sink-mode-override.json");
		const sourceEnvelope = JSON.parse(
			await readFile(BASELINE_ENVELOPE_FIXTURE, "utf8"),
		);
		sourceEnvelope.paramOverrides = {
			hydrology: {
				sinkMode: "overflow_guided",
			},
		};
		await writeFile(sourceFile, `${JSON.stringify(sourceEnvelope)}\n`, "utf8");

		const defaultResult = await runCli([
			"--input-json",
			sourceFile,
			"--stats",
			"--stats-file",
			join(dir, "stats-default.json"),
		]);
		const strictResult = await runCli([
			"--input-json",
			sourceFile,
			"--sink-mode",
			"strict_local",
			"--stats",
			"--stats-file",
			join(dir, "stats-strict.json"),
		]);
		const overflowResult = await runCli([
			"--input-json",
			sourceFile,
			"--sink-mode",
			"overflow_guided",
			"--stats",
			"--stats-file",
			join(dir, "stats-overflow.json"),
		]);

		expect(defaultResult.code).toBe(0);
		expect(strictResult.code).toBe(0);
		expect(overflowResult.code).toBe(0);
		const defaultPayload = JSON.parse(defaultResult.stdout.trim());
		const strictPayload = JSON.parse(strictResult.stdout.trim());
		const overflowPayload = JSON.parse(overflowResult.stdout.trim());
		expect(defaultPayload.stats.sinkCount).toBe(overflowPayload.stats.sinkCount);
		expect(defaultPayload.stats.streamTileCount).toBe(
			overflowPayload.stats.streamTileCount,
		);
		expect(defaultPayload.stats.sinkCount).not.toBe(strictPayload.stats.sinkCount);
	});

	it("fails recompute when envelope paramOverrides are invalid", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-invalid-overrides.json");
		const statsFile = join(dir, "stats.json");
		await writeFile(
			sourceFile,
			`${JSON.stringify({
				meta: { specVersion: "forest-terrain-v1" },
				paramOverrides: {
					hydrology: {
						lakeFill: {
							wetnessScale: 0.4,
							notARealKey: true,
						},
					},
				},
				tiles: [
					{ x: 0, y: 0, topography: { h: 0.9, r: 0, v: 0 } },
					{ x: 1, y: 0, topography: { h: 0.4, r: 0, v: 0 } },
				],
				features: { basins: [], peaks: [] },
			})}\n`,
			"utf8",
		);

		const result = await runCli([
			"--input-json",
			sourceFile,
			"--stats",
			"--stats-file",
			statsFile,
		]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain(
			'Unknown params key "envelope.paramOverrides.hydrology.lakeFill.notARealKey"',
		);
	});

	it("fails recompute when input tiles are not a dense rectangular grid", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-sparse-grid.json");
		const statsFile = join(dir, "stats.json");
		await writeFile(
			sourceFile,
			`${JSON.stringify({
				meta: { specVersion: "forest-terrain-v1" },
				tiles: [
					{ x: 0, y: 0, topography: { h: 0.1 } },
					{ x: 2, y: 0, topography: { h: 0.2 } },
				],
				features: { basins: [], peaks: [] },
			})}\n`,
			"utf8",
		);

		const result = await runCli([
			"--input-json",
			sourceFile,
			"--stats",
			"--stats-file",
			statsFile,
		]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("not a dense 3x1 replay grid");
		expect(result.stderr).toContain("expected=3");
		expect(result.stderr).toContain("observedTileCount=2");
	});

	it("fails recompute when duplicate coordinates are present", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-duplicate-grid.json");
		const statsFile = join(dir, "stats.json");
		await writeFile(
			sourceFile,
			`${JSON.stringify({
				meta: { specVersion: "forest-terrain-v1" },
				tiles: [
					{ x: 0, y: 0, topography: { h: 0.1 } },
					{ x: 0, y: 0, topography: { h: 0.2 } },
					{ x: 1, y: 0, topography: { h: 0.3 } },
				],
				features: { basins: [], peaks: [] },
			})}\n`,
			"utf8",
		);

		const result = await runCli([
			"--input-json",
			sourceFile,
			"--stats",
			"--stats-file",
			statsFile,
		]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("duplicate tile coordinates at (0,0)");
	});

	it("fails recompute when any tile is missing topography.h", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-missing-h.json");
		const statsFile = join(dir, "stats.json");
		await writeFile(
			sourceFile,
			`${JSON.stringify({
				meta: { specVersion: "forest-terrain-v1" },
				tiles: [
					{ x: 0, y: 0, topography: { h: 0.1 } },
					{ x: 1, y: 0, topography: {} },
				],
				features: { basins: [], peaks: [] },
			})}\n`,
			"utf8",
		);

		const result = await runCli([
			"--input-json",
			sourceFile,
			"--stats",
			"--stats-file",
			statsFile,
		]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain('missing "topography.h"');
		expect(result.stderr).toContain("tile index 1");
		expect(result.stderr).toContain("(1,0)");
	});

	it("writes all viz outputs and stats to debug dir without stream trace args", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source.json");
		const debugDir = join(dir, "debug");
		await mkdir(debugDir, { recursive: true });
		await writeFile(
			sourceFile,
			`${JSON.stringify({
				meta: { specVersion: "forest-terrain-v1" },
				tiles: [
					{ x: 0, y: 0, topography: { h: 0.8, r: 0, v: 0 } },
					{ x: 1, y: 0, topography: { h: 0.4, r: 0, v: 0 } },
					{ x: 0, y: 1, topography: { h: 0.2, r: 0, v: 0 } },
					{ x: 1, y: 1, topography: { h: 0, r: 0, v: 0 } },
				],
				features: { basins: [], peaks: [] },
			})}\n`,
			"utf8",
		);
		await writeFile(
			join(debugDir, "topography.json"),
			`${JSON.stringify({
				tiles: [
					{ index: 0, x: 0, y: 0, topography: { h: 0.8 } },
					{ index: 1, x: 1, y: 0, topography: { h: 0.4 } },
					{ index: 2, x: 0, y: 1, topography: { h: 0.2 } },
					{ index: 3, x: 1, y: 1, topography: { h: 0.0 } },
				],
			})}\n`,
			"utf8",
		);
		await writeFile(
			join(debugDir, "fd.json"),
			`${JSON.stringify({
				tiles: [
					{ index: 0, x: 0, y: 0, fd: 1 },
					{ index: 1, x: 1, y: 0, fd: 2 },
					{ index: 2, x: 0, y: 1, fd: 0 },
					{ index: 3, x: 1, y: 1, fd: 255 },
				],
			})}\n`,
			"utf8",
		);
		await writeFile(
			join(debugDir, "fa.json"),
			`${JSON.stringify({
				tiles: [
					{ index: 0, x: 0, y: 0, fa: 1 },
					{ index: 1, x: 1, y: 0, fa: 3 },
					{ index: 2, x: 0, y: 1, fa: 8 },
					{ index: 3, x: 1, y: 1, fa: 12 },
				],
			})}\n`,
			"utf8",
		);
		await writeFile(
			join(debugDir, "fa-normalized.json"),
			`${JSON.stringify({
				tiles: [
					{ index: 0, x: 0, y: 0, faN: 0.08 },
					{ index: 1, x: 1, y: 0, faN: 0.25 },
					{ index: 2, x: 0, y: 1, faN: 0.66 },
					{ index: 3, x: 1, y: 1, faN: 1.0 },
				],
			})}\n`,
			"utf8",
		);
		await writeFile(
			join(debugDir, "hydrology.json"),
			`${JSON.stringify({
				tiles: [
					{
						index: 0,
						x: 0,
						y: 0,
						hydrology: { fd: 1, fa: 1, faN: 0.08, isStream: false },
					},
					{
						index: 1,
						x: 1,
						y: 0,
						hydrology: { fd: 2, fa: 3, faN: 0.25, isStream: false },
					},
					{
						index: 2,
						x: 0,
						y: 1,
						hydrology: { fd: 0, fa: 8, faN: 0.66, isStream: true },
					},
					{
						index: 3,
						x: 1,
						y: 1,
						hydrology: { fd: 255, fa: 12, faN: 1, isStream: true },
					},
				],
			})}\n`,
			"utf8",
		);

		const result = await runCli([
			"--input-json",
			sourceFile,
			"--viz",
			"all",
			"--debug-dir",
			debugDir,
			"--stats",
			"--force",
		]);
		expect(result.code).toBe(0);
		const payload = JSON.parse(result.stdout.trim());
		expect(payload.viz.writtenFiles).toHaveLength(5);
		expect(payload.stats).toBeDefined();
		await expect(stat(join(debugDir, "fa.ppm"))).resolves.toBeDefined();
		await expect(stat(join(debugDir, "fd.ppm"))).resolves.toBeDefined();
		await expect(
			stat(join(debugDir, "fa-normalized.ppm")),
		).resolves.toBeDefined();
		await expect(stat(join(debugDir, "carry-over.ppm"))).resolves.toBeDefined();
		await expect(stat(join(debugDir, "hydrology.ppm"))).resolves.toBeDefined();
		await expect(
			stat(join(debugDir, "hydrology-inspector-stats.json")),
		).resolves.toBeDefined();
	});

	it("requires --force when viz target file already exists", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source.json");
		const debugDir = join(dir, "debug");
		await mkdir(debugDir, { recursive: true });
		await writeFile(
			sourceFile,
			`${JSON.stringify({
				meta: { specVersion: "forest-terrain-v1" },
				tiles: [{ x: 0, y: 0, topography: { h: 0.8, r: 0, v: 0 } }],
				features: { basins: [], peaks: [] },
			})}\n`,
			"utf8",
		);
		await writeFile(
			join(debugDir, "topography.json"),
			`${JSON.stringify({
				tiles: [{ index: 0, x: 0, y: 0, topography: { h: 0.8 } }],
			})}\n`,
			"utf8",
		);
		await writeFile(
			join(debugDir, "fa.json"),
			`${JSON.stringify({
				tiles: [{ index: 0, x: 0, y: 0, fa: 1 }],
			})}\n`,
			"utf8",
		);
		await writeFile(join(debugDir, "fa.ppm"), "existing", "utf8");

		const result = await runCli([
			"--input-json",
			sourceFile,
			"--viz",
			"fa",
			"--debug-dir",
			debugDir,
		]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("Output file already exists");
	});
});
