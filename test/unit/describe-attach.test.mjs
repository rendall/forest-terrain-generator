import { describe, expect, it } from "vitest";
import { attachTileDescriptions } from "../../src/app/run-describe.js";

function makeValidTile(x, y) {
	return {
		x,
		y,
		topography: {
			h: 0.4,
			r: 0.3,
			v: 0.5,
			slopeMag: 0.06,
			aspectDeg: 90,
			landform: "ridge",
		},
		hydrology: {
			fd: 0,
			fa: 1,
			faN: 0,
			lakeMask: false,
			isStream: false,
			distWater: 2,
			moisture: 0.52,
			waterClass: "none",
		},
		ecology: {
			biome: "mixed_forest",
			treeDensity: 0.55,
			canopyCover: 0.58,
			dominant: ["birch"],
			ground: {
				soil: "sandy_till",
				firmness: 0.7,
				surfaceFlags: [],
			},
			roughness: {
				obstruction: 0.25,
				featureFlags: ["root_tangle"],
			},
		},
		navigation: {
			moveCost: 1.2,
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

describe("describe attachment", () => {
	it("attaches text description for valid tiles", () => {
		const envelope = {
			meta: { specVersion: "forest-terrain-v1" },
			tiles: [makeValidTile(0, 0), makeValidTile(1, 0)],
		};

		const out = attachTileDescriptions(envelope, false);
		expect(out.tiles).toHaveLength(2);
		expect(typeof out.tiles[0].description).toBe("string");
		expect(out.tiles[0].description).not.toBe("");
		expect(out.tiles[0].descriptionDebug).toBeUndefined();
	});

	it("sets description null with descriptionDebug when tile coordinates are invalid", () => {
		const envelope = {
			meta: { specVersion: "forest-terrain-v1" },
			tiles: [
				makeValidTile(0, 0),
				{
					y: 1,
					topography: {},
					hydrology: {},
					ecology: {},
					navigation: {},
				},
			],
		};

		const out = attachTileDescriptions(envelope, true);
		const failed = out.tiles[1];

		expect(failed.description).toBeNull();
		expect(failed.descriptionStructured).toBeNull();
		expect(failed.descriptionDebug).toEqual({
			code: "description_input_invalid",
			message:
				"Tile is missing required integer x/y for description generation.",
			x: null,
			y: 1,
		});
	});

	it("uses fallback prose for unknown taxonomy in lenient mode", () => {
		const unknownTile = makeValidTile(0, 0);
		unknownTile.ecology.biome = "alien_biome";
		unknownTile.topography.landform = "mystery_landform";
		const envelope = {
			meta: { specVersion: "forest-terrain-v1" },
			tiles: [unknownTile],
		};

		const out = attachTileDescriptions(envelope, true);
		const tile = out.tiles[0];
		expect(typeof tile.description).toBe("string");
		expect(tile.description).not.toBe("");
		expect(tile.descriptionDebug).toBeUndefined();
		expect(tile.descriptionStructured).toBeDefined();
	});

	it("fails unknown taxonomy in strict mode with descriptionDebug", () => {
		const unknownTile = makeValidTile(0, 0);
		unknownTile.ecology.biome = "alien_biome";
		unknownTile.topography.landform = "mystery_landform";
		const envelope = {
			meta: { specVersion: "forest-terrain-v1" },
			tiles: [unknownTile],
		};

		const out = attachTileDescriptions(envelope, true, true);
		const failed = out.tiles[0];
		expect(failed.description).toBeNull();
		expect(failed.descriptionStructured).toBeNull();
		expect(failed.descriptionDebug).toEqual({
			code: "unknown_taxonomy",
			message:
				"Unknown biome/landform encountered in strict mode for description generation.",
			x: 0,
			y: 0,
			unknownBiome: "alien_biome",
			unknownLandform: "mystery_landform",
		});
	});

	it("fails tile when navigation.passability is missing or malformed", () => {
		const malformedTile = makeValidTile(0, 0);
		delete malformedTile.navigation.passability.SE;
		const envelope = {
			meta: { specVersion: "forest-terrain-v1" },
			tiles: [malformedTile],
		};

		const out = attachTileDescriptions(envelope, true);
		const failed = out.tiles[0];
		expect(failed.description).toBeNull();
		expect(failed.descriptionStructured).toBeNull();
		expect(failed.descriptionDebug).toEqual({
			code: "malformed_passability",
			message:
				"Tile navigation.passability is missing or malformed for description generation.",
			x: 0,
			y: 0,
		});
	});
});
