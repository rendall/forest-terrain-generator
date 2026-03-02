import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";
import { deriveHydrology } from "../../src/pipeline/derive-hydrology.js";
import {
	computeBasinAccounting,
	computeExternalInflowFromMaps,
} from "../unit/helpers/lake-fixtures.mjs";

const emptyStructure = (size) => ({
	basinFeatures: [],
	tileFeatureIds: Array.from({ length: size }, () => []),
});

describe("lake synthetic basin integration smoke", () => {
	it("computes externalInflow from strict_local FD/FA and applies totalInflow accounting contract", () => {
		const shape = createGridShape(3, 1);
		const h = new Float32Array([0.9, 0.5, 0.1]);
		const hydrology = deriveHydrology(shape, h, emptyStructure(shape.size), {
			hydrology: { sinkMode: "strict_local" },
		});

		const basinTileSets = new Map([
			["b_child", new Set([2])],
			["b_parent", new Set([1, 2])],
		]);
		const inflow = computeExternalInflowFromMaps(
			shape,
			hydrology.maps.fd,
			hydrology.maps.fa,
			basinTileSets,
		);

		const accounting = computeBasinAccounting([
			{
				id: "b_parent",
				parentId: null,
				externalInflow: inflow.get("b_parent") ?? 0,
				spillCapacity: 1.5,
			},
			{
				id: "b_child",
				parentId: "b_parent",
				externalInflow: inflow.get("b_child") ?? 0,
				spillCapacity: 1.0,
			},
		]);

		const child = accounting.get("b_child");
		const parent = accounting.get("b_parent");

		expect(child.externalInflow).toBe(2);
		expect(child.overflowExcess).toBe(1);
		expect(parent.externalInflow).toBe(1);
		expect(parent.totalInflow).toBeCloseTo(
			parent.externalInflow + child.overflowExcess,
			6,
		);
		expect(parent.totalInflow).toBeCloseTo(2, 6);
		expect(parent.isFilled).toBe(true);
		expect(parent.overflowExcess).toBeCloseTo(0.5, 6);
	});
});
