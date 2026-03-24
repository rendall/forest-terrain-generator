import { describe, expect, it } from "vitest";
import { DIR8_CODE, DIR8_NONE } from "../../src/domain/hydrology.js";
import { createGridShape } from "../../src/domain/topography.js";
import { deriveHydrology } from "../../src/pipeline/derive-hydrology.js";

describe("lake external inflow boundary accounting", () => {
	it("LB-01 outside_of_tiles_boundary_rule", () => {
		const shape = createGridShape(3, 1);
		const h = new Float32Array([0.9, 0.5, 0.1]);
		const out = deriveHydrology(
			shape,
			h,
			{
				basinFeatures: [
					{
						id: "b_leaf",
						kind: "leaf",
						parentId: null,
						childIds: [],
						birthH: 0.1,
						mergeH: 0.3,
						persistence: 0.2,
						spillOutTileId: null,
						minH: 0.1,
						maxH: 0.1,
						size: 1,
						bbox: { minX: 2, minY: 0, maxX: 2, maxY: 0 },
						tileIds: [2],
					},
				],
				tileFeatureIds: [[], [], ["b_leaf"]],
			},
			{},
		);

		expect(out.maps.fd[0]).toBe(DIR8_CODE.e);
		expect(out.maps.fd[1]).toBe(DIR8_CODE.e);
		expect(out.maps.fd[2]).toBe(DIR8_NONE);
		expect(out.maps.fa[1]).toBe(2);
		expect(out.lakeAccounting.byId.get("b_leaf")?.externalInflow).toBe(2);
	});

	it("LB-02 child_to_parent_crossing_not_external", () => {
		const shape = createGridShape(3, 1);
		const h = new Float32Array([0.9, 0.5, 0.1]);
		const out = deriveHydrology(
			shape,
			h,
			{
				basinFeatures: [
					{
						id: "b_child",
						kind: "leaf",
						parentId: "b_parent",
						childIds: [],
						birthH: 0.5,
						mergeH: 0.6,
						persistence: 0.1,
						spillOutTileId: 2,
						childSpillFromTileId: 1,
						parentContactTileId: 2,
						minH: 0.5,
						maxH: 0.5,
						size: 1,
						bbox: { minX: 1, minY: 0, maxX: 1, maxY: 0 },
						tileIds: [1],
					},
					{
						id: "b_parent",
						kind: "composite",
						parentId: null,
						childIds: ["b_child"],
						birthH: 0.6,
						mergeH: null,
						persistence: null,
						spillOutTileId: null,
						minH: 0.1,
						maxH: 0.5,
						size: 2,
						bbox: { minX: 1, minY: 0, maxX: 2, maxY: 0 },
						tileIds: [2],
					},
				],
				tileFeatureIds: [[], ["b_child", "b_parent"], ["b_parent"]],
			},
			{},
		);

		const child = out.lakeAccounting.byId.get("b_child");
		const parent = out.lakeAccounting.byId.get("b_parent");
		expect(child?.externalInflow).toBe(1); // 0->1
		expect(parent?.externalInflow).toBe(1); // 0->1 only; 1->2 is internal to {1,2}
	});
});
