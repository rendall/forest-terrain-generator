import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { runGenerator } from "../../src/app/run-generator.js";
import { PASSAGE_MAX_STEP_UP } from "../../src/pipeline/derive-passages.js";

const tempDirs = [];

const makeTempDir = async () => {
	const dir = await mkdtemp(
		join(tmpdir(), "forest-terrain-generator-passages-"),
	);
	tempDirs.push(dir);
	return dir;
};

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("runGenerator passages output", () => {
	it("adds passages only when at least one direction is blocked", async () => {
		const cwd = await makeTempDir();
		const outputFile = join(cwd, "out.json");

		await runGenerator({
			mode: "generate",
			cwd,
			args: {
				seed: "123",
				width: 1,
				height: 1,
				outputFile,
				force: false,
			},
		});

		const envelope = JSON.parse(await readFile(outputFile, "utf8"));
		expect(envelope.tiles).toHaveLength(1);
		expect(envelope.tiles[0]).not.toHaveProperty("passages");
		expect(envelope.tiles[0]).toHaveProperty("topography");
		expect(envelope.tiles[0]).toHaveProperty("hydrology");
	});

	it("serializes passages for tiles with non-out_of_bounds blocks", async () => {
		const cwd = await makeTempDir();
		const outputFile = join(cwd, "out.json");
		const mapHPath = join(cwd, "map-h.json");

		await writeFile(
			mapHPath,
			JSON.stringify({
				width: 2,
				height: 1,
				data: [0.2, 0.2 + PASSAGE_MAX_STEP_UP + 0.001],
			}),
			"utf8",
		);

		await runGenerator({
			mode: "generate",
			cwd,
			args: {
				seed: "123",
				width: 2,
				height: 1,
				outputFile,
				mapHPath,
				force: false,
			},
		});

		const envelope = JSON.parse(await readFile(outputFile, "utf8"));
		expect(envelope.tiles).toHaveLength(2);
		expect(envelope.tiles[0].passages).toEqual({
			E: "elevation_up_too_steep",
			SE: "out_of_bounds",
			S: "out_of_bounds",
			SW: "out_of_bounds",
			W: "out_of_bounds",
			NW: "out_of_bounds",
			N: "out_of_bounds",
			NE: "out_of_bounds",
		});
		expect(envelope.tiles[1].passages).toEqual({
			E: "out_of_bounds",
			SE: "out_of_bounds",
			S: "out_of_bounds",
			SW: "out_of_bounds",
			W: "elevation_down_too_far",
			NW: "out_of_bounds",
			N: "out_of_bounds",
			NE: "out_of_bounds",
		});
	});
});
