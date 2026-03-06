import { describe, expect, it } from "vitest";
import { DIR8_CODE, DIR8_NONE } from "../../src/domain/hydrology.js";
import { createGridShape } from "../../src/domain/topography.js";
import { deriveHydrology } from "../../src/pipeline/derive-hydrology.js";
import { deriveLakeAccounting } from "../../src/pipeline/derive-lake-accounting.js";
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
	it("ignores out-of-range direct and child basin tileIds in accounting", () => {
		const { shape, h, basinFeatures, tileFeatureIds } = buildSyntheticLakeCase();
		const baseline = deriveHydrology(
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
		const withOutOfRangeTileIds = deriveHydrology(
			shape,
			h,
			{
				basinFeatures: basinFeatures.map((basin) =>
					basin.id === "b_child"
						? { ...basin, tileIds: [0, 999] }
						: basin.id === "b_parent"
							? { ...basin, tileIds: [1, 2, 3, 4, 5, 888] }
							: basin,
				),
				tileFeatureIds,
			},
			{
				hydrology: {
					sinkMode: "strict_local",
					lakeFill: { wetnessScale: 1.0 },
				},
			},
		);

		const baselineChild = baseline.lakeAccounting.byId.get("b_child");
		const baselineParent = baseline.lakeAccounting.byId.get("b_parent");
		const withOutOfRangeChild =
			withOutOfRangeTileIds.lakeAccounting.byId.get("b_child");
		const withOutOfRangeParent =
			withOutOfRangeTileIds.lakeAccounting.byId.get("b_parent");
		expect(baselineChild).toBeDefined();
		expect(baselineParent).toBeDefined();
		expect(withOutOfRangeChild).toBeDefined();
		expect(withOutOfRangeParent).toBeDefined();
		expect(withOutOfRangeChild.spillCapacity).toBeCloseTo(
			baselineChild.spillCapacity,
			6,
		);
		expect(withOutOfRangeChild.fillRatio).toBeCloseTo(baselineChild.fillRatio, 6);
		expect(withOutOfRangeChild.role).toBe(baselineChild.role);
		expect(withOutOfRangeParent.totalInflow).toBeCloseTo(
			baselineParent.totalInflow,
			6,
		);
	});

	it("keeps deterministic behavior with out-of-range basin tileIds", () => {
		const { shape, h, basinFeatures, tileFeatureIds } = buildSyntheticLakeCase();
		const invalidFeatures = basinFeatures.map((basin) =>
			basin.id === "b_child"
				? { ...basin, tileIds: [0, 99999] }
				: basin.id === "b_parent"
					? { ...basin, tileIds: [1, 2, 3, 4, 5, 88888] }
					: basin,
		);
		const runOnce = () =>
			deriveHydrology(
				shape,
				h,
				{ basinFeatures: invalidFeatures, tileFeatureIds },
				{
					hydrology: {
						sinkMode: "strict_local",
						lakeFill: { wetnessScale: 1.0 },
					},
				},
			);

		const first = runOnce();
		const second = runOnce();
		const firstChild = first.lakeAccounting.byId.get("b_child");
		const secondChild = second.lakeAccounting.byId.get("b_child");
		expect(firstChild).toBeDefined();
		expect(secondChild).toBeDefined();
		expect(secondChild.fillRatio).toBeCloseTo(firstChild.fillRatio, 6);
		expect(secondChild.spillCapacity).toBeCloseTo(firstChild.spillCapacity, 6);
		expect(secondChild.role).toBe(firstChild.role);
	});

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

	it("throws when a basin references an unknown child id", () => {
		const { shape, h, basinFeatures, tileFeatureIds } = buildSyntheticLakeCase();
		const parent = basinFeatures.find((basin) => basin.id === "b_parent");
		expect(parent).toBeDefined();
		parent.childIds = ["b_child", "b_missing"];

		expect(() =>
			deriveHydrology(
				shape,
				h,
				{ basinFeatures, tileFeatureIds },
				{
					hydrology: {
						sinkMode: "strict_local",
						lakeFill: { wetnessScale: 1.0 },
					},
				},
			),
		).toThrow(
			'Lake accounting topology error: basin "b_parent" references missing child basin "b_missing".',
		);
	});

	it("keeps parent dry at child-connect threshold even with parent external inflow", () => {
		const shape = createGridShape(2, 2);
		const h = new Float32Array([
			0.6, 0.6, // y=0
			0.1, 0.2, // y=1
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
				spillOutTileId: 3,
				childSpillFromTileId: 2,
				parentContactTileId: 3,
				minH: 0.1,
				maxH: 0.1,
				size: 1,
				bbox: { minX: 0, minY: 1, maxX: 0, maxY: 1 },
				tileIds: [2],
			}),
			makeBasinNode({
				id: "b_parent",
				kind: "composite",
				parentId: null,
				childIds: ["b_child"],
				birthH: 0.3,
				mergeH: 0.6,
				persistence: null,
				spillOutTileId: null,
				minH: 0.1,
				maxH: 0.2,
				size: 2,
				bbox: { minX: 0, minY: 1, maxX: 1, maxY: 1 },
				tileIds: [3],
			}),
		];
		const fdBase = new Uint8Array([
			DIR8_CODE.s,
			DIR8_CODE.s,
			DIR8_NONE,
			DIR8_NONE,
		]);
		const faBase = new Uint32Array([1, 1, 1, 1]);
		const calibration = deriveLakeAccounting(
			shape,
			h,
			fdBase,
			faBase,
			basinFeatures,
			{ wetnessScale: 1 },
		);
		const childCalibration = calibration.byId.get("b_child");
		expect(childCalibration).toBeDefined();
		const kAtConnect =
			childCalibration.spillCapacity / childCalibration.externalInflow;

		const atConnect = deriveLakeAccounting(
			shape,
			h,
			fdBase,
			faBase,
			basinFeatures,
			{ wetnessScale: kAtConnect },
		);
		const childAtConnect = atConnect.byId.get("b_child");
		const parentAtConnect = atConnect.byId.get("b_parent");
		expect(childAtConnect).toBeDefined();
		expect(parentAtConnect).toBeDefined();
		expect(childAtConnect.isFilled).toBe(true);
		expect(parentAtConnect.externalInflow).toBeGreaterThan(0);
		// Child-connect invariant: parent remains dry at the exact threshold.
		expect(parentAtConnect.fillRatio).toBe(0);
	});
});
