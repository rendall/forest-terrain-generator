import { afterEach, describe, expect, it, vi } from "vitest";
import {
	DIRECTION8_DELTAS,
	DIRECTION8_ORDER,
} from "../../src/domain/passages.js";
import { createGridShape } from "../../src/domain/topography.js";
import {
	derivePassages,
	evaluatePassageBlockReason,
	getNeighborTile,
	PASSAGE_MAX_DROP_DOWN,
	PASSAGE_MAX_STEP_UP,
} from "../../src/pipeline/derive-passages.js";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("derive-passages scaffolding", () => {
	it("exports stable 8-direction ordering and geometry deltas", () => {
		expect(DIRECTION8_ORDER).toEqual(["E", "SE", "S", "SW", "W", "NW", "N", "NE"]);
		expect(DIRECTION8_DELTAS.N).toEqual({ dx: 0, dy: -1 });
		expect(DIRECTION8_DELTAS.SE).toEqual({ dx: 1, dy: 1 });
		expect(PASSAGE_MAX_STEP_UP).toBe(0.05);
		expect(PASSAGE_MAX_DROP_DOWN).toBe(0.05);
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
		const h = new Float32Array([0.2, 0.2 + PASSAGE_MAX_STEP_UP + 0.001]);
		const passages = derivePassages(shape, h);
		expect(passages[0]).toEqual({
			E: "elevation_up_too_steep",
			SE: "out_of_bounds",
			S: "out_of_bounds",
			SW: "out_of_bounds",
			W: "out_of_bounds",
			NW: "out_of_bounds",
			N: "out_of_bounds",
			NE: "out_of_bounds",
		});
		expect(passages[1]).toEqual({
			E: "out_of_bounds",
			SE: "out_of_bounds",
			S: "out_of_bounds",
			SW: "out_of_bounds",
			W: "elevation_down_too_far",
			NW: "out_of_bounds",
			N: "out_of_bounds",
			NE: "out_of_bounds",
		});
	});

	it("keeps out_of_bounds reasons when another direction is blocked", () => {
		const shape = createGridShape(2, 1);
		const h = new Float32Array([0.2, 0.2 + PASSAGE_MAX_STEP_UP + 0.001]);
		const passages = derivePassages(shape, h);
		expect(passages[0]).toEqual({
			E: "elevation_up_too_steep",
			SE: "out_of_bounds",
			S: "out_of_bounds",
			SW: "out_of_bounds",
			W: "out_of_bounds",
			NW: "out_of_bounds",
			N: "out_of_bounds",
			NE: "out_of_bounds",
		});
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

	it("returns the correct neighboring tile for in-bounds directions", () => {
		const tiles = [
			{ index: 0, x: 0, y: 0, topography: { h: 0 } },
			{ index: 1, x: 1, y: 0, topography: { h: 0 } },
			{ index: 2, x: 2, y: 0, topography: { h: 0 } },
			{ index: 3, x: 0, y: 1, topography: { h: 0 } },
			{ index: 4, x: 1, y: 1, topography: { h: 0 } },
			{ index: 5, x: 2, y: 1, topography: { h: 0 } },
			{ index: 6, x: 0, y: 2, topography: { h: 0 } },
			{ index: 7, x: 1, y: 2, topography: { h: 0 } },
			{ index: 8, x: 2, y: 2, topography: { h: 0 } },
		];

		expect(getNeighborTile(tiles[4], "E", tiles)?.index).toBe(5);
		expect(getNeighborTile(tiles[4], "NE", tiles)?.index).toBe(2);
		expect(getNeighborTile(tiles[4], "SW", tiles)?.index).toBe(6);
	});

	it("returns null for out-of-bounds neighboring tiles", () => {
		const tiles = [
			{ index: 0, x: 0, y: 0, topography: { h: 0 } },
			{ index: 1, x: 1, y: 0, topography: { h: 0 } },
			{ index: 2, x: 0, y: 1, topography: { h: 0 } },
			{ index: 3, x: 1, y: 1, topography: { h: 0 } },
		];

		expect(getNeighborTile(tiles[0], "N", tiles)).toBeNull();
		expect(getNeighborTile(tiles[0], "NW", tiles)).toBeNull();
		expect(getNeighborTile(tiles[1], "NE", tiles)).toBeNull();
	});

	it("resolves neighbors without scanning the full tile array", () => {
		vi.spyOn(Array.prototype, "find").mockImplementation(() => {
			throw new Error("derivePassages must not use Array.prototype.find for neighbor lookup");
		});

		const shape = createGridShape(2, 2);
		const h = new Float32Array([0, 0.2, 0.1, 0.3]);

		expect(() => derivePassages(shape, h)).not.toThrow();
	});

});
