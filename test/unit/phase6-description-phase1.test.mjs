import { describe, expect, it } from "vitest";
import { generateRawDescription } from "../../src/pipeline/description.js";

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
  "seems"
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
    N: { biome: "mixed_forest", water: "none", elevDelta: 0.1, densityDelta: -0.1 },
    NE: { biome: "mixed_forest", water: "none", elevDelta: 0.06, densityDelta: -0.05 },
    E: { biome: "spruce_swamp", water: "marsh", elevDelta: 0, densityDelta: 0.05 },
    SE: { biome: "spruce_swamp", water: "stream", elevDelta: -0.02, densityDelta: 0.1 },
    S: { biome: "spruce_swamp", water: "lake", elevDelta: -0.05, densityDelta: -0.05 },
    SW: { biome: "spruce_swamp", water: "marsh", elevDelta: -0.01, densityDelta: 0.05 },
    W: { biome: "spruce_swamp", water: "none", elevDelta: 0.02, densityDelta: 0 },
    NW: { biome: "mixed_forest", water: "none", elevDelta: 0.08, densityDelta: -0.05 }
  }
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
    N: { biome: "pine_heath", water: "none", elevDelta: 0.01, densityDelta: -0.05 },
    NE: { biome: "pine_heath", water: "none", elevDelta: 0, densityDelta: 0 },
    E: { biome: "pine_heath", water: "none", elevDelta: -0.02, densityDelta: 0 },
    SE: { biome: "mixed_forest", water: "none", elevDelta: -0.04, densityDelta: 0.1 },
    S: { biome: "mixed_forest", water: "none", elevDelta: -0.06, densityDelta: 0.15 },
    SW: { biome: "mixed_forest", water: "none", elevDelta: -0.05, densityDelta: 0.1 },
    W: { biome: "pine_heath", water: "none", elevDelta: 0.02, densityDelta: 0 },
    NW: { biome: "pine_heath", water: "none", elevDelta: 0.03, densityDelta: -0.05 }
  }
};

describe("Phase 1 description pipeline", () => {
  it("produces deterministic raw sentence output for the same seed key", () => {
    const a = generateRawDescription(case01, "seed-42");
    const b = generateRawDescription(case01, "seed-42");

    expect(a).toEqual(b);
  });

  it("respects sentence cap and includes anchor slots", () => {
    const result = generateRawDescription(case01, "seed-101");

    expect(result.sentences.length).toBeLessThanOrEqual(4);
    expect(result.sentences.some((sentence) => sentence.slot === "landform")).toBe(true);
    expect(result.sentences.some((sentence) => sentence.slot === "biome")).toBe(true);
  });

  it("keeps directional mentions to one sentence and uses diegetic directional wording", () => {
    const result = generateRawDescription(case04, "seed-303");
    const directionalSentences = result.sentences.filter((sentence) => sentence.slot === "directional");

    expect(directionalSentences.length).toBeLessThanOrEqual(1);
    if (directionalSentences.length === 1) {
      expect(directionalSentences[0].text).toMatch(/^To the (north|south|east|west|northeast|northwest|southeast|southwest)/);
    }
  });

  it("avoids banned terms in generated text", () => {
    const result = generateRawDescription(case01, "seed-404");
    const lowered = result.text.toLowerCase();

    for (const forbidden of baseForbidden) {
      expect(lowered.includes(forbidden)).toBe(false);
    }
  });
});
