import { describe, expect, it } from "vitest";
import { DIR8_CODE, DIR8_NONE } from "../../src/domain/hydrology.js";
import { createGridShape } from "../../src/domain/topography.js";
import { deriveLakeAccounting } from "../../src/pipeline/derive-lake-accounting.js";
import { makeBasinNode } from "./helpers/lake-fixtures.mjs";

const submergedStorage = (surfaceH, tileHeights) =>
	tileHeights.reduce((sum, h) => sum + Math.max(0, surfaceH - h), 0);

describe("lake accounting basin waterSurfaceH", () => {
	it("emits basin-level dry, partial, and full-to-spill surface states", () => {
		const shape = createGridShape(2, 1);
		const h = new Float32Array([0.9, 0.1]);
		const fdBase = new Uint8Array([DIR8_CODE.e, DIR8_NONE]);
		const faBase = new Uint32Array([1, 2]);
		const basinFeatures = [
			makeBasinNode({
				id: "b_sink",
				kind: "leaf",
				parentId: null,
				childIds: [],
				birthH: 0.1,
				mergeH: 0.5,
				persistence: 0.4,
				spillOutTileId: null,
				minH: 0.1,
				maxH: 0.1,
				size: 1,
				bbox: { minX: 1, minY: 0, maxX: 1, maxY: 0 },
				tileIds: [1],
			}),
		];
		const run = (wetnessScale) =>
			deriveLakeAccounting(shape, h, fdBase, faBase, basinFeatures, {
				wetnessScale,
			}).byId.get("b_sink");

		const dry = run(0);
		expect(dry).toBeDefined();
		expect(Object.hasOwn(dry, "waterSurfaceH")).toBe(false);
		expect(dry.isFilled).toBe(false);

		const partial = run(0.2);
		expect(partial).toBeDefined();
		expect(partial.isFilled).toBe(false);
		expect(partial.waterSurfaceH).toBeCloseTo(0.3, 6);
		expect(submergedStorage(partial.waterSurfaceH, [0.1])).toBeCloseTo(0.2, 6);

		const full = run(0.4);
		expect(full).toBeDefined();
		expect(full.isFilled).toBe(true);
		expect(full.waterSurfaceH).toBeCloseTo(0.5, 6);
	});

	it("solves partial basin waterSurfaceH over piecewise storage slopes", () => {
		const shape = createGridShape(3, 1);
		const h = new Float32Array([0.9, 0.1, 0.4]);
		const fdBase = new Uint8Array([DIR8_CODE.e, DIR8_NONE, DIR8_NONE]);
		const faBase = new Uint32Array([1, 2, 1]);
		const basinFeatures = [
			makeBasinNode({
				id: "b_piecewise",
				kind: "leaf",
				parentId: null,
				childIds: [],
				birthH: 0.1,
				mergeH: 0.6,
				persistence: 0.5,
				spillOutTileId: null,
				minH: 0.1,
				maxH: 0.4,
				size: 2,
				bbox: { minX: 1, minY: 0, maxX: 2, maxY: 0 },
				tileIds: [1, 2],
			}),
		];
		const out = deriveLakeAccounting(shape, h, fdBase, faBase, basinFeatures, {
			wetnessScale: 0.35,
		});
		const basin = out.byId.get("b_piecewise");
		expect(basin).toBeDefined();
		expect(basin.isFilled).toBe(false);
		expect(basin.waterSurfaceH).toBeCloseTo(0.425, 6);
		expect(submergedStorage(basin.waterSurfaceH, [0.1, 0.4])).toBeCloseTo(
			0.35,
			6,
		);
		expect(basin.waterSurfaceH).toBeLessThan(0.6);
	});
});
