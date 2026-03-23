import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runGenerator } from "../../src/app/run-generator.js";

const tempDirs = [];

async function makeTempDir() {
	const dir = await mkdtemp(
		join(tmpdir(), "forest-terrain-generator-topo-output-"),
	);
	tempDirs.push(dir);
	return dir;
}

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("Phase 2 topographic structure tile payload", () => {
	it("omits topography.structure from emitted tiles", async () => {
		const cwd = await makeTempDir();
		const outputFile = join(cwd, "out.json");

		await runGenerator({
			mode: "generate",
			cwd,
			args: {
				seed: "1",
				width: 8,
				height: 8,
				outputFile,
				force: false,
			},
		});

		const envelope = JSON.parse(await readFile(outputFile, "utf8"));
		expect(Array.isArray(envelope.tiles)).toBe(true);
		expect(envelope.tiles.length).toBe(64);
		expect(envelope.features).toBeDefined();
		expect(Array.isArray(envelope.features.basins)).toBe(true);
		expect(Array.isArray(envelope.features.peaks)).toBe(true);
		expect(envelope.features.basins.length).toBeGreaterThan(0);
		expect(envelope.features.peaks.length).toBeGreaterThan(0);

		const firstTile = envelope.tiles[0];
		expect(firstTile.index).toBe(0);
		expect(Array.isArray(firstTile.featureIds)).toBe(true);
		expect(Array.isArray(firstTile.activeFeatureIds)).toBe(true);
		expect(firstTile.featureIds.length).toBeLessThanOrEqual(2);
		expect(firstTile.topography).toBeDefined();
		expect(firstTile.topography.h).toEqual(expect.any(Number));
		expect(firstTile.topography.r).toEqual(expect.any(Number));
		expect(firstTile.topography.v).toEqual(expect.any(Number));
		expect(firstTile.topography.elevationMeters).toEqual(expect.any(Number));
		expect(firstTile.topography.structure).toBeUndefined();

		for (const tile of envelope.tiles) {
			expect(tile.index).toBe(tile.y * 8 + tile.x);
			expect(Array.isArray(tile.featureIds)).toBe(true);
			expect(tile.featureIds.length).toBeLessThanOrEqual(2);
			expect(Array.isArray(tile.activeFeatureIds)).toBe(true);
			expect(tile.topography.structure).toBeUndefined();
		}
	});
});
