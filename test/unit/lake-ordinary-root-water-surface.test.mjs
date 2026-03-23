import { describe, expect, it } from "vitest";
import { deriveHydrology } from "../../src/pipeline/derive-hydrology.js";
import { buildNestedSiblingBasinFixture } from "./helpers/lake-fixtures.mjs";

const PARTIAL_ROOT_WETNESS_SCALE = 0.15;

const run = (wetnessScale) => {
	const fixture = buildNestedSiblingBasinFixture();
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
	return { fixture, result };
};

describe("ordinary root basin partial-wetting invariants", () => {
	it("does not emit waterSurfaceH for an ordinary root during partial wetting", () => {
		const { result } = run(PARTIAL_ROOT_WETNESS_SCALE);
		const root = result.lakeAccounting.byId.get("b_root");

		expect(root).toBeDefined();
		expect(root.fillRatio).toBeGreaterThan(0);
		expect(root.isFilled).toBe(false);
		expect(root.waterSurfaceH).toBeUndefined();
	});

	it("does not let an ordinary root govern the full map during partial wetting", () => {
		const { fixture, result } = run(PARTIAL_ROOT_WETNESS_SCALE);
		const root = result.lakeAccounting.byId.get("b_root");
		const governedByRoot = result.lakeAccounting.tileLakeBasinId.filter(
			(basinId) => basinId === "b_root",
		).length;

		expect(root).toBeDefined();
		expect(root.fillRatio).toBeGreaterThan(0);
		expect(root.isFilled).toBe(false);
		expect(governedByRoot).toBeLessThan(fixture.shape.size);
	});
});
