import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";
import { deriveHydrology } from "../../src/pipeline/derive-hydrology.js";

const buildCase = () => {
	const shape = createGridShape(3, 2);
	const h = new Float32Array([
		0.1,
		0.3,
		0.05, // y=0
		0.15,
		0.35,
		0.4, // y=1
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
		expect(first.lakeAccounting.basins).toEqual(second.lakeAccounting.basins);
		expect(first.lakeAccounting.tileLakeBasinId).toEqual(
			second.lakeAccounting.tileLakeBasinId,
		);
	});

	it("keeps deterministic stable-id tie-break for equally specific active overlaps", () => {
		const shape = createGridShape(2, 1);
		const h = new Float32Array([0.1, 0.9]);
		const basinA = {
			id: "b_aaa",
			kind: "leaf",
			parentId: null,
			childIds: [],
			birthH: 0.1,
			mergeH: 0.2,
			persistence: 0.1,
			spillOutTileId: null,
			childSpillFromTileId: null,
			parentContactTileId: null,
			minH: 0.1,
			maxH: 0.1,
			size: 1,
			bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
			tileIds: [0],
		};
		const basinZ = {
			id: "b_zzz",
			kind: "leaf",
			parentId: null,
			childIds: [],
			birthH: 0.1,
			mergeH: 0.8,
			persistence: 0.7,
			spillOutTileId: null,
			childSpillFromTileId: null,
			parentContactTileId: null,
			minH: 0.1,
			maxH: 0.1,
			size: 1,
			bbox: { minX: 0, minY: 0, maxX: 1, maxY: 0 },
			tileIds: [0],
		};
		const tileFeatureIds = [["b_aaa", "b_zzz"], []];
		const params = {
			hydrology: {
				sinkMode: "strict_local",
				lakeFill: { wetnessScale: 1 },
			},
		};

		const first = deriveHydrology(
			shape,
			h,
			{ basinFeatures: [basinA, basinZ], tileFeatureIds },
			params,
		);
		const second = deriveHydrology(
			shape,
			h,
			{ basinFeatures: [basinZ, basinA], tileFeatureIds },
			params,
		);

		expect(
			first.lakeAccounting.byId.get("b_zzz")?.waterSurfaceH,
		).toBeGreaterThan(
			first.lakeAccounting.byId.get("b_aaa")?.waterSurfaceH ?? -Infinity,
		);
		expect(first.lakeAccounting.tileLakeBasinId[0]).toBe("b_aaa");
		expect(second.lakeAccounting.tileLakeBasinId[0]).toBe("b_aaa");
		expect(first.lakeAccounting.tileLakeBasinId).toEqual(
			second.lakeAccounting.tileLakeBasinId,
		);
	});
});
