import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";
import { DIR8_NONE } from "../../src/domain/hydrology.js";
import { deriveHydrology } from "../../src/pipeline/derive-hydrology.js";
import { deriveTopographicStructure } from "../../src/pipeline/derive-topographic-structure.js";
import { makeBasinNode } from "./helpers/lake-fixtures.mjs";

describe("lake topology synthetic fixtures", () => {
	it("LT-01 flat_bottom_multi_tile_leaf", () => {
		const shape = createGridShape(4, 1);
		const h = new Float32Array([0.0, 0.0, 0.3, 0.1]);
		const out = deriveTopographicStructure(shape, h, {
			enabled: true,
			connectivity: "dir8",
			hEps: 0.000001,
			persistenceMin: 0.01,
			unresolvedPolicy: "nan",
		});

		const leaves = out.basinFeatures.filter((node) => node.kind === "leaf");
		expect(leaves.length).toBe(2);
		const flatLeaf = leaves.find(
			(node) =>
				Array.isArray(node.tileIds) &&
				node.tileIds.length === 2 &&
				node.tileIds.includes(0) &&
				node.tileIds.includes(1),
		);
		expect(flatLeaf).toBeDefined();
	});

	it("LT-02 invalid_spill_edge_non_root", () => {
		const shape = createGridShape(2, 1);
		const h = new Float32Array([0.5, 0.6]);
		const structure = {
			basinFeatures: [
				makeBasinNode({
					id: "b_leaf",
					kind: "leaf",
					parentId: "b_parent",
					childIds: [],
					mergeH: 0.6,
					spillOutTileId: 1,
					childSpillFromTileId: 1, // invalid: outside b_leaf tileIds
					parentContactTileId: 1,
					minH: 0.5,
					maxH: 0.5,
					size: 1,
					bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
					tileIds: [0],
				}),
				makeBasinNode({
					id: "b_parent",
					kind: "composite",
					parentId: null,
					childIds: ["b_leaf"],
					birthH: 0.6,
					mergeH: null,
					persistence: null,
					spillOutTileId: null,
					minH: 0.6,
					maxH: 0.6,
					size: 1,
					bbox: { minX: 1, minY: 0, maxX: 1, maxY: 0 },
					tileIds: [1],
				}),
			],
			tileFeatureIds: [["b_leaf", "b_parent"], ["b_parent"]],
		};

		const run = () =>
			deriveHydrology(shape, h, structure, {
				hydrology: { sinkMode: "overflow_guided", faThreshold: 1 },
			});

		const first = run();
		const second = run();

		expect(first.diagnostics.overflowAppliedCount).toBe(0);
		expect(first.diagnostics.overflowFallbackCount).toBe(1);
		expect(first.maps.fd[0]).toBe(DIR8_NONE);
		expect(Array.from(first.maps.fd)).toEqual(Array.from(second.maps.fd));
		expect(first.diagnostics).toEqual(second.diagnostics);
	});
});
