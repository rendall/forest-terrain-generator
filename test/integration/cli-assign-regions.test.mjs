import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

function makeTile(x, y, biome) {
	return {
		x,
		y,
		topography: { h: 0, r: 0, v: 0, slopeMag: 0, aspectDeg: 0, landform: "flat" },
		hydrology: {
			fd: 255,
			fa: 1,
			faN: 0,
			lakeMask: false,
			isStream: false,
			distWater: 0,
			moisture: 0,
			waterClass: "none",
		},
		ecology: {
			biome,
			treeDensity: 0,
			canopyCover: 0,
			dominant: [],
			ground: { soil: "sandy_till", firmness: 0.5, surfaceFlags: [] },
			roughness: { obstruction: 0, featureFlags: [] },
		},
		navigation: {
			moveCost: 1,
			followable: [],
			passability: {
				N: "passable",
				NE: "passable",
				E: "passable",
				SE: "passable",
				S: "passable",
				SW: "passable",
				W: "passable",
				NW: "passable",
			},
		},
	};
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

	it("emits parentRegionId for enclosed island regions", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-manual.json");
		const enrichedFile = join(dir, "enriched-manual.json");

		const tiles = [];
		for (let y = 0; y < 3; y += 1) {
			for (let x = 0; x < 3; x += 1) {
				const biome = x === 1 && y === 1 ? "lake" : "pine_heath";
				tiles.push(makeTile(x, y, biome));
			}
		}
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					tiles,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const assignResult = await runCli(ASSIGN_REGIONS_CLI_ENTRY, [
			"--input-file",
			sourceFile,
			"--output-file",
			enrichedFile,
		]);
		expect(assignResult.code).toBe(0);

		const parsed = JSON.parse(await readFile(enrichedFile, "utf8"));
		expect(parsed.regions).toHaveLength(2);
		expect(parsed.regions[1].parentRegionId).toBe(0);
	});
});
