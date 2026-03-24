import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const LOS_CLI_ENTRY = resolve(process.cwd(), "src/cli/los.ts");
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
	const dir = await mkdtemp(
		join(tmpdir(), "forest-terrain-generator-los-cli-"),
	);
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("los CLI wiring", () => {
	it("prints true when target is visible", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-visible.json");
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					tiles: [
						{ x: 0, y: 0, topography: { h: 0.0 } },
						{ x: 1, y: 0, topography: { h: 0.0 } },
						{ x: 2, y: 0, topography: { h: 0.1 } },
					],
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli(LOS_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--x0",
			"0",
			"--y0",
			"0",
			"--x1",
			"2",
			"--y1",
			"0",
		]);
		expect(result.code).toBe(0);
		expect(result.stdout.trim()).toBe("true");
	});

	it("prints false when an intermediate tile blocks LOS", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-blocked.json");
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					tiles: [
						{ x: 0, y: 0, topography: { h: 0.0 } },
						{ x: 1, y: 0, topography: { h: 1.0 } },
						{ x: 2, y: 0, topography: { h: 0.1 } },
					],
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli(LOS_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--x0",
			"0",
			"--y0",
			"0",
			"--x1",
			"2",
			"--y1",
			"0",
		]);
		expect(result.code).toBe(0);
		expect(result.stdout.trim()).toBe("false");
	});

	it("returns input error for out-of-bounds coordinates", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-oob.json");
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					tiles: [
						{ x: 0, y: 0, topography: { h: 0.0 } },
						{ x: 1, y: 0, topography: { h: 0.0 } },
					],
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli(LOS_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--x0",
			"0",
			"--y0",
			"0",
			"--x1",
			"3",
			"--y1",
			"0",
		]);
		expect(result.code).toBe(2);
		expect(result.stderr).toContain("[input] stage=cli_runtime");
		expect(result.stderr).toContain("out of bounds");
	});

	it("prints debug start/end/line when --debug is set", async () => {
		const dir = await makeTempDir();
		const sourceFile = join(dir, "source-debug.json");
		await writeFile(
			sourceFile,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					tiles: [
						{ x: 0, y: 0, topography: { h: 0.0 } },
						{ x: 1, y: 0, topography: { h: 0.1 } },
						{ x: 2, y: 0, topography: { h: 0.4 } },
					],
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const result = await runCli(LOS_CLI_ENTRY, [
			"--input-json",
			sourceFile,
			"--x0",
			"0",
			"--y0",
			"0",
			"--x1",
			"2",
			"--y1",
			"0",
			"--debug",
		]);
		expect(result.code).toBe(0);
		expect(result.stdout).toContain("start: x=0, y=0, h=0");
		expect(result.stdout).toContain("end: x=2, y=0, h=0.4");
		expect(result.stdout).toContain("line: x(t)=0+t*2, y(t)=0+t*0");
		expect(result.stdout).toContain("path: [[0,0,0],[1,0,0.1],[2,0,0.4]]");
		expect(result.stdout.trim().endsWith("true")).toBe(true);
	});
});
