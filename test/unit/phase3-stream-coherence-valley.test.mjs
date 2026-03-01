import { describe, expect, it } from "vitest";
import { createGridShape, indexOf } from "../../src/domain/topography.js";
import { APPENDIX_A_DEFAULTS } from "../../src/lib/default-params.js";
import { deriveTopographyFromBaseMaps } from "../../src/pipeline/derive-topography.js";
import { deriveTopographicStructure } from "../../src/pipeline/derive-topographic-structure.js";
import { deriveHydrology } from "../../src/pipeline/hydrology.js";

function createNorthSteepeningValley(shape) {
	const out = new Float32Array(shape.size);
	const cx = (shape.width - 1) / 2;
	const maxDx = Math.max(cx, shape.width - 1 - cx);
	const denomY = Math.max(1, shape.height - 1);

	for (let y = 0; y < shape.height; y += 1) {
		const t = y / denomY; // 0 north, 1 south
		const s = 0.5 * t; // centerline height

		for (let x = 0; x < shape.width; x += 1) {
			const u = maxDx > 0 ? Math.abs(x - cx) / maxDx : 0;
			const h = s + (1 - s) * u;
			out[indexOf(shape, x, y)] = Math.fround(h);
		}
	}

	return out;
}

function floorColumnsForRow(shape, h, y) {
	let minH = Number.POSITIVE_INFINITY;
	for (let x = 0; x < shape.width; x += 1) {
		minH = Math.min(minH, h[indexOf(shape, x, y)]);
	}

	const cols = [];
	for (let x = 0; x < shape.width; x += 1) {
		if (Math.abs(h[indexOf(shape, x, y)] - minH) <= 1e-7) {
			cols.push(x);
		}
	}
	return cols;
}

describe("Phase 3 stream coherence valley fixture", () => {
	// V2 acceptance baseline: expected to fail until v2 defaults target stronger valley-floor adherence.
	it.each([
		{ width: 33, height: 33, label: "odd width" },
		{ width: 32, height: 32, label: "even width" },
	])(
		"forms a centerline-following stream in north-steepening valley ($label)",
		({ width, height }) => {
			const shape = createGridShape(width, height);
			const h = createNorthSteepeningValley(shape);
			const baseMaps = {
				h,
				r: new Float32Array(shape.size),
				v: new Float32Array(shape.size),
			};
			const topography = deriveTopographyFromBaseMaps(
				shape,
				baseMaps,
				APPENDIX_A_DEFAULTS,
			);
			const topographicStructure = deriveTopographicStructure(
				shape,
				topography.h,
				APPENDIX_A_DEFAULTS.topography.structure,
			);
			const hydrology = deriveHydrology(
				shape,
				topography.h,
				topography.slopeMag,
				topography.landform,
				7n,
				{
					...APPENDIX_A_DEFAULTS.hydrology,
					streamProxMaxDist: APPENDIX_A_DEFAULTS.gameTrails.streamProxMaxDist,
				},
				topographicStructure,
			);

			let streamCount = 0;
			let floorStreamCount = 0;
			let northThirdFloorHit = false;
			let southThirdFloorHit = false;
			const northCut = Math.floor(shape.height / 3);
			const southCut = Math.floor((2 * shape.height) / 3);

			for (let y = 0; y < shape.height; y += 1) {
				const floorCols = floorColumnsForRow(shape, h, y);
				let rowHasFloorStream = false;
				for (let x = 0; x < shape.width; x += 1) {
					const i = indexOf(shape, x, y);
					if (hydrology.isStream[i] !== 1) {
						continue;
					}
					streamCount += 1;
					if (floorCols.includes(x)) {
						floorStreamCount += 1;
						rowHasFloorStream = true;
					}
				}

				if (rowHasFloorStream && y <= northCut) {
					northThirdFloorHit = true;
				}
				if (rowHasFloorStream && y >= southCut) {
					southThirdFloorHit = true;
				}
			}

			expect(streamCount).toBeGreaterThan(0);
			expect(floorStreamCount / streamCount).toBeGreaterThanOrEqual(0.7);
			expect(northThirdFloorHit).toBe(true);
			expect(southThirdFloorHit).toBe(true);
		},
	);
});
