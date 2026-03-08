import { describe, expect, it } from "vitest";
import { attachTileDescriptions } from "../../src/app/run-describe.js";

const PASSABILITY_ALL_OPEN = {
	N: "passable",
	NE: "passable",
	E: "passable",
	SE: "passable",
	S: "passable",
	SW: "passable",
	W: "passable",
	NW: "passable",
};

describe("run-describe facts adapter", () => {
	it("consumes normalized topology/hydrology facts instead of legacy landform/followable tile fields", () => {
		const envelope = {
			meta: { specVersion: "forest-terrain-v1" },
			features: {
				basins: [{ id: "b_00000", childIds: [], tileIds: [0, 1] }],
				peaks: [{ id: "p_00000", childIds: [], tileIds: [0, 1] }],
			},
			tiles: [
				{
					index: 0,
					x: 0,
					y: 0,
					topography: { h: 0.9, landform: "basin" },
					hydrology: { fd: 0 },
					navigation: {
						followable: ["game_trail"],
						passability: PASSABILITY_ALL_OPEN,
					},
					ecology: { biome: "mixed_forest" },
				},
				{
					index: 1,
					x: 1,
					y: 0,
					topography: { h: 0.8, landform: "basin" },
					hydrology: { fd: 4 },
					navigation: {
						followable: ["game_trail"],
						passability: PASSABILITY_ALL_OPEN,
					},
					ecology: { biome: "mixed_forest" },
				},
			],
		};

		const described = attachTileDescriptions(envelope, true, false);
		const firstTile = described.tiles[0];
		expect(firstTile.descriptionDebug).toBeUndefined();
		expect(firstTile.description).toEqual(expect.any(String));
		expect(firstTile.descriptionStructured).toBeTruthy();

		const structured = firstTile.descriptionStructured;
		const landformSentence = structured.sentences.find(
			(sentence) => sentence.slot === "landform",
		);
		expect(landformSentence?.contributorKeys?.landform).toBe("ridge");
		expect(structured.adjacency.ridge).toEqual(["E"]);
		expect(structured.adjacency.stream).toBeUndefined();
		expect(structured.adjacency.game_trail).toBeUndefined();
	});
});
