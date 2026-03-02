import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";
import { DIR8_CODE, DIR8_NONE } from "../../src/domain/hydrology.js";
import { deriveHydrology } from "../../src/pipeline/derive-hydrology.js";
import { computeExternalInflowFromMaps } from "./helpers/lake-fixtures.mjs";

const emptyStructure = (size) => ({
	basinFeatures: [],
	tileFeatureIds: Array.from({ length: size }, () => []),
});

describe("lake external inflow boundary accounting", () => {
	it("LB-01 outside_of_tiles_boundary_rule", () => {
		const shape = createGridShape(3, 1);
		const h = new Float32Array([0.9, 0.5, 0.1]);
		const out = deriveHydrology(shape, h, emptyStructure(shape.size), {});

		expect(out.maps.fd[0]).toBe(DIR8_CODE.e);
		expect(out.maps.fd[1]).toBe(DIR8_CODE.e);
		expect(out.maps.fd[2]).toBe(DIR8_NONE);
		expect(out.maps.fa[1]).toBe(2);

		const inflow = computeExternalInflowFromMaps(
			shape,
			out.maps.fd,
			out.maps.fa,
			new Map([["B", new Set([2])]]),
		);

		expect(inflow.get("B")).toBe(2);
	});

	it("LB-02 child_to_parent_crossing_not_external", () => {
		const shape = createGridShape(3, 1);
		const h = new Float32Array([0.9, 0.5, 0.1]);
		const out = deriveHydrology(shape, h, emptyStructure(shape.size), {});

		const inflow = computeExternalInflowFromMaps(
			shape,
			out.maps.fd,
			out.maps.fa,
			new Map([
				["child", new Set([1])],
				["parent", new Set([1, 2])],
			]),
		);

		expect(inflow.get("child")).toBe(1); // 0->1
		expect(inflow.get("parent")).toBe(1); // 0->1 only; 1->2 is internal to {1,2}
	});
});
