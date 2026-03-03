import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";
import { deriveHydrology } from "../../src/pipeline/derive-hydrology.js";

const emptyStructure = (size) => ({
	basinFeatures: [],
	tileFeatureIds: Array.from({ length: size }, () => []),
});

describe("derive-hydrology", () => {
	it("defaults to strict_local and absolute fa threshold", () => {
		const shape = createGridShape(3, 1);
		const h = new Float32Array([0.9, 0.5, 0.1]);
		const result = deriveHydrology(shape, h, emptyStructure(shape.size), {});
		expect(result.maps.fa[0]).toBe(1);
		expect(result.maps.fa[1]).toBe(2);
		expect(result.maps.fa[2]).toBe(3);
		expect(result.maps.isStream[2]).toBe(0);
	});

	it("supports overflow_guided when configured", () => {
		const shape = createGridShape(3, 2);
		const h = new Float32Array([
			0.1, 0.3, 0.05, // y=0
			0.15, 0.35, 0.4, // y=1
		]);
		const result = deriveHydrology(
			shape,
			h,
			{
				basinFeatures: [
					{
						id: "b_child",
						kind: "leaf",
						parentId: "b_parent",
						childIds: [],
						birthH: 0.1,
						mergeH: 0.3,
						persistence: 0.2,
						spillOutTileId: 1,
						childSpillFromTileId: 0,
						parentContactTileId: 1,
						minH: 0.1,
						maxH: 0.1,
						size: 1,
						bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
						tileIds: [0],
					},
					{
						id: "b_parent",
						kind: "composite",
						parentId: null,
						childIds: ["b_child"],
						birthH: 0.3,
						mergeH: null,
						persistence: null,
						spillOutTileId: null,
						minH: 0.05,
						maxH: 0.4,
						size: 6,
						bbox: { minX: 0, minY: 0, maxX: 2, maxY: 1 },
						tileIds: [1, 2, 3, 4, 5],
					},
				],
				tileFeatureIds: [
					["b_child", "b_parent"],
					["b_parent"],
					["b_parent"],
					["b_parent"],
					["b_parent"],
					["b_parent"],
				],
			},
			{
				hydrology: {
					sinkMode: "overflow_guided",
					faThreshold: 1,
					lakeFill: { wetnessScale: 1 },
				},
			},
		);
		expect(result.diagnostics.overflowAppliedCount).toBe(1);
	});

	it("prefers cardinal over diagonal when downhill heights tie", () => {
		const shape = createGridShape(3, 2);
		const h = new Float32Array([
			0.5,
			0.5,
			0.9, // y=0
			0.4,
			0.6,
			0.4, // y=1
		]);
		const result = deriveHydrology(shape, h, emptyStructure(shape.size), {});
		// center tile (1,1) has equal-height downhill options at (0,1) and (2,1) cardinal,
		// and diagonals at (0,0)/(1,0) are not lower than 0.6 by same amount for this tie case.
		// tie should choose smallest tile index among same-step candidates => (0,1) index 3.
		expect(result.maps.fd[4]).toBe(4); // W
	});

	it("falls back per-tile to strict_local when spill edge metadata is invalid", () => {
		const shape = createGridShape(3, 2);
		const h = new Float32Array([
			0.1, 0.3, 0.05, // y=0
			0.15, 0.35, 0.4, // y=1
		]);
		const result = deriveHydrology(
			shape,
			h,
			{
				basinFeatures: [
					{
						id: "b_child",
						kind: "leaf",
						parentId: "b_parent",
						childIds: [],
						birthH: 0.1,
						mergeH: 0.3,
						persistence: 0.2,
						spillOutTileId: 1,
						childSpillFromTileId: 1, // invalid: spillFrom not in basin tileIds
						parentContactTileId: 1,
						minH: 0.1,
						maxH: 0.1,
						size: 1,
						bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
						tileIds: [0],
					},
					{
						id: "b_parent",
						kind: "composite",
						parentId: null,
						childIds: ["b_child"],
						birthH: 0.3,
						mergeH: null,
						persistence: null,
						spillOutTileId: null,
						minH: 0.05,
						maxH: 0.4,
						size: 6,
						bbox: { minX: 0, minY: 0, maxX: 2, maxY: 1 },
						tileIds: [1, 2, 3, 4, 5],
					},
				],
				tileFeatureIds: [
					["b_child", "b_parent"],
					["b_parent"],
					["b_parent"],
					["b_parent"],
					["b_parent"],
					["b_parent"],
				],
			},
			{
				hydrology: {
					sinkMode: "overflow_guided",
					faThreshold: 1,
					lakeFill: { wetnessScale: 1 },
				},
			},
		);
		expect(result.diagnostics.overflowAppliedCount).toBe(0);
		expect(result.diagnostics.overflowFallbackCount).toBe(2);
		expect(result.maps.fd[0]).toBe(255);
	});
});
