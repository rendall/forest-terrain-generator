import { describe, expect, it } from "vitest";
import { validateReplayTopographyGrid } from "../../src/lib/validate-replay-tiles.js";

describe("validateReplayTopographyGrid allocation bounds", () => {
	it("fails fast when replay grid exceeds allocation cap", () => {
		const tiles = [{ x: 5000, y: 5000, topography: { h: 0.2 } }];
		expect(() =>
			validateReplayTopographyGrid(tiles, "/tmp/source.json"),
		).toThrow(/exceed replay allocation cap/);
		expect(() =>
			validateReplayTopographyGrid(tiles, "/tmp/source.json"),
		).toThrow(/expectedTiles=25010001/);
	});

	it("fails fast when replay grid tile count exceeds safe-integer arithmetic", () => {
		const tiles = [
			{ x: Number.MAX_SAFE_INTEGER, y: 1, topography: { h: 0.2 } },
		];
		expect(() =>
			validateReplayTopographyGrid(tiles, "/tmp/source.json"),
		).toThrow(/exceed safe tile-count arithmetic/);
	});
});
