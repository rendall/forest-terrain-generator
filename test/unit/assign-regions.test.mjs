import { describe, expect, it } from "vitest";
import { InputValidationError } from "../../src/domain/errors.js";
import { assignRegions } from "../../src/app/run-assign-regions.js";

function makeTile(x, y, biome) {
	return {
		x,
		y,
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
			biome,
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

describe("assignRegions", () => {
	it("assigns deterministic biome region IDs in row-major first-seen component order", () => {
		const envelope = {
			meta: { specVersion: "forest-terrain-v1" },
			tiles: [
				makeTile(2, 2, "mixed_forest"),
				makeTile(1, 0, "mixed_forest"),
				makeTile(2, 0, "spruce_swamp"),
				makeTile(0, 0, "mixed_forest"),
				makeTile(0, 1, "open_bog"),
			],
		};

		const out = assignRegions(envelope);

		const byCoord = new Map(
			out.tiles.map((tile) => [`${tile.x},${tile.y}`, tile.region.biomeRegionId]),
		);
		expect(byCoord.get("0,0")).toBe(0);
		expect(byCoord.get("1,0")).toBe(0);
		expect(byCoord.get("2,0")).toBe(1);
		expect(byCoord.get("0,1")).toBe(2);
		expect(byCoord.get("2,2")).toBe(3);

		expect(out.regions).toEqual([
			{
				id: 0,
				biome: "mixed_forest",
				tileCount: 2,
				bbox: { minX: 0, minY: 0, maxX: 1, maxY: 0 },
			},
			{
				id: 1,
				biome: "spruce_swamp",
				tileCount: 1,
				bbox: { minX: 2, minY: 0, maxX: 2, maxY: 0 },
			},
			{
				id: 2,
				biome: "open_bog",
				tileCount: 1,
				bbox: { minX: 0, minY: 1, maxX: 0, maxY: 1 },
			},
			{
				id: 3,
				biome: "mixed_forest",
				tileCount: 1,
				bbox: { minX: 2, minY: 2, maxX: 2, maxY: 2 },
			},
		]);
	});

	it("always emits top-level regions array", () => {
		const envelope = {
			meta: { specVersion: "forest-terrain-v1" },
			tiles: [],
		};

		const out = assignRegions(envelope);
		expect(out.regions).toEqual([]);
	});

	it("fails fast when a tile is missing ecology.biome", () => {
		const envelope = {
			meta: { specVersion: "forest-terrain-v1" },
			tiles: [{ ...makeTile(0, 0, "mixed_forest"), ecology: {} }],
		};

		expect(() => assignRegions(envelope)).toThrow(InputValidationError);
		expect(() => assignRegions(envelope)).toThrow(/ecology\.biome/);
	});

	it("assigns parentRegionId for enclosed interior island regions", () => {
		const tiles = [];
		for (let y = 0; y < 3; y += 1) {
			for (let x = 0; x < 3; x += 1) {
				const biome = x === 1 && y === 1 ? "lake" : "pine_heath";
				tiles.push(makeTile(x, y, biome));
			}
		}

		const out = assignRegions({
			meta: { specVersion: "forest-terrain-v1" },
			tiles,
		});
		expect(out.regions).toHaveLength(2);
		expect(out.regions[0].parentRegionId).toBeUndefined();
		expect(out.regions[1].parentRegionId).toBe(0);
	});

	it("does not assign parentRegionId when region touches map boundary", () => {
		const tiles = [];
		for (let y = 0; y < 3; y += 1) {
			for (let x = 0; x < 3; x += 1) {
				const biome = x === 0 && y === 1 ? "lake" : "pine_heath";
				tiles.push(makeTile(x, y, biome));
			}
		}

		const out = assignRegions({
			meta: { specVersion: "forest-terrain-v1" },
			tiles,
		});
		expect(out.regions).toHaveLength(2);
		expect(out.regions[1].parentRegionId).toBeUndefined();
	});

	it("does not assign parentRegionId when perimeter neighbors span multiple regions", () => {
		const tiles = [];
		const biomeAt = (x, y) => {
			if (x === 1 && y === 1) {
				return "lake";
			}
			if (y === 2 || x === 2) {
				return "spruce_swamp";
			}
			return "pine_heath";
		};
		for (let y = 0; y < 3; y += 1) {
			for (let x = 0; x < 3; x += 1) {
				tiles.push(makeTile(x, y, biomeAt(x, y)));
			}
		}

		const out = assignRegions({
			meta: { specVersion: "forest-terrain-v1" },
			tiles,
		});
		expect(out.regions).toHaveLength(3);
		expect(out.regions[1].parentRegionId).toBeUndefined();
	});
});
