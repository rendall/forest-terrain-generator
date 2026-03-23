import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";
import { DIR8_CODE } from "../../src/domain/hydrology.js";
import { deriveHydrology } from "../../src/pipeline/derive-hydrology.js";
import { makeBasinNode } from "../unit/helpers/lake-fixtures.mjs";

describe("lake synthetic basin integration smoke", () => {
	it("routes overflow only through childSpillFrom -> parentContact and not spillOutTileId", () => {
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
		const out = deriveHydrology(
			shape,
			h,
			{ basinFeatures, tileFeatureIds },
			{
				hydrology: {
					sinkMode: "overflow_guided",
					lakeFill: { wetnessScale: 1.0 },
					faThreshold: 1,
				},
			},
		);

		expect(out.lakeAccounting.byId.get("b_child")?.role).toBe(
			"overflow_carrier",
		);
		expect(out.maps.fd[0]).toBe(DIR8_CODE.e);
		expect(out.diagnostics.overflowAppliedCount).toBe(1);
	});
});
