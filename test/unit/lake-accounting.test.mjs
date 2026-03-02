import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";
import { deriveHydrology } from "../../src/pipeline/derive-hydrology.js";
import { makeBasinNode } from "./helpers/lake-fixtures.mjs";

const buildSyntheticLakeCase = () => {
	const shape = createGridShape(3, 2);
	const h = new Float32Array([
		0.1, 0.3, 0.05, // y=0
		0.15, 0.35, 0.4, // y=1
	]);
	const basinFeatures = [
		makeBasinNode({
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
		}),
		makeBasinNode({
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
		}),
	];
	const tileFeatureIds = [
		["b_child", "b_parent"],
		["b_parent"],
		["b_parent"],
		["b_parent"],
		["b_parent"],
		["b_parent"],
	];
	return { shape, h, basinFeatures, tileFeatureIds };
};

describe("lake accounting from production hydrology pipeline", () => {
	it("classifies a supplied leaf basin as overflow carrier and computes accounting", () => {
		const { shape, h, basinFeatures, tileFeatureIds } = buildSyntheticLakeCase();
		const result = deriveHydrology(
			shape,
			h,
			{ basinFeatures, tileFeatureIds },
			{
				hydrology: {
					sinkMode: "strict_local",
					lakeFill: { wetnessScale: 1.0 },
				},
			},
		);

		expect(result.lakeAccounting).toBeDefined();
		expect(result.lakeCoherence.enabled).toBe(true);
		const byId = result.lakeAccounting.byId;
		const child = byId.get("b_child");
		const parent = byId.get("b_parent");
		expect(child).toBeDefined();
		expect(parent).toBeDefined();
		expect(child.externalInflow).toBe(1);
		expect(child.totalInflow).toBe(1);
		expect(child.spillCapacity).toBeCloseTo(0.2, 6);
		expect(child.isFilled).toBe(true);
		expect(child.role).toBe("overflow_carrier");
		expect(child.overflowExcess).toBeCloseTo(0.8, 6);
		expect(parent.externalInflow).toBe(0);
		expect(parent.totalInflow).toBeCloseTo(child.overflowExcess, 6);
	});

	it("keeps the same basin as a sink when wetnessScale is zero", () => {
		const { shape, h, basinFeatures, tileFeatureIds } = buildSyntheticLakeCase();
		const result = deriveHydrology(
			shape,
			h,
			{ basinFeatures, tileFeatureIds },
			{
				hydrology: {
					sinkMode: "strict_local",
					lakeFill: { wetnessScale: 0 },
				},
			},
		);
		const child = result.lakeAccounting.byId.get("b_child");
		expect(child).toBeDefined();
		expect(child.fillRatio).toBe(0);
		expect(child.isFilled).toBe(false);
		expect(child.role).toBe("sink");
		expect(child.overflowExcess).toBe(0);
	});
});
