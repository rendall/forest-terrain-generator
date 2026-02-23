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
