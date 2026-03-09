import { describe, expect, it } from "vitest";
import {
	DIRECTION8_DELTAS,
	DIRECTION8_ORDER,
} from "../../src/domain/passages.js";
import { createGridShape } from "../../src/domain/topography.js";
import {
	derivePassages,
	evaluatePassageBlockReason,
	PASSAGE_MAX_DROP_DOWN,
	PASSAGE_MAX_STEP_UP,
} from "../../src/pipeline/derive-passages.js";

describe("derive-passages scaffolding", () => {
	it("exports stable 8-direction ordering and geometry deltas", () => {
		expect(DIRECTION8_ORDER).toEqual(["E", "SE", "S", "SW", "W", "NW", "N", "NE"]);
		expect(DIRECTION8_DELTAS.N).toEqual({ dx: 0, dy: -1 });
		expect(DIRECTION8_DELTAS.SE).toEqual({ dx: 1, dy: 1 });
		expect(PASSAGE_MAX_STEP_UP).toBe(0.002);
		expect(PASSAGE_MAX_DROP_DOWN).toBe(0.003);
	});

	it("blocks out-of-bounds directions", () => {
		const shape = createGridShape(2, 2);
		const h = new Float32Array([0, 0, 0, 0]);
		const reason = evaluatePassageBlockReason({
			shape,
			h,
			tileIndex: 0,
			direction: "N",
		});
		expect(reason).toBe("out_of_bounds");
	});

	it("derives asymmetric elevation-blocking reasons", () => {
		const shape = createGridShape(2, 1);
		const h = new Float32Array([0.2, 0.204]);
		const passages = derivePassages(shape, h);
		expect(passages[0]).toEqual({ E: "elevation_up_too_steep" });
		expect(passages[1]).toEqual({ W: "elevation_down_too_far" });
	});
	it("includes out_of_bounds reasons in tile passages output", () => {
		const shape = createGridShape(1, 1);
		const h = new Float32Array([0.2]);
		const passages = derivePassages(shape, h);
		expect(passages[0]).toEqual({
			E: "out_of_bounds",
			SE: "out_of_bounds",
			S: "out_of_bounds",
			SW: "out_of_bounds",
			W: "out_of_bounds",
			NW: "out_of_bounds",
			N: "out_of_bounds",
			NE: "out_of_bounds",
		});
	});

});
