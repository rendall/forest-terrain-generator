import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
	it("emits hydrology fd/fa/faN and basin-water fields in debug output for generated terrain", async () => {
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
		expect(hydrology.tiles[0].hydrology).not.toHaveProperty("isStream");
		expect(hydrology.tiles[0].hydrology).not.toHaveProperty("waterClass");
		expect(hydrology.tiles[0].hydrology).toHaveProperty("lakeBasinId");

		await expect(stat(join(outDir, "fd.json"))).resolves.toBeDefined();
		await expect(stat(join(outDir, "fa.json"))).resolves.toBeDefined();
		await expect(
			stat(join(outDir, "fa-normalized.json")),
		).resolves.toBeDefined();

		const fd = JSON.parse(await readFile(join(outDir, "fd.json"), "utf8"));
		const fa = JSON.parse(await readFile(join(outDir, "fa.json"), "utf8"));
		const faNormalized = JSON.parse(
			await readFile(join(outDir, "fa-normalized.json"), "utf8"),
		);
		expect(fd.tiles[0]).toHaveProperty("fd");
		expect(fa.tiles[0]).toHaveProperty("fa");
		expect(faNormalized.tiles[0]).toHaveProperty("faN");
		await expect(stat(join(outDir, "stream-mask.json"))).rejects.toThrow();
	});

	it("omits waterSurfaceH and waterDepth when no basin water surface is present", async () => {
		const dir = await makeTempDir();
		const outDir = join(dir, "debug");
		const paramsFile = join(dir, "params.json");
		await writeFile(
			paramsFile,
			`${JSON.stringify(
				{
					hydrology: {
						lakeFill: {
							wetnessScale: 0,
						},
					},
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
		const result = await runCli([
			"debug",
			"--seed",
			"42",
			"--width",
			"4",
			"--height",
			"4",
			"--params",
			paramsFile,
			"--output-dir",
			outDir,
		]);
		expect(result.code).toBe(0);
		const hydrologyRaw = await readFile(join(outDir, "hydrology.json"), "utf8");
		const hydrology = JSON.parse(hydrologyRaw);
		const tilesWithoutSurface = hydrology.tiles.filter(
			(tile) => tile?.hydrology?.lakeBasinId === null,
		);
		expect(tilesWithoutSurface.length).toBeGreaterThan(0);
		tilesWithoutSurface.forEach((tile) => {
			expect(tile.hydrology).not.toHaveProperty("waterSurfaceH");
			expect(tile.hydrology).not.toHaveProperty("waterDepth");
		});
	});

	it("omits basin-level waterSurfaceH for dry basins in both features and lake accounting", async () => {
		const dir = await makeTempDir();
		const outDir = join(dir, "debug");
		const paramsFile = join(dir, "params.json");
		await writeFile(
			paramsFile,
			`${JSON.stringify(
				{
					hydrology: {
						lakeFill: {
							wetnessScale: 0,
						},
					},
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
		const result = await runCli([
			"debug",
			"--seed",
			"42",
			"--width",
			"16",
			"--height",
			"16",
			"--params",
			paramsFile,
			"--output-dir",
			outDir,
		]);
		expect(result.code).toBe(0);

		const topography = JSON.parse(
			await readFile(join(outDir, "topography.json"), "utf8"),
		);
		const hydrology = JSON.parse(
			await readFile(join(outDir, "hydrology.json"), "utf8"),
		);
		const featureBasins = topography.features.basins;
		const accountingBasins = hydrology.lakeAccounting.basins;
		expect(featureBasins.length).toBeGreaterThan(0);
		expect(accountingBasins.length).toBeGreaterThan(0);

		const featureById = new Map(
			featureBasins.map((basin) => [basin.id, basin]),
		);
		accountingBasins.forEach((basin) => {
			const featureBasin = featureById.get(basin.id);
			expect(featureBasin).toBeDefined();
			expect(Object.hasOwn(featureBasin, "waterSurfaceH")).toBe(false);
			expect(Object.hasOwn(basin, "waterSurfaceH")).toBe(false);
		});
	});

	it("emits waterSurfaceH and waterDepth on tiles with basin surface even when lakeMask is false", async () => {
		const dir = await makeTempDir();
		const outDir = join(dir, "debug");
		const result = await runCli([
			"debug",
			"--seed",
			"42",
			"--width",
			"16",
			"--height",
			"16",
			"--output-dir",
			outDir,
		]);
		expect(result.code).toBe(0);
		const hydrologyRaw = await readFile(join(outDir, "hydrology.json"), "utf8");
		const hydrology = JSON.parse(hydrologyRaw);
		const subsurfaceTiles = hydrology.tiles.filter(
			(tile) =>
				tile?.hydrology?.lakeMask === false &&
				tile?.hydrology?.lakeBasinId !== null &&
				Object.hasOwn(tile.hydrology, "waterSurfaceH"),
		);
		expect(subsurfaceTiles.length).toBeGreaterThan(0);
		subsurfaceTiles.forEach((tile) => {
			expect(tile.hydrology).toHaveProperty("waterDepth");
		});
	});

	it("emits basin-level waterSurfaceH for wet basins without drift between features and lake accounting", async () => {
		const dir = await makeTempDir();
		const outDir = join(dir, "debug");
		const result = await runCli([
			"debug",
			"--seed",
			"42",
			"--width",
			"16",
			"--height",
			"16",
			"--output-dir",
			outDir,
		]);
		expect(result.code).toBe(0);

		const topography = JSON.parse(
			await readFile(join(outDir, "topography.json"), "utf8"),
		);
		const hydrology = JSON.parse(
			await readFile(join(outDir, "hydrology.json"), "utf8"),
		);
		const featureBasins = topography.features.basins;
		const accountingBasins = hydrology.lakeAccounting.basins;
		expect(featureBasins.length).toBeGreaterThan(0);
		expect(accountingBasins.length).toBeGreaterThan(0);

		const featureById = new Map(
			featureBasins.map((basin) => [basin.id, basin]),
		);
		let wetBasinCount = 0;
		accountingBasins.forEach((basin) => {
			const featureBasin = featureById.get(basin.id);
			expect(featureBasin).toBeDefined();
			const featureHas = Object.hasOwn(featureBasin, "waterSurfaceH");
			const accountingHas = Object.hasOwn(basin, "waterSurfaceH");
			expect(accountingHas).toBe(featureHas);
			if (accountingHas) {
				wetBasinCount += 1;
				expect(typeof basin.waterSurfaceH).toBe("number");
				expect(typeof featureBasin.waterSurfaceH).toBe("number");
			}
		});
		expect(wetBasinCount).toBeGreaterThan(0);
	});
});
