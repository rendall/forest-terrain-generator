import { describe, expect, it } from "vitest";
import { DIR8_CODE, DIR8_NONE } from "../../src/domain/hydrology.js";
import { createGridShape } from "../../src/domain/topography.js";
import { deriveHydrology } from "../../src/pipeline/derive-hydrology.js";
import { deriveLakeAccounting } from "../../src/pipeline/derive-lake-accounting.js";
import {
	buildNestedSiblingBasinFixture,
	makeBasinNode,
} from "./helpers/lake-fixtures.mjs";

const buildSyntheticLakeCase = () => {
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

const buildSharedChildMergeFixture = () => {
	const fixture = buildNestedSiblingBasinFixture();
	const basinFeatures = fixture.basinFeatures.map((basin) =>
		basin.id === "b_A1"
			? {
					...basin,
					mergeH: 0.34,
					persistence: 0.18,
				}
			: basin,
	);
	return {
		shape: fixture.shape,
		h: fixture.h,
		basinFeatures,
		tileFeatureIds: fixture.tileFeatureIds,
	};
};

const WETNESS_SWEEP = [0, 0.0001, 0.001, 0.01, 0.1, 0.5, 0.9, 1];
const TEST_EPS = 1e-9;

const createWetnessSweepContext = () => {
	const fixture = buildSharedChildMergeFixture();
	const topologyById = new Map(
		fixture.basinFeatures.map((basin) => [basin.id, basin]),
	);
	const descendantsOf = (basinId) => {
		const out = [];
		const visit = (id) => {
			const basin = topologyById.get(id);
			(basin?.childIds ?? []).forEach((childId) => {
				out.push(childId);
				visit(childId);
			});
		};
		visit(basinId);
		return out;
	};
	const ancestorsOf = (basinId) => {
		const out = [];
		let current = topologyById.get(basinId)?.parentId ?? null;
		while (typeof current === "string" && current.length > 0) {
			out.push(current);
			current = topologyById.get(current)?.parentId ?? null;
		}
		return out;
	};
	const isAncestorOrSame = (ancestorId, basinId) => {
		let current = basinId;
		while (typeof current === "string" && current.length > 0) {
			if (current === ancestorId) {
				return true;
			}
			current = topologyById.get(current)?.parentId ?? null;
		}
		return false;
	};
	const snapshots = WETNESS_SWEEP.map((wetnessScale) => {
		const result = deriveHydrology(
			fixture.shape,
			fixture.h,
			{
				basinFeatures: fixture.basinFeatures,
				tileFeatureIds: fixture.tileFeatureIds,
			},
			{
				hydrology: {
					sinkMode: "strict_local",
					lakeFill: { wetnessScale },
				},
			},
		);
		const tileLakeDepth = Array.from(result.lakeAccounting.tileLakeDepth);
		const tileLakeBasinId = [...result.lakeAccounting.tileLakeBasinId];
		return {
			wetnessScale,
			byId: result.lakeAccounting.byId,
			basins: Array.from(result.lakeAccounting.byId.values()),
			tileLakeDepth,
			tileLakeBasinId,
			totalStandingWater: tileLakeDepth.reduce(
				(sum, depth) => sum + Math.max(0, depth),
				0,
			),
		};
	});
	return {
		fixture,
		topologyById,
		descendantsOf,
		ancestorsOf,
		isAncestorOrSame,
		snapshots,
	};
};

const formatDetails = (details) => JSON.stringify(details, null, 2);

const assertDefined = (value, label, details = {}) => {
	if (value == null) {
		throw new Error(
			`${label} expected a defined value, received ${String(value)}.\n${formatDetails(details)}`,
		);
	}
	return value;
};

const assertFalse = (actual, label, details = {}) => {
	if (actual !== false) {
		throw new Error(
			`${label} expected false, received ${String(actual)}.\n${formatDetails(details)}`,
		);
	}
};

const assertTrue = (actual, label, details = {}) => {
	if (actual !== true) {
		throw new Error(
			`${label} expected true, received ${String(actual)}.\n${formatDetails(details)}`,
		);
	}
};

const assertGreaterThan = (actual, threshold, label, details = {}) => {
	if (!(actual > threshold)) {
		throw new Error(
			`${label} expected > ${threshold}, received ${String(actual)}.\n${formatDetails(details)}`,
		);
	}
};

const assertLessThan = (actual, threshold, label, details = {}) => {
	if (!(actual < threshold)) {
		throw new Error(
			`${label} expected < ${threshold}, received ${String(actual)}.\n${formatDetails(details)}`,
		);
	}
};

const assertCloseTo = (actual, expected, tolerance, label, details = {}) => {
	if (Math.abs(actual - expected) > tolerance) {
		throw new Error(
			`${label} expected ${expected} +/- ${tolerance}, received ${String(actual)}.\n${formatDetails(details)}`,
		);
	}
};

const compareDepthForMonotonicity = (depth) =>
	typeof depth === "number" ? depth : Number.NEGATIVE_INFINITY;

describe("lake accounting from production hydrology pipeline", () => {
	it("ignores out-of-range direct and child basin tileIds in accounting", () => {
		const { shape, h, basinFeatures, tileFeatureIds } =
			buildSyntheticLakeCase();
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
		expect(withOutOfRangeChild.fillRatio).toBeCloseTo(
			baselineChild.fillRatio,
			6,
		);
		expect(withOutOfRangeChild.role).toBe(baselineChild.role);
		expect(withOutOfRangeParent.totalInflow).toBeCloseTo(
			baselineParent.totalInflow,
			6,
		);
	});

	it("keeps deterministic behavior with out-of-range basin tileIds", () => {
		const { shape, h, basinFeatures, tileFeatureIds } =
			buildSyntheticLakeCase();
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
		const { shape, h, basinFeatures, tileFeatureIds } =
			buildSyntheticLakeCase();
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
		assertTrue(result.lakeCoherence.enabled, "lakeCoherence.enabled", {
			basinIds: Array.from(result.lakeAccounting.byId.keys()).sort(),
			lakeTileCount: result.lakeAccounting.lakeTileCount,
		});
		const byId = result.lakeAccounting.byId;
		const child = assertDefined(byId.get("b_child"), "b_child accounting", {
			availableBasinIds: Array.from(byId.keys()).sort(),
		});
		const parent = assertDefined(byId.get("b_parent"), "b_parent accounting", {
			availableBasinIds: Array.from(byId.keys()).sort(),
		});
		expect(child.externalInflow).toBe(1);
		expect(child.totalInflow).toBe(1);
		expect(child.spillCapacity).toBeCloseTo(0.2, 6);
		assertTrue(child.isFilled, "b_child.isFilled", {
			basinId: child.id,
			externalInflow: child.externalInflow,
			totalInflow: child.totalInflow,
			spillCapacity: child.spillCapacity,
			allocatedVolume: child.allocatedVolume,
			fillRatio: child.fillRatio,
			waterSurfaceH: child.waterSurfaceH ?? null,
		});
		expect(child.allocatedVolume).toBeCloseTo(child.spillCapacity, 6);
		expect(child.fillRatio).toBeCloseTo(1, 6);
		expect(child.role).toBe("overflow_carrier");
		expect(child.overflowExcess).toBeCloseTo(0.8, 6);
		expect(parent.externalInflow).toBe(0);
		expect(parent.totalInflow).toBeCloseTo(child.overflowExcess, 6);
	});

	it("keeps the same basin as a sink when wetnessScale is zero", () => {
		const { shape, h, basinFeatures, tileFeatureIds } =
			buildSyntheticLakeCase();
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
		const child = assertDefined(
			result.lakeAccounting.byId.get("b_child"),
			"b_child accounting",
			{
				wetnessScale: 0,
				availableBasinIds: Array.from(result.lakeAccounting.byId.keys()).sort(),
			},
		);
		expect(child.fillRatio).toBe(0);
		assertFalse(child.isFilled, "b_child.isFilled", {
			wetnessScale: 0,
			basinId: child.id,
			fillRatio: child.fillRatio,
			allocatedVolume: child.allocatedVolume,
			spillCapacity: child.spillCapacity,
			waterSurfaceH: child.waterSurfaceH ?? null,
		});
		expect(child.role).toBe("sink");
		expect(child.overflowExcess).toBe(0);
	});

	it("throws when a basin references an unknown child id", () => {
		const { shape, h, basinFeatures, tileFeatureIds } =
			buildSyntheticLakeCase();
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

	it("throws a friendly error when tile self-basin metadata is stale", () => {
		const { shape, h, basinFeatures, tileFeatureIds } =
			buildSyntheticLakeCase();
		const staleTileFeatureIds = tileFeatureIds.map((featureIds) => [
			...featureIds,
		]);
		staleTileFeatureIds[0] = ["b_missing"];

		expect(() =>
			deriveHydrology(
				shape,
				h,
				{ basinFeatures, tileFeatureIds: staleTileFeatureIds },
				{
					hydrology: {
						sinkMode: "strict_local",
						lakeFill: { wetnessScale: 1.0 },
					},
				},
			),
		).toThrow(
			/Tile 0 references self basin "b_missing".*tile featureIds are stale relative to the basin topology/i,
		);
	});

	it("throws on impossible ordinary-root full-map fill state", () => {
		const shape = createGridShape(2, 1);
		const h = new Float32Array([0.9, 1.0]);
		const basinFeatures = [
			makeBasinNode({
				id: "b_root",
				kind: "leaf",
				parentId: null,
				childIds: [],
				birthH: 0.1,
				mergeH: null,
				persistence: 0.1,
				spillOutTileId: null,
				childSpillFromTileId: null,
				parentContactTileId: null,
				minH: 0.1,
				maxH: 0.1,
				size: 1,
				bbox: { minX: 1, minY: 0, maxX: 1, maxY: 0 },
				tileIds: [1],
			}),
		];
		const fdBase = new Uint8Array([DIR8_CODE.e, DIR8_NONE]);
		const faBase = new Uint32Array([1, 1]);

		expect(() =>
			deriveLakeAccounting(shape, h, fdBase, faBase, basinFeatures, {
				wetnessScale: 1,
			}),
		).toThrow(/root basin "b_root" reaches impossible full-map fill state/i);
	});

	it("keeps parent dry at child-connect threshold even with parent external inflow", () => {
		const shape = createGridShape(2, 2);
		const h = new Float32Array([
			0.6,
			0.6, // y=0
			0.1,
			0.2, // y=1
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
		const childCalibration = assertDefined(
			calibration.byId.get("b_child"),
			"b_child calibration accounting",
			{
				wetnessScale: 1,
				availableBasinIds: Array.from(calibration.byId.keys()).sort(),
			},
		);
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
		const childAtConnect = assertDefined(
			atConnect.byId.get("b_child"),
			"b_child accounting at child-connect threshold",
			{
				wetnessScale: kAtConnect,
				availableBasinIds: Array.from(atConnect.byId.keys()).sort(),
			},
		);
		const parentAtConnect = assertDefined(
			atConnect.byId.get("b_parent"),
			"b_parent accounting at child-connect threshold",
			{
				wetnessScale: kAtConnect,
				availableBasinIds: Array.from(atConnect.byId.keys()).sort(),
			},
		);
		assertTrue(childAtConnect.isFilled, "b_child.isFilled", {
			wetnessScale: kAtConnect,
			basinId: childAtConnect.id,
			fillRatio: childAtConnect.fillRatio,
			allocatedVolume: childAtConnect.allocatedVolume,
			spillCapacity: childAtConnect.spillCapacity,
			waterSurfaceH: childAtConnect.waterSurfaceH ?? null,
		});
		expect(parentAtConnect.externalInflow).toBeGreaterThan(0);
		// Child-connect invariant: parent remains dry at the exact threshold.
		expect(parentAtConnect.fillRatio).toBe(0);
	});

	it("starts parent volume from strict excess beyond child-connect threshold", () => {
		const shape = createGridShape(2, 2);
		const h = new Float32Array([
			0.6,
			0.6, // y=0
			0.1,
			0.2, // y=1
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
		const kAboveConnect = kAtConnect + 0.01;
		const out = deriveLakeAccounting(shape, h, fdBase, faBase, basinFeatures, {
			wetnessScale: kAboveConnect,
		});
		const child = out.byId.get("b_child");
		const parent = out.byId.get("b_parent");
		expect(child).toBeDefined();
		expect(parent).toBeDefined();
		const deltaK = kAboveConnect - kAtConnect;
		// In this fixture, parent upward rate is parent external (2) + child external (1).
		const expectedParentV =
			deltaK * (parent.externalInflow + child.externalInflow);
		expect(parent.allocatedVolume).toBeCloseTo(expectedParentV, 6);
		const legacyFullOnsetVolume =
			kAboveConnect * parent.externalInflow + child.overflowExcess;
		expect(parent.allocatedVolume).toBeLessThan(legacyFullOnsetVolume);
		expect(parent.allocatedVolume).toBeGreaterThan(0);
		// Child remains capped at capacity while excess propagates upward.
		expect(child.allocatedVolume).toBeCloseTo(child.spillCapacity, 6);
		expect(parent.totalInflow).toBeCloseTo(
			parent.externalInflow + child.overflowExcess,
			6,
		);
	});

	it("keeps retained basin volume capped while overflow tracks excess", () => {
		const { shape, h, basinFeatures, tileFeatureIds } =
			buildSyntheticLakeCase();
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
		result.lakeAccounting.basins.forEach((basin) => {
			expect(basin.allocatedVolume).toBeGreaterThanOrEqual(0);
			expect(basin.allocatedVolume).toBeLessThanOrEqual(
				basin.spillCapacity + 1e-9,
			);
			expect(basin.fillRatio).toBeGreaterThanOrEqual(0);
			expect(basin.fillRatio).toBeLessThanOrEqual(1 + 1e-9);
			if (basin.spillCapacity > 0) {
				expect(basin.fillRatio).toBeCloseTo(
					basin.allocatedVolume / basin.spillCapacity,
					6,
				);
			}
			if (basin.overflowExcess > 0) {
				expect(basin.allocatedVolume).toBeCloseTo(basin.spillCapacity, 6);
			}
			expect(basin.overflowExcess).toBeGreaterThanOrEqual(0);
		});
	});

	describe("parent basin water-surface invariant", () => {
		it("keeps a dry parent from emitting waterSurfaceH", () => {
			const { shape, h, basinFeatures, tileFeatureIds } =
				buildSharedChildMergeFixture();
			const result = deriveHydrology(
				shape,
				h,
				{ basinFeatures, tileFeatureIds },
				{
					hydrology: {
						sinkMode: "strict_local",
						lakeFill: { wetnessScale: 0.04 },
					},
				},
			);

			const parent = assertDefined(
				result.lakeAccounting.byId.get("b_A"),
				"parent basin b_A",
				{ wetnessScale: 0.04 },
			);
			assertFalse(parent.isFilled, "b_A.isFilled", {
				wetnessScale: 0.04,
				basinId: parent.id,
				fillRatio: parent.fillRatio,
				waterSurfaceH: parent.waterSurfaceH ?? null,
			});
			assertCloseTo(parent.fillRatio, 0, 1e-12, "b_A.fillRatio", {
				wetnessScale: 0.04,
				basinId: parent.id,
				isFilled: parent.isFilled,
				waterSurfaceH: parent.waterSurfaceH ?? null,
			});
			assertFalse("waterSurfaceH" in parent, `"waterSurfaceH" in b_A`, {
				wetnessScale: 0.04,
				basinId: parent.id,
				fillRatio: parent.fillRatio,
				waterSurfaceH: parent.waterSurfaceH ?? null,
			});
		});

		it("keeps a partially filled parent strictly above its immediate-children shared mergeH", () => {
			const { shape, h, basinFeatures, tileFeatureIds } =
				buildSharedChildMergeFixture();
			const result = deriveHydrology(
				shape,
				h,
				{ basinFeatures, tileFeatureIds },
				{
					hydrology: {
						sinkMode: "strict_local",
						lakeFill: { wetnessScale: 0.06 },
					},
				},
			);

			const parent = assertDefined(
				result.lakeAccounting.byId.get("b_A"),
				"parent basin b_A",
				{ wetnessScale: 0.06 },
			);
			assertFalse(parent.isFilled, "b_A.isFilled", {
				wetnessScale: 0.06,
				basinId: parent.id,
				fillRatio: parent.fillRatio,
				waterSurfaceH: parent.waterSurfaceH ?? null,
			});
			assertGreaterThan(parent.waterSurfaceH, 0.34, "b_A.waterSurfaceH", {
				wetnessScale: 0.06,
				basinId: parent.id,
				childSharedMergeH: 0.34,
				mergeH: parent.mergeH,
				fillRatio: parent.fillRatio,
			});
		});

		it("keeps a partially filled parent strictly below its own mergeH", () => {
			const { shape, h, basinFeatures, tileFeatureIds } =
				buildSharedChildMergeFixture();
			const result = deriveHydrology(
				shape,
				h,
				{ basinFeatures, tileFeatureIds },
				{
					hydrology: {
						sinkMode: "strict_local",
						lakeFill: { wetnessScale: 0.06 },
					},
				},
			);

			const parent = assertDefined(
				result.lakeAccounting.byId.get("b_A"),
				"parent basin b_A",
				{ wetnessScale: 0.06 },
			);
			assertFalse(parent.isFilled, "b_A.isFilled", {
				wetnessScale: 0.06,
				basinId: parent.id,
				fillRatio: parent.fillRatio,
				waterSurfaceH: parent.waterSurfaceH ?? null,
			});
			assertLessThan(parent.waterSurfaceH, parent.mergeH, "b_A.waterSurfaceH", {
				wetnessScale: 0.06,
				basinId: parent.id,
				mergeH: parent.mergeH,
				fillRatio: parent.fillRatio,
			});
		});

		it("keeps a fully filled parent equal to its own mergeH", () => {
			const { shape, h, basinFeatures, tileFeatureIds } =
				buildSharedChildMergeFixture();
			const result = deriveHydrology(
				shape,
				h,
				{ basinFeatures, tileFeatureIds },
				{
					hydrology: {
						sinkMode: "strict_local",
						lakeFill: { wetnessScale: 0.11 },
					},
				},
			);

			const parent = assertDefined(
				result.lakeAccounting.byId.get("b_A"),
				"parent basin b_A",
				{ wetnessScale: 0.11 },
			);
			assertTrue(parent.isFilled, "b_A.isFilled", {
				wetnessScale: 0.11,
				basinId: parent.id,
				fillRatio: parent.fillRatio,
				waterSurfaceH: parent.waterSurfaceH ?? null,
				mergeH: parent.mergeH,
			});
			assertCloseTo(
				parent.waterSurfaceH,
				parent.mergeH,
				1e-6,
				"b_A.waterSurfaceH",
				{
					wetnessScale: 0.11,
					basinId: parent.id,
					isFilled: parent.isFilled,
					fillRatio: parent.fillRatio,
				},
			);
		});
	});

	describe("wetnessScale sweep invariants", () => {
		it("never lets a parent basin begin filling before all immediate children are full", () => {
			const { snapshots } = createWetnessSweepContext();
			const violations = [];

			snapshots.forEach(({ wetnessScale, basins, byId }) => {
				basins
					.filter((basin) => basin.childIds.length > 0)
					.forEach((basin) => {
						const unfilledChildren = basin.childIds.filter(
							(childId) => byId.get(childId)?.isFilled !== true,
						);
						if (
							basin.allocatedVolume > TEST_EPS &&
							unfilledChildren.length > 0
						) {
							violations.push({
								wetnessScale,
								basinId: basin.id,
								unfilledChildren,
							});
						}
					});
			});

			expect(violations).toEqual([]);
		});

		it("keeps dry and fully filled basin surface states consistent across the sweep", () => {
			const { snapshots } = createWetnessSweepContext();
			const dryViolations = [];
			const fullViolations = [];

			snapshots.forEach(({ wetnessScale, basins }) => {
				basins.forEach((basin) => {
					if (basin.allocatedVolume <= TEST_EPS && "waterSurfaceH" in basin) {
						dryViolations.push({
							wetnessScale,
							basinId: basin.id,
							waterSurfaceH: basin.waterSurfaceH,
						});
					}
					if (
						basin.isFilled &&
						typeof basin.mergeH === "number" &&
						Math.abs((basin.waterSurfaceH ?? Number.NaN) - basin.mergeH) > 1e-6
					) {
						fullViolations.push({
							wetnessScale,
							basinId: basin.id,
							waterSurfaceH: basin.waterSurfaceH,
							mergeH: basin.mergeH,
						});
					}
				});
			});

			expect(dryViolations).toEqual([]);
			expect(fullViolations).toEqual([]);
		});

		it("omits tile waterDepth when no governing basin is resolved", () => {
			const { snapshots } = createWetnessSweepContext();
			const snapshot = assertDefined(
				snapshots.find(({ wetnessScale }) => wetnessScale === 0.01),
				"wetness sweep snapshot",
				{ requestedWetnessScale: 0.01 },
			);
			const tileId = 0;
			const governingBasinId = snapshot.tileLakeBasinId[tileId];
			expect(governingBasinId).toBe("");
			expect(snapshot.tileLakeDepth[tileId]).toBeUndefined();
		});

		it("keeps governed zero-or-nonzero depth distinct from absent depth", () => {
			const { snapshots } = createWetnessSweepContext();
			const snapshot = assertDefined(
				snapshots.find(({ wetnessScale }) => wetnessScale === 0.01),
				"wetness sweep snapshot",
				{ requestedWetnessScale: 0.01 },
			);
			const unguidedTileId = 0;
			const governedTileId = 16;
			expect(snapshot.tileLakeBasinId[unguidedTileId]).toBe("");
			expect(snapshot.tileLakeDepth[unguidedTileId]).toBeUndefined();
			expect(snapshot.tileLakeBasinId[governedTileId]).toBe("b_A1");
			expect(snapshot.tileLakeDepth[governedTileId]).toBeTypeOf("number");
		});

		it("keeps the partially filled shared-child parent strictly between child mergeH and its own mergeH", () => {
			const { shape, h, basinFeatures, tileFeatureIds } =
				buildSharedChildMergeFixture();
			const result = deriveHydrology(
				shape,
				h,
				{ basinFeatures, tileFeatureIds },
				{
					hydrology: {
						sinkMode: "strict_local",
						lakeFill: { wetnessScale: 0.06 },
					},
				},
			);

			const parent = assertDefined(
				result.lakeAccounting.byId.get("b_A"),
				"parent basin b_A",
				{ wetnessScale: 0.06 },
			);
			assertFalse(parent.isFilled, "b_A.isFilled", {
				wetnessScale: 0.06,
				basinId: parent.id,
				fillRatio: parent.fillRatio,
				waterSurfaceH: parent.waterSurfaceH ?? null,
			});
			assertGreaterThan(parent.waterSurfaceH, 0.34, "b_A.waterSurfaceH", {
				wetnessScale: 0.06,
				basinId: parent.id,
				childSharedMergeH: 0.34,
				mergeH: parent.mergeH,
				fillRatio: parent.fillRatio,
			});
			assertLessThan(parent.waterSurfaceH, parent.mergeH, "b_A.waterSurfaceH", {
				wetnessScale: 0.06,
				basinId: parent.id,
				childSharedMergeH: 0.34,
				mergeH: parent.mergeH,
				fillRatio: parent.fillRatio,
			});
		});

		it("keeps partially filled basins above only fully filled lower basins and below dry higher basins", () => {
			const { snapshots, descendantsOf, ancestorsOf } =
				createWetnessSweepContext();
			const descendantViolations = [];
			const ancestorViolations = [];

			snapshots.forEach(({ wetnessScale, byId, basins }) => {
				basins
					.filter(
						(basin) =>
							typeof basin.waterSurfaceH === "number" &&
							basin.isFilled === false,
					)
					.forEach((basin) => {
						descendantsOf(basin.id).forEach((descendantId) => {
							const descendant = byId.get(descendantId);
							if (
								descendant &&
								typeof descendant.waterSurfaceH === "number" &&
								descendant.isFilled !== true
							) {
								descendantViolations.push({
									wetnessScale,
									basinId: basin.id,
									descendantId,
									descendantFillRatio: descendant.fillRatio,
								});
							}
						});
						ancestorsOf(basin.id).forEach((ancestorId) => {
							const ancestor = byId.get(ancestorId);
							if (
								ancestor &&
								(typeof ancestor.waterSurfaceH === "number" ||
									ancestor.allocatedVolume > TEST_EPS)
							) {
								ancestorViolations.push({
									wetnessScale,
									basinId: basin.id,
									ancestorId,
									ancestorFillRatio: ancestor.fillRatio,
									ancestorWaterSurfaceH: ancestor.waterSurfaceH,
								});
							}
						});
					});
			});

			expect(descendantViolations).toEqual([]);
			expect(ancestorViolations).toEqual([]);
		});

		it("never lets an ancestor water surface fall below a wet descendant on the same chain", () => {
			const { snapshots, ancestorsOf } = createWetnessSweepContext();
			const violations = [];

			snapshots.forEach(({ wetnessScale, byId, basins }) => {
				basins.forEach((basin) => {
					if (typeof basin.waterSurfaceH !== "number") {
						return;
					}
					ancestorsOf(basin.id).forEach((ancestorId) => {
						const ancestor = byId.get(ancestorId);
						if (
							ancestor &&
							typeof ancestor.waterSurfaceH === "number" &&
							ancestor.waterSurfaceH + TEST_EPS < basin.waterSurfaceH
						) {
							violations.push({
								wetnessScale,
								basinId: basin.id,
								basinWaterSurfaceH: basin.waterSurfaceH,
								ancestorId,
								ancestorWaterSurfaceH: ancestor.waterSurfaceH,
							});
						}
					});
				});
			});

			expect(violations).toEqual([]);
		});

		it("keeps basin wetness, surface heights, and filled states monotonic across the sweep", () => {
			const { snapshots, topologyById } = createWetnessSweepContext();
			const surfaceViolations = [];
			const wetViolations = [];
			const filledViolations = [];

			Array.from(topologyById.keys()).forEach((basinId) => {
				for (let i = 1; i < snapshots.length; i += 1) {
					const previous = snapshots[i - 1];
					const current = snapshots[i];
					const prevBasin = previous.byId.get(basinId);
					const currBasin = current.byId.get(basinId);
					const prevSurface = prevBasin?.waterSurfaceH;
					const currSurface = currBasin?.waterSurfaceH;

					if (
						typeof prevSurface === "number" &&
						typeof currSurface === "number" &&
						currSurface + TEST_EPS < prevSurface
					) {
						surfaceViolations.push({
							basinId,
							fromWetnessScale: previous.wetnessScale,
							toWetnessScale: current.wetnessScale,
							fromSurface: prevSurface,
							toSurface: currSurface,
						});
					}
					if (
						typeof prevSurface === "number" &&
						typeof currSurface !== "number"
					) {
						wetViolations.push({
							basinId,
							fromWetnessScale: previous.wetnessScale,
							toWetnessScale: current.wetnessScale,
						});
					}
					if (prevBasin?.isFilled === true && currBasin?.isFilled !== true) {
						filledViolations.push({
							basinId,
							fromWetnessScale: previous.wetnessScale,
							toWetnessScale: current.wetnessScale,
						});
					}
				}
			});

			expect(surfaceViolations).toEqual([]);
			expect(wetViolations).toEqual([]);
			expect(filledViolations).toEqual([]);
		});

		it("only moves tile governing basins upward on the self-to-root chain", () => {
			const { snapshots, isAncestorOrSame, fixture } =
				createWetnessSweepContext();
			const violations = [];

			for (let i = 1; i < snapshots.length; i += 1) {
				const previous = snapshots[i - 1];
				const current = snapshots[i];
				for (let tileId = 0; tileId < fixture.shape.size; tileId += 1) {
					const prevBasinId = previous.tileLakeBasinId[tileId] ?? "";
					const currBasinId = current.tileLakeBasinId[tileId] ?? "";
					if (
						prevBasinId === "" ||
						currBasinId === "" ||
						prevBasinId === currBasinId
					) {
						continue;
					}
					if (!isAncestorOrSame(currBasinId, prevBasinId)) {
						violations.push({
							tileId,
							fromWetnessScale: previous.wetnessScale,
							toWetnessScale: current.wetnessScale,
							fromBasinId: prevBasinId,
							toBasinId: currBasinId,
						});
					}
				}
			}

			expect(violations).toEqual([]);
		});

		it("keeps tile water depth, wet-tile set, and total standing water nondecreasing", () => {
			const { snapshots, fixture } = createWetnessSweepContext();
			const depthViolations = [];
			const wetSetViolations = [];
			const totalViolations = [];

			for (let i = 1; i < snapshots.length; i += 1) {
				const previous = snapshots[i - 1];
				const current = snapshots[i];
				for (let tileId = 0; tileId < fixture.shape.size; tileId += 1) {
					const prevDepth = compareDepthForMonotonicity(
						previous.tileLakeDepth[tileId],
					);
					const currDepth = compareDepthForMonotonicity(
						current.tileLakeDepth[tileId],
					);
					if (currDepth + TEST_EPS < prevDepth) {
						depthViolations.push({
							tileId,
							fromWetnessScale: previous.wetnessScale,
							toWetnessScale: current.wetnessScale,
							fromDepth: prevDepth,
							toDepth: currDepth,
						});
					}
					if (prevDepth > TEST_EPS && currDepth <= TEST_EPS) {
						wetSetViolations.push({
							tileId,
							fromWetnessScale: previous.wetnessScale,
							toWetnessScale: current.wetnessScale,
						});
					}
				}
				if (
					current.totalStandingWater + TEST_EPS <
					previous.totalStandingWater
				) {
					totalViolations.push({
						fromWetnessScale: previous.wetnessScale,
						toWetnessScale: current.wetnessScale,
						fromTotalStandingWater: previous.totalStandingWater,
						toTotalStandingWater: current.totalStandingWater,
					});
				}
			}

			expect(depthViolations).toEqual([]);
			expect(wetSetViolations).toEqual([]);
			expect(totalViolations).toEqual([]);
		});
	});
});
