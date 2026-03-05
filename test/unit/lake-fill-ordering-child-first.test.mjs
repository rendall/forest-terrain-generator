import { describe, expect, it } from "vitest";
import { deriveHydrology } from "../../src/pipeline/derive-hydrology.js";
import { buildNestedSiblingBasinFixture } from "./helpers/lake-fixtures.mjs";

const run = (k) => {
	const fixture = buildNestedSiblingBasinFixture();
	return deriveHydrology(
		fixture.shape,
		fixture.h,
		{ basinFeatures: fixture.basinFeatures, tileFeatureIds: fixture.tileFeatureIds },
		{
			hydrology: {
				sinkMode: "strict_local",
				lakeFill: { wetnessScale: k },
			},
		},
	);
};

describe("lake fill ordering child-first invariant", () => {
	it("blocks parent fill when any direct child is not filled", () => {
		const out = run(0.01);
		const a = out.lakeAccounting.byId.get("b_A");
		const root = out.lakeAccounting.byId.get("b_root");
		expect(a).toBeDefined();
		expect(root).toBeDefined();
		expect(out.lakeAccounting.byId.get("b_A1")?.isFilled).toBe(false);
		expect(out.lakeAccounting.byId.get("b_A2")?.isFilled).toBe(false);
		expect(a.fillRatio).toBe(0);
		expect(a.isFilled).toBe(false);
		expect(root.fillRatio).toBe(0);
		expect(root.isFilled).toBe(false);
	});

	it("unlocks parent fill once all direct children are filled", () => {
		const out = run(0.5);
		const a = out.lakeAccounting.byId.get("b_A");
		expect(out.lakeAccounting.byId.get("b_A1")?.isFilled).toBe(true);
		expect(out.lakeAccounting.byId.get("b_A2")?.isFilled).toBe(true);
		expect(a.fillRatio).toBeGreaterThan(0);
		expect(a.isFilled).toBe(true);
	});

	it("keeps mixed direct-child states blocked on root until gate opens", () => {
		const out = run(0.1);
		const root = out.lakeAccounting.byId.get("b_root");
		expect(out.lakeAccounting.byId.get("b_A")?.isFilled).toBe(false);
		expect(out.lakeAccounting.byId.get("b_B")?.isFilled).toBe(true);
		expect(root.fillRatio).toBe(0);
		expect(root.isFilled).toBe(false);
	});

	it("preserves overflow propagation after gate-open transitions", () => {
		const out = run(1);
		const byId = out.lakeAccounting.byId;
		const a = byId.get("b_A");
		const root = byId.get("b_root");
		const aChildOverflow = a.childIds.reduce(
			(sum, childId) => sum + (byId.get(childId)?.overflowExcess ?? 0),
			0,
		);
		expect(a.totalInflow).toBeCloseTo(a.externalInflow + aChildOverflow, 6);
		expect(root.fillRatio).toBeGreaterThan(0);
	});
});
