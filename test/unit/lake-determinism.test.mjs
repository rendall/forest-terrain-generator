import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";
import { deriveHydrology } from "../../src/pipeline/derive-hydrology.js";

const buildCase = () => {
	const shape = createGridShape(3, 2);
	const h = new Float32Array([
		0.1, 0.3, 0.05, // y=0
		0.15, 0.35, 0.4, // y=1
	]);
	const basinFeatures = [
		{
			id: "b_child",
			kind: "leaf",
			parentId: "b_parent",
			childIds: [],
			birthH: 0.1,
			mergeH: 0.3,
			persistence: 0.2,
			spillOutTileId: 4,
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
	];
	const tileFeatureIds = [
		["b_child", "b_parent"],
		["b_parent"],
		["b_parent"],
		["b_parent"],
		["b_parent"],
		["b_parent"],
	];
	const params = {
		hydrology: {
			sinkMode: "overflow_guided",
			lakeFill: { wetnessScale: 1 },
		},
	};
	return { shape, h, basinFeatures, tileFeatureIds, params };
};

describe("lake accounting determinism", () => {
	it("produces identical lake accounting and roles across repeated runs", () => {
		const { shape, h, basinFeatures, tileFeatureIds, params } = buildCase();
		const first = deriveHydrology(
			shape,
			h,
			{ basinFeatures, tileFeatureIds },
			params,
		);
		const second = deriveHydrology(
			shape,
			h,
			{ basinFeatures, tileFeatureIds },
			params,
		);

		expect(Array.from(first.maps.fd)).toEqual(Array.from(second.maps.fd));
		expect(Array.from(first.maps.lakeMask)).toEqual(Array.from(second.maps.lakeMask));
		expect(first.lakeAccounting.basins).toEqual(second.lakeAccounting.basins);
		expect(first.lakeAccounting.tileLakeBasinId).toEqual(
			second.lakeAccounting.tileLakeBasinId,
		);
	});

	it("keeps deterministic tie resolution for equal-depth overlaps regardless basin input order", () => {
		const shape = createGridShape(2, 1);
		const h = new Float32Array([0.1, 0.2]);
		const child = {
			id: "b_aaa",
			kind: "leaf",
			parentId: "b_zzz",
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
		};
		const parent = {
			id: "b_zzz",
			kind: "composite",
			parentId: null,
			childIds: ["b_aaa"],
			birthH: 0.3,
			mergeH: 0.3,
			persistence: null,
			spillOutTileId: null,
			minH: 0.1,
			maxH: 0.2,
			size: 2,
			bbox: { minX: 0, minY: 0, maxX: 1, maxY: 0 },
			tileIds: [1],
		};
		const tileFeatureIds = [["b_aaa", "b_zzz"], ["b_zzz"]];
		const params = {
			hydrology: {
				sinkMode: "strict_local",
				lakeFill: { wetnessScale: 10 },
			},
		};

		const first = deriveHydrology(
			shape,
			h,
			{ basinFeatures: [child, parent], tileFeatureIds },
			params,
		);
		const second = deriveHydrology(
			shape,
			h,
			{ basinFeatures: [parent, child], tileFeatureIds },
			params,
		);

		expect(first.lakeAccounting.tileLakeBasinId[0]).toBe("b_aaa");
		expect(second.lakeAccounting.tileLakeBasinId[0]).toBe("b_aaa");
		expect(first.lakeAccounting.tileLakeBasinId).toEqual(
			second.lakeAccounting.tileLakeBasinId,
		);
	});
});
