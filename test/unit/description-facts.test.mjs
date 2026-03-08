import { describe, expect, it } from "vitest";
import { buildDescriptionFacts } from "../../src/pipeline/description-facts.js";

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

describe("description facts normalization", () => {
	it("emits narrowed contract shape and removes legacy semantic fields", () => {
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
					topography: { h: 0.8, landform: "basin" },
					hydrology: { fd: 0 },
					navigation: {
						followable: ["game_trail"],
						passability: PASSABILITY_ALL_OPEN,
					},
				},
				{
					index: 1,
					x: 1,
					y: 0,
					topography: { h: 0.7, landform: "basin" },
					hydrology: { fd: 4 },
					navigation: {
						followable: ["game_trail"],
						passability: PASSABILITY_ALL_OPEN,
					},
				},
			],
		};

		const out = buildDescriptionFacts(envelope);
		expect(out).toHaveLength(2);
		expect(out[0]?.kind).toBe("ok");
		if (out[0]?.kind !== "ok") {
			throw new Error("expected normalized facts for tile 0");
		}

		const facts = out[0].facts;
		expect(facts.topology.peakLeafId).toBe("p_00000");
		expect(facts.local.slopeMagnitude).toEqual(expect.any(Number));
		expect(Object.hasOwn(facts.local, "slopeStrength")).toBe(false);
		expect(Object.hasOwn(facts.ecology, "moisture")).toBe(false);
		expect(Object.hasOwn(facts.hydrology, "standingWater")).toBe(false);
		expect(Object.hasOwn(facts.hydrology, "waterClass")).toBe(false);
		expect(Object.hasOwn(facts, "derived")).toBe(false);
	});

	it("preserves authoritative basin-water hydrology fields", () => {
		const envelope = {
			meta: { specVersion: "forest-terrain-v1" },
			features: {
				basins: [{ id: "b_00000", childIds: [], tileIds: [0] }],
				peaks: [],
			},
			tiles: [
				{
					index: 0,
					x: 0,
					y: 0,
					topography: { h: 0.2 },
					hydrology: {
						lakeBasinId: "b_00000",
						waterDepth: 0.15,
						waterSurfaceH: 0.35,
					},
					navigation: { passability: PASSABILITY_ALL_OPEN },
				},
			],
		};

		const out = buildDescriptionFacts(envelope);
		expect(out[0]?.kind).toBe("ok");
		if (out[0]?.kind !== "ok") {
			throw new Error("expected normalized facts for tile 0");
		}

		expect(out[0].facts.hydrology.lakeBasinId).toBe("b_00000");
		expect(out[0].facts.hydrology.waterDepth).toBe(0.15);
		expect(out[0].facts.hydrology.waterSurfaceH).toBe(0.35);
		expect(out[0].facts.topology.basinLeafId).toBe("b_00000");
	});
});
