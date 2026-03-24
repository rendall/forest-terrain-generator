import { describe, expect, it } from "vitest";
import { renderOverlayRgbPixels } from "../../src/app/run-see.js";

describe("run-see overlay composition", () => {
	it("leaves dry tiles unchanged, blends fractional water depth, and reaches exact blue at depth 1", () => {
		const basePixels = new Uint8Array([100, 100, 100]);
		const waterDepthByIndex = new Float64Array([0, 0.5, 1]);
		const streamMask = new Uint8Array([0, 0, 0]);

		const pixels = renderOverlayRgbPixels(
			basePixels,
			waterDepthByIndex,
			streamMask,
			["water"],
		);

		expect(Array.from(pixels)).toEqual([100, 100, 100, 50, 50, 178, 0, 0, 255]);
	});

	it("applies stream tiles as yellow at 50% alpha", () => {
		const basePixels = new Uint8Array([100]);
		const waterDepthByIndex = new Float64Array([0]);
		const streamMask = new Uint8Array([1]);

		const pixels = renderOverlayRgbPixels(
			basePixels,
			waterDepthByIndex,
			streamMask,
			["stream"],
		);

		expect(Array.from(pixels)).toEqual([178, 178, 50]);
	});

	it("composites stream tiles after water tint and locks the 50% alpha rounding rule", () => {
		const basePixels = new Uint8Array([100]);
		const waterDepthByIndex = new Float64Array([0.5]);
		const streamMask = new Uint8Array([1]);

		const pixels = renderOverlayRgbPixels(
			basePixels,
			waterDepthByIndex,
			streamMask,
			["water", "stream"],
		);

		expect(Array.from(pixels)).toEqual([153, 153, 89]);
	});
});
