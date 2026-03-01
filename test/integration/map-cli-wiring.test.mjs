import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const MAP_CLI_ENTRY = resolve(process.cwd(), "src/cli/map.ts");
const MAIN_CLI_ENTRY = resolve(process.cwd(), "src/cli/main.ts");
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
	const dir = await mkdtemp(join(tmpdir(), "forest-terrain-generator-map-cli-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("map CLI wiring", () => {
	it("renders a PGM from envelope JSON with --input-json/--output-pgm", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source.json");
		const imageFile = join(dir, "map.pgm");

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

		const mapResult = await runCli(MAP_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--output-pgm",
			imageFile,
		]);
		expect(mapResult.code).toBe(0);

		const pgm = await readFile(imageFile);
		expect(pgm.subarray(0, 3).toString("ascii")).toBe("P5\n");
		const headerEnd = pgm.indexOf("\n255\n");
		expect(headerEnd).toBeGreaterThan(0);
		const header = pgm.subarray(0, headerEnd + 5).toString("ascii");
		expect(header).toContain("4 4");
		const pixelBytes = pgm.length - (headerEnd + 5);
		expect(pixelBytes).toBe(16);
	});

	it("applies thresholded 3-band rendering for h", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-threshold.json");
		const imageFile = join(dir, "threshold.pgm");

		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					tiles: [
						{ x: 0, y: 0, topography: { h: 0.05, r: 0.0, v: 0.0 } },
						{ x: 1, y: 0, topography: { h: 0.5, r: 0.0, v: 0.0 } },
						{ x: 2, y: 0, topography: { h: 0.95, r: 0.0, v: 0.0 } },
					],
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const mapResult = await runCli(MAP_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--output-pgm",
			imageFile,
			"--threshold",
			"0.1",
		]);
		expect(mapResult.code).toBe(0);

		const pgm = await readFile(imageFile);
		const headerEnd = pgm.indexOf("\n255\n");
		expect(headerEnd).toBeGreaterThan(0);
		const dataStart = headerEnd + 5;
		const pixels = Array.from(pgm.subarray(dataStart));
		expect(pixels).toEqual([0, 128, 255]);
	});

	it("defaults threshold mode to 0.1 when --threshold is omitted", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-default-threshold.json");
		const imageFile = join(dir, "threshold-default.pgm");

		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					tiles: [
						{ x: 0, y: 0, topography: { h: 0.05, r: 0.0, v: 0.0 } },
						{ x: 1, y: 0, topography: { h: 0.5, r: 0.0, v: 0.0 } },
						{ x: 2, y: 0, topography: { h: 0.95, r: 0.0, v: 0.0 } },
					],
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const mapResult = await runCli(MAP_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--output-pgm",
			imageFile,
		]);
		expect(mapResult.code).toBe(0);

		const pgm = await readFile(imageFile);
		const headerEnd = pgm.indexOf("\n255\n");
		expect(headerEnd).toBeGreaterThan(0);
		const dataStart = headerEnd + 5;
		const pixels = Array.from(pgm.subarray(dataStart));
		expect(pixels).toEqual([0, 128, 255]);
	});
});
