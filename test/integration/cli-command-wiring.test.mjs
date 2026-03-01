import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

describe("CLI command wiring and contract failures", () => {
	it("wires see to write grayscale PGM from topography.h", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source.json");
		const imageFile = join(dir, "height.pgm");

		const generateResult = await runCli([
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

		const seeResult = await runCli([
			"see",
			"--input-file",
			sourceFile,
			"--output-file",
			imageFile,
		]);
		expect(seeResult.code).toBe(0);

		const pgm = await readFile(imageFile);
		expect(pgm.subarray(0, 3).toString("ascii")).toBe("P5\n");

		const headerEnd = pgm.indexOf("\n255\n");
		expect(headerEnd).toBeGreaterThan(0);
		const header = pgm.subarray(0, headerEnd + 5).toString("ascii");
		expect(header).toContain("4 4");

		const pixelBytes = pgm.length - (headerEnd + 5);
		expect(pixelBytes).toBe(16);
	});

	it("wires see --landforms to render structure classes", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-landforms.json");
		const imageFile = join(dir, "landforms.pgm");
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					tiles: [
						{
							x: 0,
							y: 0,
							topography: {
								h: 0.1,
								r: 0.2,
								v: 0.3,
								structure: { basinLike: true, ridgeLike: false },
							},
						},
						{
							x: 1,
							y: 0,
							topography: {
								h: 0.2,
								r: 0.3,
								v: 0.4,
								structure: { basinLike: false, ridgeLike: true },
							},
						},
						{
							x: 0,
							y: 1,
							topography: {
								h: 0.3,
								r: 0.4,
								v: 0.5,
								structure: { basinLike: false, ridgeLike: false },
							},
						},
						{
							x: 1,
							y: 1,
							topography: {
								h: 0.4,
								r: 0.5,
								v: 0.6,
								structure: { basinLike: true, ridgeLike: true },
							},
						},
					],
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const seeResult = await runCli([
			"see",
			"--input-file",
			sourceFile,
			"--output-file",
			imageFile,
			"--landforms",
		]);
		expect(seeResult.code).toBe(0);

		const pgm = await readFile(imageFile);
		const headerEnd = pgm.indexOf("\n255\n");
		expect(headerEnd).toBeGreaterThan(0);

		const dataStart = headerEnd + 5;
		const pixels = Array.from(pgm.subarray(dataStart));
		expect(pixels).toEqual([64, 224, 128, 160]);
	});

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
			outputFile,
		]);

		expect(result.code).toBe(0);
		const written = await readFile(outputFile, "utf8");
		const parsed = JSON.parse(written);
		expect(parsed.meta.specVersion).toBe("forest-terrain-v1");
		expect(Object.keys(parsed.meta)).toEqual(["specVersion"]);
		expect(written).toContain(
			'\n  "meta": {\n    "specVersion": "forest-terrain-v1"\n  },\n',
		);
		expect(written.endsWith("\n")).toBe(true);
		expect(Array.isArray(parsed.tiles)).toBe(true);
		expect(parsed.tiles.length).toBeGreaterThan(0);
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
			outputFile,
		]);

		expect(result.code).toBe(2);
		expect(result.stderr).toContain(
			"Missing required authored map for derive mode: --map-h.",
		);
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
			outputFile,
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
			debugOutputFile,
		]);

		expect(result.code).toBe(0);
		const manifestRaw = await readFile(
			join(outputDir, "debug-manifest.json"),
			"utf8",
		);
		const manifest = JSON.parse(manifestRaw);
		expect(manifest.mode).toBe("debug");
		expect(manifest.specVersion).toBe("forest-terrain-v1");
		expect(manifest.width).toBe(4);
		expect(manifest.height).toBe(4);
		expect(manifest.tileCount).toBe(16);
		expect(manifest.artifacts).toEqual([
			"topography.json",
			"hydrology.json",
			"ecology.json",
			"navigation.json",
		]);

		const topographyRaw = await readFile(
			join(outputDir, "topography.json"),
			"utf8",
		);
		const hydrologyRaw = await readFile(
			join(outputDir, "hydrology.json"),
			"utf8",
		);
		const ecologyRaw = await readFile(join(outputDir, "ecology.json"), "utf8");
		const navigationRaw = await readFile(
			join(outputDir, "navigation.json"),
			"utf8",
		);
		expect(JSON.parse(topographyRaw).tiles.length).toBe(16);
		expect(JSON.parse(hydrologyRaw).tiles.length).toBe(16);
		expect(JSON.parse(ecologyRaw).tiles.length).toBe(16);
		expect(JSON.parse(navigationRaw).tiles.length).toBe(16);

		const envelope = await readFile(debugOutputFile, "utf8");
		const parsed = JSON.parse(envelope);
		expect(parsed.meta.specVersion).toBe("forest-terrain-v1");
		expect(Object.keys(parsed.meta)).toEqual(["specVersion"]);
		expect(envelope.endsWith("\n")).toBe(true);
		expect(Array.isArray(parsed.tiles)).toBe(true);
		expect(parsed.tiles.length).toBeGreaterThan(0);
	});

	it("wires debug --input-file to output directory", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-envelope.json");
		const outputDir = join(dir, "debug-from-input");

		const generateResult = await runCli([
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

		const debugResult = await runCli([
			"debug",
			"--input-file",
			sourceFile,
			"--output-dir",
			outputDir,
		]);

		expect(debugResult.code).toBe(0);
		const manifestRaw = await readFile(
			join(outputDir, "debug-manifest.json"),
			"utf8",
		);
		const manifest = JSON.parse(manifestRaw);
		expect(manifest.mode).toBe("debug");
		expect(manifest.specVersion).toBe("forest-terrain-v1");
		expect(manifest.width).toBe(4);
		expect(manifest.height).toBe(4);
		expect(manifest.tileCount).toBe(16);
	});

	it("rejects debug --input-file when generation inputs are also provided", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-envelope.json");
		await runCli([
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

		const result = await runCli([
			"debug",
			"--input-file",
			sourceFile,
			"--seed",
			"42",
			"--output-dir",
			join(dir, "debug"),
		]);

		expect(result.code).toBe(2);
		expect(result.stderr).toContain(
			"--input-file cannot be combined with --seed in debug mode.",
		);
	});
});
