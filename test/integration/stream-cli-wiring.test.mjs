import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const STREAM_CLI_ENTRY = resolve(process.cwd(), "src/cli/stream.ts");
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
	const dir = await mkdtemp(join(tmpdir(), "forest-terrain-generator-stream-cli-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("stream CLI wiring", () => {
	it("returns routed [x,y] path as JSON", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-stream.json");
		const tiles = [];
		for (let y = 0; y < 3; y += 1) {
			for (let x = 0; x < 5; x += 1) {
				let h = 0.9;
				if (y === 1) {
					if (x === 0) h = 0.6;
					if (x === 1) h = 0.5;
					if (x === 2) h = 0.3;
					if (x === 3) h = 0.2;
					if (x === 4) h = 0.1;
				}
				tiles.push({ x, y, topography: { h, r: 0.0, v: 0.0 } });
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

		const result = await runCli(STREAM_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--x",
			"2",
			"--y",
			"1",
		]);
		expect(result.code).toBe(0);
		expect(JSON.parse(result.stdout.trim())).toEqual([
			[2, 1],
			[3, 1],
			[4, 1],
			{
				id: null,
				type: null,
				spillTileId: null,
				spillTile: null,
				reason: "local_minimum",
				stepsTaken: 3,
			},
		]);
	});

	it("writes a PPM overlay with blue stream pixels when --output-ppm is provided", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-stream-ppm.json");
		const imageFile = join(dir, "stream.ppm");

		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					tiles: [
						{ x: 0, y: 0, topography: { h: 0.3, r: 0.0, v: 0.0 } },
						{ x: 1, y: 0, topography: { h: 0.2, r: 0.0, v: 0.0 } },
						{ x: 2, y: 0, topography: { h: 0.1, r: 0.0, v: 0.0 } },
					],
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli(STREAM_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--x",
			"0",
			"--y",
			"0",
			"--output-ppm",
			imageFile,
			"--force",
		]);
		expect(result.code).toBe(0);

		const ppm = await readFile(imageFile);
		expect(ppm.subarray(0, 3).toString("ascii")).toBe("P6\n");
		const headerEnd = ppm.indexOf("\n255\n");
		expect(headerEnd).toBeGreaterThan(0);
		const header = ppm.subarray(0, headerEnd + 5).toString("ascii");
		expect(header).toContain("3 1");
		const dataStart = headerEnd + 5;
		const pixels = Array.from(ppm.subarray(dataStart));
		expect(pixels).toEqual([0, 0, 255, 0, 0, 255, 0, 0, 255]);
	});

	it("stops at sea level when it reaches h <= 0", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-stream-basin.json");
		const tiles = [];
		for (let y = 0; y < 3; y += 1) {
			for (let x = 0; x < 5; x += 1) {
				let h = 0.9;
				let featureIds = [];
				if (y === 1) {
					if (x === 0) h = 0.6;
					if (x === 1) h = 0.5;
					if (x === 2) {
						h = 0.0;
						featureIds = ["b_00000"];
					}
					if (x === 3) h = 0.2;
					if (x === 4) {
						h = 0.1;
						featureIds = ["b_00001"];
					}
				}
				tiles.push({ x, y, topography: { h, r: 0.0, v: 0.0 }, featureIds });
			}
		}
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					features: {
						basins: [
							{
								id: "b_00000",
								kind: "leaf",
								parentId: null,
								childIds: [],
								birthH: 0,
								mergeH: 0.2,
								persistence: 0.2,
								spillOutTileId: 8,
								minH: 0,
								maxH: 0,
								size: 1,
								bbox: { minX: 2, minY: 1, maxX: 2, maxY: 1 },
								tileIds: [7],
							},
							{
								id: "b_00001",
								kind: "leaf",
								parentId: null,
								childIds: [],
								birthH: 0.1,
								mergeH: null,
								persistence: null,
								spillOutTileId: null,
								minH: 0.1,
								maxH: 0.1,
								size: 1,
								bbox: { minX: 4, minY: 1, maxX: 4, maxY: 1 },
								tileIds: [9],
							},
						],
						peaks: [],
					},
					tiles,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli(STREAM_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--x",
			"1",
			"--y",
			"1",
		]);
		expect(result.code).toBe(0);
		expect(JSON.parse(result.stdout.trim())).toEqual([
			[1, 1],
			[2, 1],
			{
				id: "b_00000",
				type: "leaf",
				spillTileId: 8,
				spillTile: [3, 1],
				reason: "sea_level",
				stepsTaken: 2,
			},
		]);
	});

	it("returns input error for out-of-bounds source", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-stream-oob.json");
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					tiles: [
						{ x: 0, y: 0, topography: { h: 0.0, r: 0.0, v: 0.0 } },
						{ x: 1, y: 0, topography: { h: 0.0, r: 0.0, v: 0.0 } },
					],
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli(STREAM_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--x",
			"2",
			"--y",
			"0",
		]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("[input] stage=cli_runtime");
		expect(result.stderr).toContain("out of bounds");
	});

	it("stops at local_minimum when no lower eligible neighbor exists", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-stream-duplicate-loop.json");
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					features: {
						basins: [
							{
								id: "b_00000",
								kind: "leaf",
								parentId: null,
								childIds: [],
								birthH: 0.3,
								mergeH: 0.5,
								persistence: 0.2,
								spillOutTileId: 2,
								minH: 0.3,
								maxH: 0.3,
								size: 1,
								bbox: { minX: 1, minY: 0, maxX: 1, maxY: 0 },
								tileIds: [1],
							},
						],
						peaks: [],
					},
					tiles: [
						{ x: 0, y: 0, topography: { h: 0.4, r: 0.0, v: 0.0 } },
						{
							x: 1,
							y: 0,
							topography: { h: 0.3, r: 0.0, v: 0.0 },
							featureIds: ["b_00000"],
						},
						{ x: 0, y: 1, topography: { h: 0.5, r: 0.0, v: 0.0 } },
						{ x: 1, y: 1, topography: { h: 0.45, r: 0.0, v: 0.0 } },
					],
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli(STREAM_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--x",
			"0",
			"--y",
			"0",
		]);
		expect(result.code).toBe(0);
		expect(result.stderr.trim()).toBe("");
		expect(JSON.parse(result.stdout.trim())).toEqual([
			[0, 0],
			[1, 0],
			{
				id: "b_00000",
				type: "leaf",
				spillTileId: 2,
				spillTile: [0, 1],
				reason: "local_minimum",
				stepsTaken: 2,
			},
		]);
	});

	it("emits overflow connector/events without changing v1 path when --overflow is set", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-stream-overflow.json");
		const tiles = [];
		for (let y = 0; y < 4; y += 1) {
			for (let x = 0; x < 3; x += 1) {
				let h = 0.95;
				let featureIds = [];
				if (x === 0 && y === 1) h = 0.2;
				if (x === 1 && y === 1) {
					h = 0.1;
					featureIds = ["b_00000"];
				}
				if (x === 2 && y === 1) {
					h = 0.4;
					featureIds = ["b_00000"];
				}
				if (x === 2 && y === 2) h = 0.6;
				if (x === 1 && y === 3) h = 0.3;
				if (x === 0 && y === 3) h = 0.0;
				tiles.push({ x, y, topography: { h, r: 0, v: 0 }, featureIds });
			}
		}
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					features: {
						basins: [
							{
								id: "b_00000",
								kind: "leaf",
								parentId: "b_parent",
								childIds: [],
								birthH: 0.1,
								mergeH: 0.4,
								persistence: 0.3,
								spillOutTileId: 5,
								childSpillFromTileId: 5,
								parentContactTileId: 8,
								minH: 0.1,
								maxH: 0.4,
								size: 2,
								bbox: { minX: 1, minY: 1, maxX: 2, maxY: 1 },
								tileIds: [4, 5],
							},
						],
						peaks: [],
					},
					tiles,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli(STREAM_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--x",
			"0",
			"--y",
			"1",
			"--overflow",
			"--debug",
		]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout.trim());
		expect(parsed.path).toEqual([
			[0, 1],
			[1, 1],
			{
				id: "b_00000",
				type: "leaf",
				spillTileId: 5,
				spillTile: [2, 1],
				reason: "local_minimum",
				stepsTaken: 2,
			},
		]);
		expect(parsed.continuePathTileIds).toEqual([8, 10, 9]);
		expect(parsed.segments).toEqual([
			{
				kind: "downhill",
				startTileId: 3,
				tileIds: [3, 4],
				reason: "local_minimum",
				stepsTaken: 2,
			},
			{
				kind: "connector",
				basinId: "b_00000",
				tileIds: [4, 5],
			},
			{
				kind: "crossing",
				basinId: "b_00000",
				fromTileId: 5,
				toTileId: 8,
			},
			{
				kind: "downhill",
				startTileId: 8,
				tileIds: [8, 10, 9],
				reason: "sea_level",
				stepsTaken: 3,
			},
		]);
		expect(parsed.overflowConnectorTileIds.at(-1)).toBe(5);
		expect(parsed.overflowEvents).toEqual([
			{
				type: "overflow_connector",
				basinId: "b_00000",
				fromTileId: 4,
				toTileId: 5,
				maxHAlongPath: 0.4,
			},
			{
				type: "overflow_crossing",
				basinId: "b_00000",
				fromTileId: 5,
				toTileId: 8,
			},
			{
				type: "overflow_to_parent",
				basinId: "b_00000",
				parentBasinId: "b_parent",
				atTileId: 8,
			},
		]);
	});

	it("prints overflow summary in non-debug mode when --overflow is set", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-stream-overflow-summary.json");
		const tiles = [];
		for (let y = 0; y < 3; y += 1) {
			for (let x = 0; x < 3; x += 1) {
				let h = 0.9;
				let featureIds = [];
				if (x === 0 && y === 1) h = 0.2;
				if (x === 1 && y === 1) {
					h = 0.1;
					featureIds = ["b_00000"];
				}
				if (x === 2 && y === 1) h = 0.4;
				tiles.push({ x, y, topography: { h, r: 0, v: 0 }, featureIds });
			}
		}
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					features: {
						basins: [
							{
								id: "b_00000",
								kind: "leaf",
								parentId: null,
								childIds: [],
								birthH: 0.1,
								mergeH: 0.4,
								persistence: 0.3,
								spillOutTileId: 5,
								minH: 0.1,
								maxH: 0.4,
								size: 1,
								bbox: { minX: 1, minY: 1, maxX: 1, maxY: 1 },
								tileIds: [4],
							},
						],
						peaks: [],
					},
					tiles,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli(STREAM_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--x",
			"0",
			"--y",
			"1",
			"--overflow",
		]);
		expect(result.code).toBe(0);
		const lines = result.stdout
			.trim()
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		expect(lines.length).toBe(2);
		const path = JSON.parse(lines[0]);
		const summary = JSON.parse(lines[1]);
		expect(path).toEqual([
			[0, 1],
			[1, 1],
			{
				id: "b_00000",
				type: "leaf",
				spillTileId: 5,
				spillTile: [2, 1],
				reason: "local_minimum",
				stepsTaken: 2,
			},
		]);
		expect(summary).toEqual({
			overflow: {
				ran: true,
				connectorLen: 0,
				events: ["overflow_no_spill_edge"],
			},
		});
	});

	it("iterates overflow and emits explicit no_spill_edge when continuation sink has no spill", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-stream-overflow-iterative-stop.json");
		const tiles = [];
		for (let y = 0; y < 3; y += 1) {
			for (let x = 0; x < 3; x += 1) {
				let h = 0.95;
				let featureIds = [];
				if (x === 0 && y === 1) h = 0.2;
				if (x === 1 && y === 1) {
					h = 0.1;
					featureIds = ["b_00000"];
				}
				if (x === 2 && y === 1) {
					h = 0.4;
					featureIds = ["b_00000"];
				}
				if (x === 1 && y === 2) h = 0.35;
				if (x === 2 && y === 2) h = 0.3;
				tiles.push({ x, y, topography: { h, r: 0, v: 0 }, featureIds });
			}
		}
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					features: {
						basins: [
							{
								id: "b_00000",
								kind: "leaf",
								parentId: "b_parent",
								childIds: [],
								birthH: 0.1,
								mergeH: 0.4,
								persistence: 0.3,
								spillOutTileId: 5,
								childSpillFromTileId: 5,
								parentContactTileId: 8,
								minH: 0.1,
								maxH: 0.4,
								size: 2,
								bbox: { minX: 1, minY: 1, maxX: 2, maxY: 1 },
								tileIds: [4, 5],
							},
						],
						peaks: [],
					},
					tiles,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli(STREAM_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--x",
			"0",
			"--y",
			"1",
			"--overflow",
			"--debug",
		]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout.trim());
		expect(parsed.path).toEqual([
			[0, 1],
			[1, 1],
			{
				id: "b_00000",
				type: "leaf",
				spillTileId: 5,
				spillTile: [2, 1],
				reason: "local_minimum",
				stepsTaken: 2,
			},
		]);
		expect(parsed.continuePathTileIds).toEqual([8]);
		expect(parsed.overflowEvents.at(-1)).toEqual({
			type: "overflow_no_spill_edge",
			basinId: null,
			sinkTileId: 8,
		});
	});

	it("emits cycle_detected when continuation re-enters a previously overflowed basin sink", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-stream-overflow-cycle-detected.json");
		const tiles = [];
		for (let y = 0; y < 3; y += 1) {
			for (let x = 0; x < 3; x += 1) {
				let h = 0.95;
				let featureIds = [];
				if (x === 0 && y === 1) h = 0.2;
				if (x === 1 && y === 1) {
					h = 0.1;
					featureIds = ["b_00000"];
				}
				if (x === 2 && y === 1) {
					h = 0.15;
					featureIds = ["b_00000"];
				}
				tiles.push({ x, y, topography: { h, r: 0, v: 0 }, featureIds });
			}
		}
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					features: {
						basins: [
							{
								id: "b_00000",
								kind: "leaf",
								parentId: "b_parent",
								childIds: [],
								birthH: 0.1,
								mergeH: 0.2,
								persistence: 0.1,
								spillOutTileId: 5,
								childSpillFromTileId: 5,
								parentContactTileId: 5,
								minH: 0.1,
								maxH: 0.15,
								size: 2,
								bbox: { minX: 1, minY: 1, maxX: 2, maxY: 1 },
								tileIds: [4, 5],
							},
						],
						peaks: [],
					},
					tiles,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli(STREAM_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--x",
			"0",
			"--y",
			"1",
			"--overflow",
			"--debug",
		]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout.trim());
		expect(parsed.path).toEqual([
			[0, 1],
			[1, 1],
			{
				id: "b_00000",
				type: "leaf",
				spillTileId: 5,
				spillTile: [2, 1],
				reason: "local_minimum",
				stepsTaken: 2,
			},
		]);
		expect(parsed.continuePathTileIds).toEqual([5]);
		expect(parsed.overflowEvents.at(-1)).toEqual({
			type: "cycle_detected",
			basinId: "b_00000",
			atTileId: 5,
		});
	});

	it("uses expanded composite basin tile ownership for overflow spill-from membership", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(
			dir,
			"source-stream-overflow-composite-spill-from.json",
		);
		const tiles = [];
		for (let y = 0; y < 3; y += 1) {
			for (let x = 0; x < 3; x += 1) {
				let h = 0.95;
				let featureIds = [];
				if (x === 0 && y === 1) h = 0.3;
				if (x === 1 && y === 1) {
					h = 0.2;
					featureIds = ["b_00059"];
				}
				if (x === 2 && y === 1) {
					h = 0.25;
					featureIds = ["b_00000"];
				}
				if (x === 2 && y === 2) h = 0.85;
				tiles.push({ x, y, topography: { h, r: 0, v: 0 }, featureIds });
			}
		}
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					features: {
						basins: [
							{
								id: "b_00000",
								kind: "leaf",
								parentId: "b_00059",
								childIds: [],
								birthH: 0.25,
								mergeH: 0.4,
								persistence: 0.15,
								spillOutTileId: 8,
								childSpillFromTileId: 5,
								parentContactTileId: 8,
								minH: 0.25,
								maxH: 0.25,
								size: 1,
								bbox: { minX: 2, minY: 1, maxX: 2, maxY: 1 },
								tileIds: [5],
							},
							{
								id: "b_00059",
								kind: "composite",
								parentId: null,
								childIds: ["b_00000"],
								birthH: 0.2,
								mergeH: null,
								persistence: null,
								spillOutTileId: 8,
								childSpillFromTileId: 5,
								parentContactTileId: 8,
								minH: 0.2,
								maxH: 0.25,
								size: 1,
								bbox: { minX: 1, minY: 1, maxX: 1, maxY: 1 },
								tileIds: [4],
							},
						],
						peaks: [],
					},
					tiles,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli(STREAM_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--x",
			"0",
			"--y",
			"1",
			"--overflow",
			"--debug",
		]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout.trim());
		expect(parsed.path).toEqual([
			[0, 1],
			[1, 1],
			{
				id: "b_00059",
				type: "composite",
				spillTileId: 8,
				spillTile: [2, 2],
				reason: "local_minimum",
				stepsTaken: 2,
			},
		]);
		expect(parsed.overflowEvents.some((event) => event.type === "overflow_connector")).toBe(
			true,
		);
		expect(
			parsed.overflowEvents.some(
				(event) => event.type === "overflow_no_spill_tile_in_basin",
			),
		).toBe(false);
	});

	it("renders connector color in PPM when overflow connector exists", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-stream-overflow-ppm.json");
		const imageFile = join(dir, "stream-overflow.ppm");
		const tiles = [];
		for (let y = 0; y < 3; y += 1) {
			for (let x = 0; x < 3; x += 1) {
				let h = 0.9;
				let featureIds = [];
				if (x === 0 && y === 1) h = 0.2;
				if (x === 1 && y === 1) {
					h = 0.1;
					featureIds = ["b_00000"];
				}
				if (x === 2 && y === 1) {
					h = 0.4;
					featureIds = ["b_00000"];
				}
				tiles.push({ x, y, topography: { h, r: 0, v: 0 }, featureIds });
			}
		}
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					features: {
						basins: [
							{
								id: "b_00000",
								kind: "leaf",
								parentId: "b_parent",
								childIds: [],
								birthH: 0.1,
								mergeH: 0.4,
								persistence: 0.3,
								spillOutTileId: 5,
								childSpillFromTileId: 5,
								parentContactTileId: 8,
								minH: 0.1,
								maxH: 0.4,
								size: 2,
								bbox: { minX: 1, minY: 1, maxX: 2, maxY: 1 },
								tileIds: [4, 5],
							},
						],
						peaks: [],
					},
					tiles,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli(STREAM_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--x",
			"0",
			"--y",
			"1",
			"--overflow",
			"--output-ppm",
			imageFile,
			"--force",
		]);
		expect(result.code).toBe(0);

		const ppm = await readFile(imageFile);
		const headerEnd = ppm.indexOf("\n255\n");
		expect(headerEnd).toBeGreaterThan(0);
		const dataStart = headerEnd + 5;
		const pixels = ppm.subarray(dataStart);
		const spillTileIndex = 5;
		const base = spillTileIndex * 3;
		expect(Array.from(pixels.subarray(base, base + 3))).toEqual([255, 80, 0]);
		const parentContactTileIndex = 8;
		const parentBase = parentContactTileIndex * 3;
		expect(Array.from(pixels.subarray(parentBase, parentBase + 3))).toEqual([
			255,
			80,
			0,
		]);
	});

	it("emits overflow failure when spill tile is not inside basin tile set", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-stream-overflow-fail.json");
		const tiles = [];
		for (let y = 0; y < 3; y += 1) {
			for (let x = 0; x < 3; x += 1) {
				let h = 0.9;
				let featureIds = [];
				if (x === 0 && y === 1) h = 0.2;
				if (x === 1 && y === 1) {
					h = 0.1;
					featureIds = ["b_00000"];
				}
				if (x === 2 && y === 1) h = 0.4;
				tiles.push({ x, y, topography: { h, r: 0, v: 0 }, featureIds });
			}
		}
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					features: {
						basins: [
							{
								id: "b_00000",
								kind: "leaf",
								parentId: null,
								childIds: [],
								birthH: 0.1,
								mergeH: 0.4,
								persistence: 0.3,
								spillOutTileId: 5,
								minH: 0.1,
								maxH: 0.4,
								size: 1,
								bbox: { minX: 1, minY: 1, maxX: 1, maxY: 1 },
								tileIds: [4],
							},
						],
						peaks: [],
					},
					tiles,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli(STREAM_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--x",
			"0",
			"--y",
			"1",
			"--overflow",
			"--debug",
		]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout.trim());
		expect(parsed.path).toEqual([
			[0, 1],
			[1, 1],
			{
				id: "b_00000",
				type: "leaf",
				spillTileId: 5,
				spillTile: [2, 1],
				reason: "local_minimum",
				stepsTaken: 2,
			},
		]);
		expect(parsed.overflowConnectorTileIds).toEqual([]);
		expect(parsed.overflowEvents).toEqual([
			{
				type: "overflow_no_spill_edge",
				basinId: "b_00000",
				sinkTileId: 4,
			},
		]);
	});

	it("supports --max-steps and returns debug trace when --debug is enabled", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-stream-debug.json");
		const tiles = [];
		for (let y = 0; y < 1; y += 1) {
			for (let x = 0; x < 4; x += 1) {
				tiles.push({
					x,
					y,
					topography: { h: 1 - x * 0.2, r: 0.0, v: 0.0 },
				});
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

		const result = await runCli(STREAM_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--x",
			"0",
			"--y",
			"0",
			"--max-steps",
			"2",
			"--debug",
		]);
		expect(result.code).toBe(0);
		const parsed = JSON.parse(result.stdout.trim());
		expect(Array.isArray(parsed.path)).toBe(true);
		expect(Array.isArray(parsed.debugSteps)).toBe(true);
		expect(Array.isArray(parsed.pathTileIds)).toBe(true);
		expect(Array.isArray(parsed.routingExcludedTileIds)).toBe(true);
		expect(Array.isArray(parsed.overflowConnectorTileIds)).toBe(true);
		expect(Array.isArray(parsed.overflowEvents)).toBe(true);
		const finalSummary = parsed.path.at(-1);
		expect(finalSummary.reason).toBe("max_steps");
		expect(finalSummary.stepsTaken).toBe(2);
		expect(parsed.debugSteps.length).toBeGreaterThan(0);
	});
});
