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
		const shape = createGridShape(2, 1);
		const h = new Float32Array([0.5, 0.6]);
		const result = deriveHydrology(
			shape,
			h,
			{
				basinFeatures: [
					{
						id: "b_00000",
						kind: "leaf",
						parentId: null,
						childIds: [],
						birthH: 0,
						mergeH: null,
						persistence: null,
						spillOutTileId: 1,
						childSpillFromTileId: 0,
						parentContactTileId: 1,
						minH: 0.5,
						maxH: 0.5,
						size: 1,
						bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
						tileIds: [0],
					},
				],
				tileFeatureIds: [["b_00000"], []],
			},
			{ hydrology: { sinkMode: "overflow_guided", faThreshold: 1 } },
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
		const shape = createGridShape(2, 1);
		const h = new Float32Array([0.5, 0.6]);
		const result = deriveHydrology(
			shape,
			h,
			{
				basinFeatures: [
					{
						id: "b_00000",
						kind: "leaf",
						parentId: null,
						childIds: [],
						birthH: 0,
						mergeH: null,
						persistence: null,
						spillOutTileId: 1,
						childSpillFromTileId: 1, // invalid: spillFrom not in basin tileIds
						parentContactTileId: 1,
						minH: 0.5,
						maxH: 0.5,
						size: 1,
						bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
						tileIds: [0],
					},
				],
				tileFeatureIds: [["b_00000"], []],
			},
			{ hydrology: { sinkMode: "overflow_guided", faThreshold: 1 } },
		);
		expect(result.diagnostics.overflowAppliedCount).toBe(0);
		expect(result.diagnostics.overflowFallbackCount).toBe(1);
		expect(result.maps.fd[0]).toBe(255);
	});
});
