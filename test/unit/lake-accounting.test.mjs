import { describe, expect, it } from "vitest";
import { computeBasinAccounting } from "./helpers/lake-fixtures.mjs";

describe("lake accounting synthetic fixtures", () => {
	it("LA-01 closed_bowl_dry_sink", () => {
		const accounting = computeBasinAccounting([
			{
				id: "b0",
				parentId: null,
				externalInflow: 0,
				spillCapacity: 1.5,
			},
		]);
		const b0 = accounting.get("b0");
		expect(b0.totalInflow).toBe(0);
		expect(b0.fillRatio).toBe(0);
		expect(b0.isFilled).toBe(false);
		expect(b0.overflowExcess).toBe(0);
	});

	it("LA-02 closed_bowl_wet_terminal_root", () => {
		const accounting = computeBasinAccounting([
			{
				id: "b0",
				parentId: null,
				externalInflow: 2.0,
				spillCapacity: 1.7,
			},
		]);
		const b0 = accounting.get("b0");
		expect(b0.totalInflow).toBeCloseTo(2.0, 6);
		expect(b0.isFilled).toBe(true);
		expect(b0.overflowExcess).toBeCloseTo(0.3, 6);
		expect(b0.parentId).toBeNull();
	});

	it("LA-03 leaf_fills_and_overflows_to_parent", () => {
		const accounting = computeBasinAccounting([
			{
				id: "b_parent",
				parentId: null,
				externalInflow: 0.1,
				spillCapacity: 1.2,
			},
			{
				id: "b_leaf",
				parentId: "b_parent",
				externalInflow: 1.2,
				spillCapacity: 1.0,
			},
		]);
		const leaf = accounting.get("b_leaf");
		const parent = accounting.get("b_parent");
		expect(leaf.overflowExcess).toBeCloseTo(0.2, 6);
		expect(parent.totalInflow).toBeCloseTo(0.3, 6);
		expect(parent.isFilled).toBe(false);
	});

	it("LA-04 leaf_not_filled_stays_sink", () => {
		const accounting = computeBasinAccounting([
			{
				id: "b_parent",
				parentId: null,
				externalInflow: 0.1,
				spillCapacity: 1.2,
			},
			{
				id: "b_leaf",
				parentId: "b_parent",
				externalInflow: 0.7,
				spillCapacity: 1.0,
			},
		]);
		const leaf = accounting.get("b_leaf");
		const parent = accounting.get("b_parent");
		expect(leaf.isFilled).toBe(false);
		expect(leaf.overflowExcess).toBe(0);
		expect(parent.totalInflow).toBeCloseTo(parent.externalInflow, 6);
	});

	it("LA-05 parent_double_count_guard", () => {
		const accounting = computeBasinAccounting([
			{
				id: "b_parent",
				parentId: null,
				externalInflow: 0.5,
				spillCapacity: 2.0,
			},
			{
				id: "b_a",
				parentId: "b_parent",
				externalInflow: 1.7,
				spillCapacity: 1.0, // overflowExcess=0.7
			},
			{
				id: "b_b",
				parentId: "b_parent",
				externalInflow: 1.2,
				spillCapacity: 1.0, // overflowExcess=0.2
			},
		]);
		const parent = accounting.get("b_parent");
		expect(parent.totalInflow).toBeCloseTo(1.4, 6);
		expect(parent.totalInflow).not.toBeCloseTo(2.3, 6);
	});
});
