import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { resolveInputs, runGenerator } from "../../src/app/run-generator.js";

const tempDirs = [];

async function makeTempDir() {
	const dir = await mkdtemp(join(tmpdir(), "forest-terrain-generator-elevation-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("elevation params and tile output", () => {
	it("accepts params.elevation.h0/h1 and maps h to elevationMeters", async () => {
		const cwd = await makeTempDir();
		const paramsPath = join(cwd, "params.json");
		const outputFile = join(cwd, "out.json");

		await writeFile(
			paramsPath,
			`${JSON.stringify(
				{
					params: {
						elevation: {
							h0: 100,
							h1: 200,
						},
					},
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const resolved = await resolveInputs({
			mode: "generate",
			cwd,
			args: {
				force: false,
				paramsPath,
			},
		});
		expect(resolved.params.elevation).toMatchObject({ h0: 100, h1: 200 });

		await runGenerator({
			mode: "generate",
			cwd,
			args: {
				seed: "1",
				width: 4,
				height: 4,
				paramsPath,
				outputFile,
				force: false,
			},
		});

		const envelope = JSON.parse(await readFile(outputFile, "utf8"));
		for (const tile of envelope.tiles) {
			expect(typeof tile.topography.h).toBe("number");
			expect(typeof tile.topography.elevationMeters).toBe("number");
			const expected = 100 + tile.topography.h * 100;
			expect(tile.topography.elevationMeters).toBeCloseTo(expected, 6);
		}
	});

	it("rejects invalid elevation ranges where h1 <= h0", async () => {
		const cwd = await makeTempDir();
		const paramsPath = join(cwd, "params-bad.json");
		await writeFile(
			paramsPath,
			`${JSON.stringify(
				{
					params: {
						elevation: {
							h0: 300,
							h1: 100,
						},
					},
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		await expect(
			resolveInputs({
				mode: "generate",
				cwd,
				args: {
					force: false,
					paramsPath,
				},
			}),
		).rejects.toThrow(/params\.elevation\.h0\/h1/);
	});
});
