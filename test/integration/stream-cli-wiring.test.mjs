import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
	it("returns routed [x,y,h] path as JSON", async () => {
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
		expect(result.stdout.trim()).toBe("[[2,1,0.3],[3,1,0.2],[4,1,0.1]]");
	});

	it("emits basin id event and resumes from spill outside", async () => {
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
					if (x === 4) h = 0.1;
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
								minH: 0,
								maxH: 0,
								size: 1,
								bbox: { minX: 2, minY: 1, maxX: 2, maxY: 1 },
								tileIds: [7],
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
		expect(result.stdout.trim()).toBe(
			'[[1,1,0.5],[2,1,0],"b_00000",[3,1,0.2],[4,1,0.1]]',
		);
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
});
