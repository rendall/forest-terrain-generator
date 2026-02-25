import { describe, expect, it } from "vitest";
import {
	DescriptionPhraseError,
	generateRawDescription,
} from "../../src/pipeline/description.js";

const baseForbidden = [
	"tile",
	"cell",
	"grid",
	"map",
	"percentile",
	"index",
	"classification",
	"algorithm",
	"generator",
	"noise",
	"biome",
	"hydrology",
	"parameter",
	"json",
	"yaml",
	"room",
	"mud",
	"you",
	"your",
	"feels like",
	"seems",
];

const case01 = {
	biome: "spruce_swamp",
	landform: "basin",
	moisture: 0.92,
	standingWater: true,
	followable: [],
	passability: {
		N: "blocked",
		NE: "blocked",
		E: "blocked",
		SE: "difficult",
		S: "passable",
		SW: "blocked",
		W: "blocked",
		NW: "blocked",
	},
	slopeDirection: "S",
	slopeStrength: 0.02,
	obstacles: ["root_tangle"],
	visibility: "short",
	neighbors: {
		N: {
			biome: "mixed_forest",
			water: "none",
			elevDelta: 0.1,
			densityDelta: -0.1,
		},
		NE: {
			biome: "mixed_forest",
			water: "none",
			elevDelta: 0.06,
			densityDelta: -0.05,
		},
		E: {
			biome: "spruce_swamp",
			water: "marsh",
			elevDelta: 0,
			densityDelta: 0.05,
		},
		SE: {
			biome: "spruce_swamp",
			water: "stream",
			elevDelta: -0.02,
			densityDelta: 0.1,
		},
		S: {
			biome: "spruce_swamp",
			water: "lake",
			elevDelta: -0.05,
			densityDelta: -0.05,
		},
		SW: {
			biome: "spruce_swamp",
			water: "marsh",
			elevDelta: -0.01,
			densityDelta: 0.05,
		},
		W: {
			biome: "spruce_swamp",
			water: "none",
			elevDelta: 0.02,
			densityDelta: 0,
		},
		NW: {
			biome: "mixed_forest",
			water: "none",
			elevDelta: 0.08,
			densityDelta: -0.05,
		},
	},
};

const case04 = {
	biome: "pine_heath",
	landform: "ridge",
	moisture: 0.22,
	standingWater: false,
	followable: [],
	passability: {
		N: "passable",
		NE: "passable",
		E: "blocked",
		SE: "blocked",
		S: "blocked",
		SW: "blocked",
		W: "blocked",
		NW: "passable",
	},
	slopeDirection: "NW",
	slopeStrength: 0.08,
	obstacles: [],
	visibility: "long",
	neighbors: {
		N: {
			biome: "pine_heath",
			water: "none",
			elevDelta: 0.01,
			densityDelta: -0.05,
		},
		NE: { biome: "pine_heath", water: "none", elevDelta: 0, densityDelta: 0 },
		E: {
			biome: "pine_heath",
			water: "none",
			elevDelta: -0.02,
			densityDelta: 0,
		},
		SE: {
			biome: "mixed_forest",
			water: "none",
			elevDelta: -0.04,
			densityDelta: 0.1,
		},
		S: {
			biome: "mixed_forest",
			water: "none",
			elevDelta: -0.06,
			densityDelta: 0.15,
		},
		SW: {
			biome: "mixed_forest",
			water: "none",
			elevDelta: -0.05,
			densityDelta: 0.1,
		},
		W: { biome: "pine_heath", water: "none", elevDelta: 0.02, densityDelta: 0 },
		NW: {
			biome: "pine_heath",
			water: "none",
			elevDelta: 0.03,
			densityDelta: -0.05,
		},
	},
};

const caseSlope = {
	...case04,
	landform: "slope",
	slopeStrength: 0.1,
};

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const TRAVERSAL_NOUNS = ["way"];
const LAKE_WATER_PHRASES = [
	"lake water",
	"the lake",
	"deep water",
	"a broad stretch of water",
];

function hash32(text) {
	let hash = 2166136261;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function passabilityFromOpen(openDirs, difficultDirs = []) {
	const open = new Set(openDirs);
	const difficult = new Set(difficultDirs);
	return Object.fromEntries(
		DIRS.map((dir) => {
			if (!open.has(dir)) {
				return [dir, "blocked"];
			}
			return [dir, difficult.has(dir) ? "difficult" : "passable"];
		}),
	);
}

describe("Phase 1 description pipeline", () => {
	it("produces deterministic raw sentence output for the same seed key", () => {
		const a = generateRawDescription(case01, "seed-42");
		const b = generateRawDescription(case01, "seed-42");

		expect(a).toEqual(b);
	});

	it("respects sentence cap and merges landform+biome anchor", () => {
		const result = generateRawDescription(case01, "seed-101");

		expect(result.sentences.length).toBeLessThanOrEqual(4);
		const anchor = result.sentences.find(
			(sentence) => sentence.slot === "landform",
		);
		expect(anchor).toBeDefined();
		expect(anchor.text).toContain(", where ");
		expect(anchor.contributors).toContain("landform");
		expect(anchor.contributors).toContain("biome");
		expect(anchor.contributorKeys.landform).toBe(case01.landform);
		expect(anchor.contributorKeys.biome).toBe(case01.biome);
		expect(result.sentences.some((sentence) => sentence.slot === "biome")).toBe(
			false,
		);
	});

	it("does not emit directional sentence slots", () => {
		const result = generateRawDescription(case04, "seed-303");
		const directionalSentences = result.sentences.filter(
			(sentence) => sentence.slot === "directional",
		);

		expect(directionalSentences.length).toBe(0);
	});

	it("emits followable sentence and places it immediately before movement prose", () => {
		const result = generateRawDescription(
			{
				...case04,
				biome: "mixed_forest",
				followable: ["stream", "shore"],
				flowDirection: "N",
				passability: passabilityFromOpen(["N", "NE", "SE", "S", "SW"]),
				neighbors: {
					N: { ...case04.neighbors.N, followable: ["stream", "shore"] },
					NE: { ...case04.neighbors.NE, followable: ["shore"] },
					E: { ...case04.neighbors.E, followable: [] },
					SE: { ...case04.neighbors.SE, followable: ["shore"] },
					S: { ...case04.neighbors.S, followable: ["shore"] },
					SW: { ...case04.neighbors.SW, followable: ["stream"] },
					W: { ...case04.neighbors.W, followable: [] },
					NW: { ...case04.neighbors.NW, followable: [] },
				},
			},
			"seed-followable-1",
		);

		const followable = result.sentences.find(
			(sentence) => sentence.slot === "followable",
		);
		const movement = result.sentences.find(
			(sentence) => sentence.slot === "movement_structure",
		);

		expect(followable?.text).toBe(
			"A stream flows from southwest to the north. Lakeshore surrounds much of this area.",
		);
		expect(movement?.text).toBeDefined();
		expect(result.text).toContain(`${followable?.text} ${movement?.text}`);
		const followableIndex = result.sentences.findIndex(
			(sentence) => sentence.slot === "followable",
		);
		const movementIndex = result.sentences.findIndex(
			(sentence) => sentence.slot === "movement_structure",
		);
		expect(followableIndex).toBeGreaterThanOrEqual(0);
		expect(movementIndex).toBeGreaterThan(followableIndex);
	});

	it("omits followable sentence when all followable directions are blocked", () => {
		const result = generateRawDescription(
			{
				...case04,
				followable: ["shore"],
				passability: passabilityFromOpen(["E", "SE"]),
				neighbors: {
					N: { ...case04.neighbors.N, followable: ["shore"] },
					NE: { ...case04.neighbors.NE, followable: ["shore"] },
					E: { ...case04.neighbors.E, followable: [] },
					SE: { ...case04.neighbors.SE, followable: [] },
					S: { ...case04.neighbors.S, followable: ["shore"] },
					SW: { ...case04.neighbors.SW, followable: [] },
					W: { ...case04.neighbors.W, followable: [] },
					NW: { ...case04.neighbors.NW, followable: [] },
				},
			},
			"seed-followable-2",
		);

		expect(
			result.sentences.some((sentence) => sentence.slot === "followable"),
		).toBe(false);
	});

	it("emits movement_structure when any direction is blocked or difficult", () => {
		const result = generateRawDescription(case04, "seed-move-1");
		const movementSentences = result.sentences.filter(
			(sentence) => sentence.slot === "movement_structure",
		);
		expect(movementSentences).toHaveLength(1);
		const movement = movementSentences[0];
		expect(movement?.contributors).toEqual(["movement_structure"]);
		expect(typeof movement?.contributorKeys.movement_structure).toBe("string");
		expect(Array.isArray(movement?.movement)).toBe(true);
		expect(movement?.text.endsWith(".")).toBe(true);
		expect(movement?.text.includes("{openDirs}")).toBe(false);
		expect(movement?.text.includes("{blockedDirs}")).toBe(false);
		expect(result.sentences[0]?.slot).toBe("landform");
		expect(result.sentences[1]?.slot).toBe("movement_structure");
		const lowered = movement.text.toLowerCase();
		expect(lowered).not.toContain("visibility");
		expect(lowered).not.toContain("view");
		expect(lowered).not.toContain("sightline");
		expect(lowered).not.toContain("tile");
		expect(lowered).not.toContain("cell");
		expect(lowered).not.toContain("passability");
	});

	it("emits structured movement runs as passage/blockage arcs", () => {
		const result = generateRawDescription(
			{
				...case04,
				passability: {
					N: "blocked",
					NE: "blocked",
					E: "blocked",
					SE: "passable",
					S: "passable",
					SW: "passable",
					W: "blocked",
					NW: "blocked",
				},
			},
			"seed-move-runs",
		);
		const movement = result.sentences.find(
			(sentence) => sentence.slot === "movement_structure",
		);
		expect(movement).toBeDefined();
		expect(movement?.movement).toEqual([
			{ type: "blockage", directions: ["W", "NW", "N", "NE", "E"] },
			{ type: "passage", directions: ["SE", "S", "SW"] },
		]);
	});

	it("falls back to basicText when all directions are passable", () => {
		const fullyOpen = {
			...case04,
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
		};
		const result = generateRawDescription(fullyOpen, "seed-move-open");
		const movement = result.sentences.find(
			(sentence) => sentence.slot === "movement_structure",
		);
		expect(movement).toBeDefined();
		expect(movement?.text).toBeUndefined();
		expect(movement?.basicText).toBe("Passages open in all directions.");
		expect(movement?.movement).toEqual([
			{
				type: "passage",
				directions: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
			},
		]);
	});

	it("falls back to zero-exit wording for difficult-only exits", () => {
		const difficultOnly = {
			...case04,
			passability: {
				N: "difficult",
				NE: "blocked",
				E: "blocked",
				SE: "blocked",
				S: "blocked",
				SW: "blocked",
				W: "blocked",
				NW: "blocked",
			},
		};
		const result = generateRawDescription(difficultOnly, "seed-move-difficult");
		const movement = result.sentences.find(
			(sentence) => sentence.slot === "movement_structure",
		);
		expect(movement).toBeDefined();
		expect(movement?.text.toLowerCase()).toContain("leads out from here");
		expect(movement?.text.toLowerCase()).not.toContain("lake");
		expect(movement?.text.toLowerCase()).not.toContain("stream");
		expect(movement?.text.toLowerCase()).not.toContain("bog");
	});

	it("uses passage/blockage bias contributor key from open-exit count", () => {
		const passageBias = generateRawDescription(
			{
				...case04,
				passability: passabilityFromOpen(["N", "NE", "E"]),
			},
			"seed-topology-passage",
		);
		const blockageBias = generateRawDescription(
			{
				...case04,
				passability: passabilityFromOpen(["N", "NE", "E", "SE", "S"]),
			},
			"seed-topology-blockage",
		);

		const passageMovement = passageBias.sentences.find(
			(sentence) => sentence.slot === "movement_structure",
		);
		const blockageMovement = blockageBias.sentences.find(
			(sentence) => sentence.slot === "movement_structure",
		);
		expect(passageMovement?.contributorKeys.movement_structure).toBe(
			"passage_bias",
		);
		expect(blockageMovement?.contributorKeys.movement_structure).toBe(
			"blocked_bias",
		);
	});

	it("attaches blockedBy for blockage runs when eligible phrases exist", () => {
		const result = generateRawDescription(
			{
				...case04,
				biome: "mixed_forest",
				passability: passabilityFromOpen(["N", "NE", "E", "SE", "S"]),
				neighbors: {
					...case04.neighbors,
					W: {
						...case04.neighbors.W,
						water: "lake",
					},
				},
			},
			"seed-blocked-by-1",
		);

		const movement = result.sentences.find(
			(sentence) => sentence.slot === "movement_structure",
		);
		expect(movement).toBeDefined();
		const blockageRuns = movement?.movement?.filter(
			(run) => run.type === "blockage",
		);
		expect(blockageRuns?.length).toBeGreaterThan(0);
		expect(blockageRuns?.[0]?.blockedBy).toBeDefined();
		expect((movement?.text ?? "").toLowerCase()).toContain(
			(blockageRuns?.[0]?.blockedBy ?? "").toLowerCase(),
		);
	});

	it("uses lake_water override for whole blockage run when any blocked direction touches lake", () => {
		const result = generateRawDescription(
			{
				...case04,
				biome: "mixed_forest",
				obstacles: ["brush_blockage"],
				passability: {
					N: "blocked",
					NE: "blocked",
					E: "blocked",
					SE: "passable",
					S: "passable",
					SW: "passable",
					W: "passable",
					NW: "passable",
				},
				neighbors: {
					...case04.neighbors,
					N: { ...case04.neighbors.N, water: "lake" },
					NE: { ...case04.neighbors.NE, water: "none" },
					E: { ...case04.neighbors.E, water: "none" },
				},
			},
			"seed-lake-override",
		);
		const movement = result.sentences.find(
			(sentence) => sentence.slot === "movement_structure",
		);
		const blockageRun = movement?.movement?.find((run) => run.type === "blockage");
		expect(blockageRun).toBeDefined();
		expect(LAKE_WATER_PHRASES).toContain(blockageRun?.blockedBy);
	});

	it("reuses one lake phrase across multiple lake blockage runs in a tile", () => {
		const result = generateRawDescription(
			{
				...case04,
				biome: "mixed_forest",
				passability: {
					N: "passable",
					NE: "passable",
					E: "passable",
					SE: "blocked",
					S: "passable",
					SW: "passable",
					W: "blocked",
					NW: "passable",
				},
				neighbors: {
					...case04.neighbors,
					SE: { ...case04.neighbors.SE, water: "lake" },
					W: { ...case04.neighbors.W, water: "lake" },
				},
			},
			"seed-lake-shared-phrase",
		);

		const movement = result.sentences.find(
			(sentence) => sentence.slot === "movement_structure",
		);
		const blockageRuns = (movement?.movement ?? []).filter(
			(run) => run.type === "blockage",
		);
		expect(blockageRuns).toHaveLength(2);
		expect(blockageRuns[0]?.blockedBy).toBeDefined();
		expect(blockageRuns[0]?.blockedBy).toBe(blockageRuns[1]?.blockedBy);
		expect(movement?.text).toContain("southeast and west");
	});

	it("uses Appendix D seed-key formats for noun and blockage phrase picks", () => {
		const seed = "seed-key-contract";
		const result = generateRawDescription(
			{
				...case04,
				biome: "mixed_forest",
				passability: {
					N: "blocked",
					NE: "blocked",
					E: "blocked",
					SE: "passable",
					S: "passable",
					SW: "passable",
					W: "passable",
					NW: "passable",
				},
				neighbors: {
					...case04.neighbors,
					N: { ...case04.neighbors.N, water: "lake" },
					NE: { ...case04.neighbors.NE, water: "none" },
					E: { ...case04.neighbors.E, water: "none" },
				},
			},
			seed,
		);

		const movement = result.sentences.find(
			(sentence) => sentence.slot === "movement_structure",
		);
		const blockageRun = movement?.movement?.find((run) => run.type === "blockage");
		expect(blockageRun?.blockedBy).toBeDefined();

		const expectedNoun =
			TRAVERSAL_NOUNS[
				hash32(`${seed}:movement_structure:noun`) % TRAVERSAL_NOUNS.length
			];
		const expectedPhrase =
			LAKE_WATER_PHRASES[
				hash32(`${seed}:movement_structure:blockage:0:phrase`) %
					LAKE_WATER_PHRASES.length
			];

		expect(blockageRun?.blockedBy).toBe(expectedPhrase);
		expect(movement?.text?.toLowerCase()).toContain(`the ${expectedNoun} `);
	});

	it("falls back whole movement sentence to basicText when any blockage run has no pool", () => {
		const result = generateRawDescription(
			{
				...case04,
				biome: "pine_heath",
				landform: "flat",
				obstacles: [],
				slopeStrength: 0.02,
				passability: {
					N: "blocked",
					NE: "blocked",
					E: "passable",
					SE: "passable",
					S: "blocked",
					SW: "passable",
					W: "passable",
					NW: "passable",
				},
				neighbors: {
					N: { ...case04.neighbors.N, water: "none", elevDelta: 0 },
					NE: { ...case04.neighbors.NE, water: "none", elevDelta: 0 },
					E: { ...case04.neighbors.E, water: "none", elevDelta: 0 },
					SE: { ...case04.neighbors.SE, water: "none", elevDelta: 0 },
					S: { ...case04.neighbors.S, water: "none", elevDelta: 0 },
					SW: { ...case04.neighbors.SW, water: "none", elevDelta: 0 },
					W: { ...case04.neighbors.W, water: "none", elevDelta: 0 },
					NW: { ...case04.neighbors.NW, water: "none", elevDelta: 0 },
				},
			},
			"seed-fallback-all-or-nothing",
		);

		const movement = result.sentences.find(
			(sentence) => sentence.slot === "movement_structure",
		);
		expect(movement).toBeDefined();
		expect(movement?.text).toBeUndefined();
		expect(typeof movement?.basicText).toBe("string");
		const anyBlockedBy = movement?.movement?.some(
			(run) => run.type === "blockage" && typeof run.blockedBy === "string",
		);
		expect(anyBlockedBy).toBe(false);
	});

	it("avoids banned terms in generated text", () => {
		const result = generateRawDescription(case01, "seed-404");
		const lowered = result.text.toLowerCase();

		for (const forbidden of baseForbidden) {
			expect(lowered.includes(forbidden)).toBe(false);
		}
	});

	it("suppresses slope-intensity sentence when landform is slope", () => {
		const result = generateRawDescription(caseSlope, "seed-slope-1");
		expect(result.sentences.some((sentence) => sentence.slot === "slope")).toBe(
			false,
		);
	});

	it("uses fixed lake anchor text without obstacle merge and lake-aware movement wording", () => {
		const result = generateRawDescription(
			{
				...case04,
				landform: "slope",
				biome: "lake",
				obstacles: ["fallen_log"],
				followable: [],
				passability: passabilityFromOpen([]),
				neighbors: {
					N: { ...case04.neighbors.N, followable: [] },
					NE: { ...case04.neighbors.NE, followable: [] },
					E: { ...case04.neighbors.E, followable: [] },
					SE: { ...case04.neighbors.SE, followable: [] },
					S: { ...case04.neighbors.S, followable: [] },
					SW: { ...case04.neighbors.SW, followable: [] },
					W: { ...case04.neighbors.W, followable: [] },
					NW: { ...case04.neighbors.NW, followable: [] },
				},
			},
			"seed-lake-anchor-1",
		);

		const landform = result.sentences.find((sentence) => sentence.slot === "landform");
		expect(landform?.text).toBe("This is lake surface.");
		expect(landform?.contributors).toEqual(["landform", "biome"]);
		expect(landform?.contributorKeys.obstacle).toBeUndefined();
		const movement = result.sentences.find(
			(sentence) => sentence.slot === "movement_structure",
		);
		expect(movement?.text).toContain("across the water");
		expect(
			result.sentences.some((sentence) => sentence.slot === "movement_structure"),
		).toBe(true);
	});

	it("throws in strict mode when biome phrases are missing", () => {
		expect(() =>
			generateRawDescription(
				{ ...case01, biome: "unknown_biome" },
				"seed-strict-1",
				{
					strict: true,
				},
			),
		).toThrowError(DescriptionPhraseError);
	});

	it("does not emit visibility sentence slots", () => {
		const result = generateRawDescription(case01, "seed-visibility-off");
		expect(
			result.sentences.some((sentence) => sentence.slot === "visibility"),
		).toBe(false);
	});
});
