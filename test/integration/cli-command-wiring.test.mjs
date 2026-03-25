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

function createReplaySourceEnvelope({ tiles, paramOverrides } = {}) {
	return {
		meta: { specVersion: "forest-terrain-v1" },
		features: {
			basins: [{ id: "stale_basin", childIds: [] }],
			peaks: [{ id: "stale_peak", childIds: [] }],
		},
		tiles: tiles ?? [
			{
				index: 0,
				x: 0,
				y: 0,
				featureIds: ["stale_basin"],
				activeFeatureIds: ["stale_basin"],
				topography: { h: 0.1, r: 0, v: 0 },
				hydrology: { fd: 7, fa: 1, faN: 0.1 },
			},
			{
				index: 1,
				x: 1,
				y: 0,
				featureIds: ["stale_basin"],
				activeFeatureIds: ["stale_basin"],
				topography: { h: 0.3, r: 0, v: 0 },
				hydrology: { fd: 7, fa: 2, faN: 0.2 },
			},
			{
				index: 2,
				x: 2,
				y: 0,
				featureIds: ["stale_basin"],
				activeFeatureIds: ["stale_basin"],
				topography: { h: 0.05, r: 0, v: 0 },
				hydrology: { fd: 7, fa: 3, faN: 0.3 },
			},
			{
				index: 3,
				x: 0,
				y: 1,
				featureIds: ["stale_basin"],
				activeFeatureIds: ["stale_basin"],
				topography: { h: 0.15, r: 0, v: 0 },
				hydrology: { fd: 7, fa: 4, faN: 0.4 },
			},
			{
				index: 4,
				x: 1,
				y: 1,
				featureIds: ["stale_basin"],
				activeFeatureIds: ["stale_basin"],
				topography: { h: 0.35, r: 0, v: 0 },
				hydrology: { fd: 7, fa: 5, faN: 0.5 },
			},
			{
				index: 5,
				x: 2,
				y: 1,
				featureIds: ["stale_basin"],
				activeFeatureIds: ["stale_basin"],
				topography: { h: 0.4, r: 0, v: 0 },
				hydrology: { fd: 7, fa: 6, faN: 0.6 },
			},
		],
		paramOverrides: paramOverrides ?? {
			hydrology: {
				lakeFill: {
					wetnessScale: 0,
				},
			},
		},
	};
}

function createSeeOverlayEnvelope() {
	return {
		meta: { specVersion: "forest-terrain-v1" },
		tiles: [
			{
				x: 0,
				y: 0,
				topography: { h: 0.2, r: 0.9, v: 0.1 },
				hydrology: {
					stream: {
						outgoingDirection: "e",
						incomingDirections: [],
					},
				},
			},
			{
				x: 1,
				y: 0,
				topography: { h: 0.4, r: 0.8, v: 0.2 },
				hydrology: {
					waterDepth: 0.5,
					stream: {
						outgoingDirection: null,
						incomingDirections: ["w"],
					},
				},
			},
			{
				x: 0,
				y: 1,
				topography: { h: 0.6, r: 0.7, v: 0.3 },
				hydrology: {
					waterDepth: 1,
				},
			},
			{
				x: 1,
				y: 1,
				topography: { h: 0.8, r: 0.6, v: 0.4 },
				hydrology: {},
			},
		],
	};
}

function parseNetpbm(imageBuffer) {
	const headerEnd = imageBuffer.indexOf("\n255\n");
	expect(headerEnd).toBeGreaterThan(0);
	const header = imageBuffer.subarray(0, headerEnd + 5).toString("ascii");
	const [magic, dimensions] = header.trim().split("\n");
	const [width, height] = dimensions
		.split(" ")
		.map((raw) => Number.parseInt(raw, 10));
	return {
		magic,
		width,
		height,
		pixels: Array.from(imageBuffer.subarray(headerEnd + 5)),
	};
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

	it("wires see --landforms to render classes from feature IDs", async () => {
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
							activeFeatureIds: ["b_00001"],
							topography: {
								h: 0.1,
								r: 0.2,
								v: 0.3,
							},
						},
						{
							x: 1,
							y: 0,
							activeFeatureIds: ["p_00001"],
							topography: {
								h: 0.2,
								r: 0.3,
								v: 0.4,
							},
						},
						{
							x: 0,
							y: 1,
							activeFeatureIds: [],
							topography: {
								h: 0.3,
								r: 0.4,
								v: 0.5,
							},
						},
						{
							x: 1,
							y: 1,
							activeFeatureIds: ["b_00002", "p_00002"],
							topography: {
								h: 0.4,
								r: 0.5,
								v: 0.6,
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

	it("rejects see overlays outside water and stream", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-overlay.json");
		await writeFile(
			sourceFile,
			`${JSON.stringify(createSeeOverlayEnvelope(), null, 2)}\n`,
			"utf8",
		);

		const result = await runCli([
			"see",
			"--input-file",
			sourceFile,
			"--output-file",
			join(dir, "overlay.ppm"),
			"--overlay",
			"lava",
		]);

		expect(result.code).toBe(2);
		expect(result.stderr).toContain(
			'Invalid --overlay value "lava". Expected comma-separated values from: water, stream.',
		);
	});

	it("renders exact grayscale bytes for see without overlays", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-overlay.json");
		const imageFile = join(dir, "height.pgm");
		await writeFile(
			sourceFile,
			`${JSON.stringify(createSeeOverlayEnvelope(), null, 2)}\n`,
			"utf8",
		);

		const result = await runCli([
			"see",
			"--input-file",
			sourceFile,
			"--output-file",
			imageFile,
		]);
		expect(result.code).toBe(0);

		const image = parseNetpbm(await readFile(imageFile));
		expect(image.magic).toBe("P5");
		expect(image.width).toBe(2);
		expect(image.height).toBe(2);
		expect(image.pixels).toEqual([51, 102, 153, 204]);
	});

	it("renders water overlay pixels against the height background", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-overlay.json");
		const imageFile = join(dir, "water.ppm");
		await writeFile(
			sourceFile,
			`${JSON.stringify(createSeeOverlayEnvelope(), null, 2)}\n`,
			"utf8",
		);

		const result = await runCli([
			"see",
			"--input-file",
			sourceFile,
			"--output-file",
			imageFile,
			"--overlay",
			"water",
		]);
		expect(result.code).toBe(0);

		const image = parseNetpbm(await readFile(imageFile));
		expect(image.magic).toBe("P6");
		expect(image.width).toBe(2);
		expect(image.height).toBe(2);
		expect(image.pixels).toEqual([
			51, 51, 51, 51, 51, 179, 0, 0, 255, 204, 204, 204,
		]);
	});

	it("renders stream overlay pixels as yellow at 50% alpha", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-overlay.json");
		const imageFile = join(dir, "stream.ppm");
		await writeFile(
			sourceFile,
			`${JSON.stringify(createSeeOverlayEnvelope(), null, 2)}\n`,
			"utf8",
		);

		const result = await runCli([
			"see",
			"--input-file",
			sourceFile,
			"--output-file",
			imageFile,
			"--overlay",
			"stream",
		]);
		expect(result.code).toBe(0);

		const image = parseNetpbm(await readFile(imageFile));
		expect(image.magic).toBe("P6");
		expect(image.pixels).toEqual([
			153, 153, 26, 179, 179, 51, 153, 153, 153, 204, 204, 204,
		]);
	});

	it("renders combined water and stream overlays with stream compositing on top", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-overlay.json");
		const imageFile = join(dir, "combined.ppm");
		await writeFile(
			sourceFile,
			`${JSON.stringify(createSeeOverlayEnvelope(), null, 2)}\n`,
			"utf8",
		);

		const result = await runCli([
			"see",
			"--input-file",
			sourceFile,
			"--output-file",
			imageFile,
			"--overlay",
			"water,stream",
		]);
		expect(result.code).toBe(0);

		const image = parseNetpbm(await readFile(imageFile));
		expect(image.magic).toBe("P6");
		expect(image.pixels).toEqual([
			153, 153, 26, 153, 153, 90, 0, 0, 255, 204, 204, 204,
		]);
	});

	it("produces deterministic see overlay bytes across repeat runs", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-overlay.json");
		const firstImageFile = join(dir, "combined-a.ppm");
		const secondImageFile = join(dir, "combined-b.ppm");
		await writeFile(
			sourceFile,
			`${JSON.stringify(createSeeOverlayEnvelope(), null, 2)}\n`,
			"utf8",
		);

		const firstResult = await runCli([
			"see",
			"--input-file",
			sourceFile,
			"--output-file",
			firstImageFile,
			"--overlay",
			"water,stream",
		]);
		const secondResult = await runCli([
			"see",
			"--input-file",
			sourceFile,
			"--output-file",
			secondImageFile,
			"--overlay",
			"water,stream",
		]);
		expect(firstResult.code).toBe(0);
		expect(secondResult.code).toBe(0);

		const firstImage = await readFile(firstImageFile);
		const secondImage = await readFile(secondImageFile);
		expect(firstImage.equals(secondImage)).toBe(true);
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
		parsed.tiles.forEach((tile) => {
			expect(tile.hydrology).toMatchObject({
				fd: expect.any(Number),
				fa: expect.any(Number),
				faN: expect.any(Number),
			});
			expect(tile.hydrology).not.toHaveProperty("isStream");
			expect(tile.hydrology).not.toHaveProperty("waterClass");
			if ("waterSurfaceH" in tile.hydrology) {
				expect(tile.hydrology).toHaveProperty("waterDepth");
			} else {
				expect(tile.hydrology).not.toHaveProperty("waterDepth");
			}
		});
	});

	it("persists non-default params as top-level paramOverrides in generated envelopes", async () => {
		const dir = await makeTempDir();
		const outputFile = join(dir, "generated.json");
		const paramsFile = join(dir, "params.json");
		await writeFile(
			paramsFile,
			`${JSON.stringify(
				{
					hydrology: {
						lakeFill: {
							wetnessScale: 0.1,
						},
					},
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli([
			"generate",
			"--seed",
			"42",
			"--width",
			"4",
			"--height",
			"4",
			"--params",
			paramsFile,
			"--output-file",
			outputFile,
		]);

		expect(result.code).toBe(0);
		const parsed = JSON.parse(await readFile(outputFile, "utf8"));
		expect(parsed.paramOverrides).toEqual({
			hydrology: {
				lakeFill: {
					wetnessScale: 0.1,
				},
			},
		});
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
			"fd.json",
			"fa.json",
			"fa-normalized.json",
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

	it("wires debug hydrology viz+stats and writes artifacts after debug output", async () => {
		const dir = await makeTempDir();
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
			"--hydrology-viz",
			"all",
			"--hydrology-inspector-stats",
			"--force",
		]);

		expect(result.code).toBe(0);
		await expect(stat(join(outputDir, "fa.ppm"))).resolves.toBeDefined();
		await expect(stat(join(outputDir, "fd.ppm"))).resolves.toBeDefined();
		await expect(
			stat(join(outputDir, "fa-normalized.ppm")),
		).resolves.toBeDefined();
		await expect(stat(join(outputDir, "hydrology.ppm"))).resolves.toBeDefined();
		await expect(
			stat(join(outputDir, "hydrology-inspector-stats.json")),
		).resolves.toBeDefined();
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

	it("recomputes structure and hydrology for debug --input-file and writes recomputed replay envelope", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-envelope.json");
		const outputDir = join(dir, "debug");
		const debugOutputFile = join(dir, "debug-envelope.json");
		const sourceEnvelope = createReplaySourceEnvelope();
		sourceEnvelope.tiles = sourceEnvelope.tiles.map((tile) => ({
			...tile,
			topography: {
				...tile.topography,
				structure: {
					basinLike: false,
					ridgeLike: true,
				},
			},
		}));
		await writeFile(
			sourceFile,
			`${JSON.stringify(sourceEnvelope, null, 2)}\n`,
			"utf8",
		);

		const result = await runCli([
			"debug",
			"--input-file",
			sourceFile,
			"--output-dir",
			outputDir,
			"--debug-output-file",
			debugOutputFile,
		]);
		expect(result.code).toBe(0);

		const replayEnvelope = JSON.parse(await readFile(debugOutputFile, "utf8"));
		expect(replayEnvelope.features.basins.length).toBeGreaterThan(0);
		expect(Array.isArray(replayEnvelope.features.peaks)).toBe(true);
		expect(
			replayEnvelope.features.basins.some(
				(basin) => basin.id === "stale_basin",
			),
		).toBe(false);
		expect(
			replayEnvelope.tiles.every(
				(tile) =>
					Array.isArray(tile.featureIds) &&
					!tile.featureIds.includes("stale_basin"),
			),
		).toBe(true);
		expect(replayEnvelope.paramOverrides).toEqual({
			hydrology: {
				lakeFill: {
					wetnessScale: 0,
				},
			},
		});
		expect(Array.isArray(replayEnvelope.tiles)).toBe(true);
		replayEnvelope.tiles.forEach((tile) => {
			expect(tile.hydrology).toMatchObject({
				fd: expect.any(Number),
				fa: expect.any(Number),
				faN: expect.any(Number),
			});
			expect(tile.hydrology).not.toHaveProperty("isStream");
			expect(tile.hydrology).not.toHaveProperty("waterClass");
			expect(tile.topography?.structure).toBeUndefined();
			if ("waterSurfaceH" in tile.hydrology) {
				expect(tile.hydrology).toHaveProperty("waterDepth");
			} else {
				expect(tile.hydrology).not.toHaveProperty("waterDepth");
			}
		});

		const debugTopography = JSON.parse(
			await readFile(join(outputDir, "topography.json"), "utf8"),
		);
		expect(
			debugTopography.features.basins.some(
				(basin) => basin.id === "stale_basin",
			),
		).toBe(false);
		expect(
			debugTopography.tiles.every(
				(tile) => tile.topography?.structure === undefined,
			),
		).toBe(true);
	});

	it("applies --params over envelope paramOverrides in debug --input-file mode and warns once", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-envelope.json");
		const paramsFile = join(dir, "params.json");
		const outputDir = join(dir, "debug");
		const debugOutputFile = join(dir, "debug-envelope.json");
		await writeFile(
			sourceFile,
			`${JSON.stringify(createReplaySourceEnvelope(), null, 2)}\n`,
			"utf8",
		);
		await writeFile(
			paramsFile,
			`${JSON.stringify(
				{
					hydrology: {
						lakeFill: {
							wetnessScale: 0.9,
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
			"--input-file",
			sourceFile,
			"--params",
			paramsFile,
			"--output-dir",
			outputDir,
			"--debug-output-file",
			debugOutputFile,
		]);
		expect(result.code).toBe(0);
		expect(result.stderr).toContain(
			"precedence: defaults -> envelope.paramOverrides -> --params <file>",
		);
		expect(
			result.stderr.match(
				/precedence: defaults -> envelope\.paramOverrides -> --params <file>/g,
			)?.length ?? 0,
		).toBe(1);

		const replayEnvelope = JSON.parse(await readFile(debugOutputFile, "utf8"));
		expect(replayEnvelope.paramOverrides).toEqual({
			hydrology: {
				lakeFill: {
					wetnessScale: 0.9,
				},
			},
		});
	});

	it("fails debug replay when envelope paramOverrides are invalid", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-envelope.json");
		const outputDir = join(dir, "debug");
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				createReplaySourceEnvelope({
					paramOverrides: {
						hydrology: {
							lakeFill: {
								wetnessScale: 0.5,
								notARealKey: true,
							},
						},
					},
				}),
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli([
			"debug",
			"--input-file",
			sourceFile,
			"--output-dir",
			outputDir,
		]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain(
			'Unknown params key "envelope.paramOverrides.hydrology.lakeFill.notARealKey"',
		);
	});

	it("fails debug replay when any tile is missing topography.h", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-envelope.json");
		const outputDir = join(dir, "debug");
		const tiles = createReplaySourceEnvelope().tiles.map((tile) => ({
			...tile,
		}));
		delete tiles[3].topography.h;
		await writeFile(
			sourceFile,
			`${JSON.stringify(createReplaySourceEnvelope({ tiles }), null, 2)}\n`,
			"utf8",
		);

		const result = await runCli([
			"debug",
			"--input-file",
			sourceFile,
			"--output-dir",
			outputDir,
		]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain('missing "topography.h"');
		expect(result.stderr).toContain("tile index 3");
		expect(result.stderr).toContain("(0,1)");
	});

	it("fails debug replay when input tiles are not a dense rectangular grid", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-envelope.json");
		const outputDir = join(dir, "debug");
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				createReplaySourceEnvelope({
					tiles: [
						{ x: 0, y: 0, topography: { h: 0.1 } },
						{ x: 2, y: 0, topography: { h: 0.2 } },
					],
				}),
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli([
			"debug",
			"--input-file",
			sourceFile,
			"--output-dir",
			outputDir,
		]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("not a dense 3x1 replay grid");
		expect(result.stderr).toContain("expected=3");
		expect(result.stderr).toContain("observedTileCount=2");
	});

	it("fails debug replay when duplicate coordinates are present", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-envelope.json");
		const outputDir = join(dir, "debug");
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				createReplaySourceEnvelope({
					tiles: [
						{ x: 0, y: 0, topography: { h: 0.1 } },
						{ x: 0, y: 0, topography: { h: 0.2 } },
						{ x: 2, y: 0, topography: { h: 0.3 } },
					],
				}),
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli([
			"debug",
			"--input-file",
			sourceFile,
			"--output-dir",
			outputDir,
		]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("duplicate tile coordinates at (0,0)");
		expect(result.stderr).toContain("first tile index=0");
		expect(result.stderr).toContain("duplicate tile index=1");
	});

	it("fails debug replay when replay grid exceeds allocation cap", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-envelope.json");
		const outputDir = join(dir, "debug");
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				createReplaySourceEnvelope({
					tiles: [{ x: 5000, y: 5000, topography: { h: 0.2 } }],
				}),
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli([
			"debug",
			"--input-file",
			sourceFile,
			"--output-dir",
			outputDir,
		]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("exceed replay allocation cap");
		expect(result.stderr).toContain("maxAllowedTiles=16777216");
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
