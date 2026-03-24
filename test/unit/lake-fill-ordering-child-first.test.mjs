import { describe, expect, it } from "vitest";
import { deriveHydrology } from "../../src/pipeline/derive-hydrology.js";
import { buildNestedSiblingBasinFixture } from "./helpers/lake-fixtures.mjs";

const run = (k) => {
	const fixture = buildNestedSiblingBasinFixture();
	return deriveHydrology(
		fixture.shape,
		fixture.h,
		{
			basinFeatures: fixture.basinFeatures,
			tileFeatureIds: fixture.tileFeatureIds,
		},
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

	it("keeps root dry at the exact direct-child connect threshold", () => {
		const calibration = run(1);
		const byId = calibration.lakeAccounting.byId;
		const a1 = byId.get("b_A1");
		const a2 = byId.get("b_A2");
		const a = byId.get("b_A");
		const b = byId.get("b_B");
		expect(a1).toBeDefined();
		expect(a2).toBeDefined();
		expect(a).toBeDefined();
		expect(b).toBeDefined();

		const a1SpillWetness = a1.spillCapacity / a1.totalInflow;
		const a2SpillWetness = a2.spillCapacity / a2.totalInflow;
		const aGateOpenWetness = Math.max(a1SpillWetness, a2SpillWetness);
		const aUpwardRate = a.externalInflow + a1.totalInflow + a2.totalInflow;
		const aSpillWetness = aGateOpenWetness + a.spillCapacity / aUpwardRate;
		const bSpillWetness = b.spillCapacity / b.totalInflow;
		const rootConnectWetness = Math.max(aSpillWetness, bSpillWetness);

		const out = run(rootConnectWetness);
		const root = out.lakeAccounting.byId.get("b_root");
		expect(out.lakeAccounting.byId.get("b_A")?.isFilled).toBe(true);
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
