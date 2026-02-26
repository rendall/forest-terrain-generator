import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readTerrainEnvelopeFile } from "../../src/io/read-envelope.js";

const tempDirs = [];

async function makeTempDir() {
	const dir = await mkdtemp(join(tmpdir(), "forest-terrain-generator-envelope-"));
	tempDirs.push(dir);
	return dir;
}

function makeValidTile() {
	return {
		x: 0,
		y: 0,
		topography: { h: 0, r: 0, v: 0, slopeMag: 0, aspectDeg: 0, landform: "flat" },
		hydrology: {
			fd: 255,
			fa: 1,
			faN: 0,
			lakeMask: false,
			isStream: false,
			distWater: 0,
			moisture: 0,
			waterClass: "none",
		},
		ecology: {
			biome: "mixed_forest",
			treeDensity: 0,
			canopyCover: 0,
			dominant: [],
			ground: { soil: "sandy_till", firmness: 0.5, surfaceFlags: [] },
			roughness: { obstruction: 0, featureFlags: [] },
		},
		navigation: {
			moveCost: 1,
			followable: [],
			passability: {
				N: "passable",
				NE: "passable",
				E: "passable",
				SE: "passable",
				S: "passable",
				SW: "passable",
				W: "passable",
				NW: "passable",
			},
		},
	};
}

afterEach(async () => {
	await Promise.all(
		tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

describe("read terrain envelope", () => {
	it("preserves top-level regions when present", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "terrain.json");
		const regions = [
			{
				id: 0,
				biome: "mixed_forest",
				tileCount: 1,
				bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
				parentRegionId: 2,
			},
		];
		await writeFile(
			path,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					regions,
					tiles: [makeValidTile()],
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const envelope = await readTerrainEnvelopeFile(path);
		expect(envelope.regions).toEqual(regions);
	});

	it("accepts pre-enrichment envelopes without top-level regions", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "terrain.json");
		await writeFile(
			path,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					tiles: [makeValidTile()],
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const envelope = await readTerrainEnvelopeFile(path);
		expect(envelope.regions).toBeUndefined();
	});

	it("rejects malformed top-level regions when present", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "terrain.json");
		await writeFile(
			path,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					regions: {},
					tiles: [makeValidTile()],
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		await expect(readTerrainEnvelopeFile(path)).rejects.toThrow(
			/Invalid envelope "regions"/,
		);
	});

	it("rejects malformed parentRegionId when present", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "terrain.json");
		await writeFile(
			path,
			`${JSON.stringify(
				{
					meta: { specVersion: "forest-terrain-v1" },
					regions: [
						{
							id: 0,
							biome: "mixed_forest",
							tileCount: 1,
							bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
							parentRegionId: "bad",
						},
					],
					tiles: [makeValidTile()],
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		await expect(readTerrainEnvelopeFile(path)).rejects.toThrow(
			/parentRegionId/,
		);
	});
});
