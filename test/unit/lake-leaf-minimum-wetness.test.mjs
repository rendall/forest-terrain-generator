import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readTerrainEnvelopeFile } from "../../src/io/read-envelope.js";
import { APPENDIX_A_DEFAULTS } from "../../src/lib/default-params.js";
import { deepMerge } from "../../src/lib/deep-merge.js";
import { deriveHydrology } from "../../src/pipeline/derive-hydrology.js";
import { deriveTopographicStructure } from "../../src/pipeline/derive-topographic-structure.js";

const FIXTURE_ENVELOPE = resolve(
	process.cwd(),
	"test/fixtures/hydrology-baseline/debug-envelope.json",
);

const CURRENT_CHILD_CONNECT_EPS = 1e-9;
// This test currently targets the effective minimum wetness floor imposed by
// derive-lake-accounting's CHILD_CONNECT_EPS / WATER_SURFACE_EPS gates.
// `1e-9 + Number.MIN_VALUE` rounds back to `1e-9` in JS Numbers, so use the
// next representable float above the current quantum. Revisit this floor later.
const MINIMUM_EFFECTIVE_WETNESS_SCALE =
	CURRENT_CHILD_CONNECT_EPS * (1 + Number.EPSILON);

const loadReplayTerrain = async () => {
	const envelope = await readTerrainEnvelopeFile(FIXTURE_ENVELOPE);
	const tiles = [...envelope.tiles].sort((a, b) => a.index - b.index);
	const width = Math.max(...tiles.map((tile) => tile.x)) + 1;
	const height = Math.max(...tiles.map((tile) => tile.y)) + 1;
	const shape = { width, height, size: width * height };
	const h = new Float32Array(shape.size);

	tiles.forEach((tile) => {
		h[tile.index] = tile.topography.h;
	});

	return { shape, h };
};

describe("leaf basin minimum-wetness invariant", () => {
	it("gives every leaf basin and its tiles water just above the current effective wetness floor", async () => {
		const { shape, h } = await loadReplayTerrain();
		const structure = deriveTopographicStructure(
			shape,
			h,
			APPENDIX_A_DEFAULTS.topography.structure,
		);
		const hydrology = deriveHydrology(
			shape,
			h,
			{
				basinFeatures: structure.basinFeatures,
				tileFeatureIds: structure.tileFeatureIds,
			},
			deepMerge(APPENDIX_A_DEFAULTS, {
				hydrology: {
					lakeFill: { wetnessScale: MINIMUM_EFFECTIVE_WETNESS_SCALE },
				},
			}),
		);

		const topologyById = new Map(
			structure.basinFeatures.map((basin) => [basin.id, basin]),
		);
		const leafBasins = hydrology.lakeAccounting.basins
			.filter((basin) => basin.childIds.length === 0)
			.sort((a, b) => a.id.localeCompare(b.id));

		expect(leafBasins.length).toBeGreaterThan(0);
		expect(leafBasins.every((basin) => basin.externalInflow > 0)).toBe(true);

		leafBasins.forEach((basin) => {
			expect(basin.allocatedVolume).toBeGreaterThan(0);
			expect(basin.waterSurfaceH).toBeTypeOf("number");

			const topology = topologyById.get(basin.id);
			expect(topology).toBeDefined();
			expect(Array.isArray(topology.tileIds)).toBe(true);
			expect(topology.tileIds.length).toBeGreaterThan(0);

			topology.tileIds.forEach((tileId) => {
				expect(hydrology.lakeAccounting.tileLakeBasinId[tileId]).toBe(basin.id);
				expect(hydrology.lakeAccounting.tileLakeDepth[tileId]).toBeTypeOf(
					"number",
				);
			});
		});
	});
});
