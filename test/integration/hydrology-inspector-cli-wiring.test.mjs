import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ENTRY = resolve(process.cwd(), "src/cli/hydrology-inspector.ts");
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
		child.once("close", (code) => resolveResult({ code: code ?? 0, stdout, stderr }));
	});
}

async function makeTempDir() {
	const dir = await mkdtemp(join(tmpdir(), "forest-terrain-generator-hydrology-inspector-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("hydrology-inspector CLI", () => {
	it("accepts sink-mode and toggles overflow behavior", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source.json");
		await writeFile(
			sourceFile,
			`${JSON.stringify({
				meta: { specVersion: "forest-terrain-v1" },
				tiles: [
					{ x: 0, y: 0, topography: { h: 0.2, r: 0, v: 0 } },
					{ x: 1, y: 0, topography: { h: 0.1, r: 0, v: 0 }, featureIds: ["b_00000"] },
					{ x: 2, y: 0, topography: { h: 0.3, r: 0, v: 0 }, featureIds: ["b_00000"] },
				],
				features: {
					basins: [
						{
							id: "b_00000",
							kind: "leaf",
							parentId: null,
							childIds: [],
							birthH: 0.1,
							mergeH: null,
							persistence: null,
							spillOutTileId: 2,
							childSpillFromTileId: 2,
							parentContactTileId: 2,
							minH: 0.1,
							maxH: 0.3,
							size: 2,
							bbox: { minX: 1, minY: 0, maxX: 2, maxY: 0 },
							tileIds: [1, 2],
						},
					],
					peaks: [],
				},
			})}\n`,
			"utf8",
		);

		const strict = await runCli(["--input-json", sourceFile, "--x", "0", "--y", "0"]);
		expect(strict.code).toBe(0);
		expect(strict.stdout.trim().split("\n").length).toBe(1);

		const guided = await runCli([
			"--input-json",
			sourceFile,
			"--x",
			"0",
			"--y",
			"0",
			"--sink-mode",
			"overflow_guided",
		]);
		expect(guided.code).toBe(0);
		expect(guided.stdout.trim().split("\n").length).toBe(2);
	});
});
