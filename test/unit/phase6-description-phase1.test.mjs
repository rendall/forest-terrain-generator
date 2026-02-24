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

	it("returns null movement sentence when all directions are passable", () => {
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
		expect(
			result.sentences.some((sentence) => sentence.slot === "movement_structure"),
		).toBe(false);
	});

	it("includes constrained difficult-footing clause for difficult-only exits", () => {
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
		expect(movement?.text.toLowerCase()).toContain("harder going");
		expect(movement?.text.toLowerCase()).not.toContain("lake");
		expect(movement?.text.toLowerCase()).not.toContain("stream");
		expect(movement?.text.toLowerCase()).not.toContain("bog");
	});

	it("classifies representative topology variants from open directions", () => {
		const cases = [
			{ open: ["SE"], expected: "cul_de_sac" },
			{ open: ["N", "S"], expected: "corridor" },
			{ open: ["N", "NE"], expected: "corner" },
			{ open: ["N", "SE"], expected: "skew_bend" },
			{ open: ["N", "S", "E"], expected: "t_junction" },
			{ open: ["NW", "N", "NE"], expected: "fan_3" },
			{ open: ["N", "E", "S", "W"], expected: "cardinal_crossroads" },
			{ open: ["NE", "SE", "SW", "NW"], expected: "diagonal_crossroads" },
			{
				open: ["E", "SE", "S", "SW", "W", "NW"],
				expected: "open_with_notch",
			},
			{
				open: ["N", "NE", "E", "SE", "S", "SW", "W"],
				expected: "nearly_open",
			},
		];

		for (const topologyCase of cases) {
			const result = generateRawDescription(
				{
					...case04,
					passability: passabilityFromOpen(topologyCase.open),
				},
				`seed-topology-${topologyCase.expected}`,
			);
			const movement = result.sentences.find(
				(sentence) => sentence.slot === "movement_structure",
			);
			expect(movement).toBeDefined();
			expect(movement?.contributorKeys.movement_structure).toBe(
				topologyCase.expected,
			);
		}
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
