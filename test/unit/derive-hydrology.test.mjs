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
});
