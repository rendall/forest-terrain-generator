import { describe, expect, it } from "vitest";
import { createGridShape, indexOf } from "../../src/domain/topography.js";
import { APPENDIX_A_DEFAULTS } from "../../src/lib/default-params.js";
import { deriveTopographyFromBaseMaps } from "../../src/pipeline/derive-topography.js";
import { deriveTopographicStructure } from "../../src/pipeline/derive-topographic-structure.js";
import { deriveHydrology } from "../../src/pipeline/hydrology.js";

function createParaboloidBowlH(shape) {
	const out = new Float32Array(shape.size);
	const cx = (shape.width - 1) / 2;
	const cy = (shape.height - 1) / 2;
	const maxR2 = cx * cx + cy * cy;

	for (let y = 0; y < shape.height; y += 1) {
		for (let x = 0; x < shape.width; x += 1) {
			const dx = x - cx;
			const dy = y - cy;
			const r2 = dx * dx + dy * dy;
			out[indexOf(shape, x, y)] = Math.fround(r2 / maxR2);
		}
	}

	return out;
}

function countLakeComponents(shape, lakeMask) {
	const seen = new Uint8Array(shape.size);
	let components = 0;
	const steps = [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1],
	];

	for (let i = 0; i < shape.size; i += 1) {
		if (lakeMask[i] !== 1 || seen[i] === 1) {
			continue;
		}
		components += 1;
		const queue = [i];
		seen[i] = 1;

		while (queue.length > 0) {
			const current = queue.shift();
			if (current === undefined) {
				continue;
			}
			const x = current % shape.width;
			const y = Math.floor(current / shape.width);

			for (const [dx, dy] of steps) {
				const nx = x + dx;
				const ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= shape.width || ny >= shape.height) {
					continue;
				}
				const ni = indexOf(shape, nx, ny);
				if (lakeMask[ni] !== 1 || seen[ni] === 1) {
					continue;
				}
				seen[ni] = 1;
				queue.push(ni);
			}
		}
	}

	return components;
}

describe("Phase 3 lake coherence bowl fixture", () => {
	// V2 acceptance baseline: expected to fail until lake-coherence defaults are adopted.
	it("forms a coherent interior lake in a synthetic paraboloid bowl", () => {
		const shape = createGridShape(33, 33);
		const h = createParaboloidBowlH(shape);
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
			{
				...APPENDIX_A_DEFAULTS.topography.structure,
				unresolvedPolicy: "max_h",
			},
		);
		const hydrology = deriveHydrology(
			shape,
			topography.h,
			topography.slopeMag,
			topography.landform,
			1n,
			{
				...APPENDIX_A_DEFAULTS.hydrology,
				streamProxMaxDist: APPENDIX_A_DEFAULTS.gameTrails.streamProxMaxDist,
			},
			topographicStructure,
		);

		const lakeMask = hydrology.lakeMask;
		const center = indexOf(shape, 16, 16);
		const lakeCount = Array.from(lakeMask).reduce((sum, v) => sum + v, 0);
		let rimLakeCount = 0;

		for (let x = 0; x < shape.width; x += 1) {
			rimLakeCount += lakeMask[indexOf(shape, x, 0)];
			rimLakeCount += lakeMask[indexOf(shape, x, shape.height - 1)];
		}
		for (let y = 1; y < shape.height - 1; y += 1) {
			rimLakeCount += lakeMask[indexOf(shape, 0, y)];
			rimLakeCount += lakeMask[indexOf(shape, shape.width - 1, y)];
		}

		expect(lakeMask[center]).toBe(1);
		expect(rimLakeCount).toBe(0);
		expect(countLakeComponents(shape, lakeMask)).toBe(1);
		expect(lakeCount).toBeGreaterThanOrEqual(9);
	});
});
