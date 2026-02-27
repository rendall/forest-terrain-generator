import { describe, expect, it } from "vitest";
import { createGridShape, LANDFORM_CODE } from "../../src/domain/topography.js";

async function loadHydrologyModule() {
	return import("../../src/pipeline/hydrology.js");
}

describe("Phase 3 water derivations", () => {
	it("applies exact threshold semantics for lake/stream masks", async () => {
		const hydrology = await loadHydrologyModule();
		const shape = createGridShape(3, 1);
		const landform = new Uint8Array([
			LANDFORM_CODE.basin,
			LANDFORM_CODE.basin,
			LANDFORM_CODE.flat,
		]);
		const slopeMag = new Float32Array([0.49, 0.5, 0.5]);
		const faN = new Float32Array([0.5, 0.5, 0.5]);
		const params = {
			lakeFlatSlopeThreshold: 0.5,
			lakeAccumThreshold: 0.5,
			streamThresholds: {
				sourceAccumMin: 0.5,
				channelAccumMin: 0.5,
				minSlope: 0.5,
			},
		};

		const lakeMask = hydrology.deriveLakeMask(
			shape,
			landform,
			slopeMag,
			faN,
			params,
		);
		expect(Array.from(lakeMask)).toEqual([1, 0, 0]);

		const isStream = hydrology.deriveStreamMask(
			shape,
			lakeMask,
			faN,
			slopeMag,
			params,
		);
		expect(Array.from(isStream)).toEqual([0, 1, 1]);
	});

	it("derives moisture from accum/flat/prox terms and clamps to [0,1]", async () => {
		const hydrology = await loadHydrologyModule();
		const shape = createGridShape(3, 1);
		const faN = new Float32Array([0.2, 0.5, 0.9]);
		const slopeMag = new Float32Array([0.08, 0.04, 0.0]);
		const distWater = new Uint32Array([0, 2, 5]);
		const params = {
			moistureAccumStart: 0.35,
			flatnessThreshold: 0.06,
			waterProxMaxDist: 5,
			weights: {
				accum: 0.55,
				flat: 0.25,
				prox: 0.2,
			},
		};

		const moisture = hydrology.deriveMoisture(
			shape,
			faN,
			slopeMag,
			distWater,
			params,
		);
		expect(moisture[0]).toBeCloseTo(0.2, 6);
		expect(moisture[1]).toBeCloseTo(0.3302564, 6);
		expect(moisture[2]).toBeCloseTo(0.7153846153, 6);
		for (const value of moisture) {
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThanOrEqual(1);
		}
	});

	it("assigns water class with precedence lake > stream > marsh > none", async () => {
		const hydrology = await loadHydrologyModule();
		const shape = createGridShape(4, 1);
		const lakeMask = new Uint8Array([1, 0, 0, 0]);
		const isStream = new Uint8Array([1, 1, 0, 0]);
		const poolMask = new Uint8Array([0, 0, 0, 0]);
		const moisture = new Float32Array([0.9, 0.9, 0.9, 0.4]);
		const slopeMag = new Float32Array([0.01, 0.01, 0.01, 0.2]);
		const params = {
			marshMoistureThreshold: 0.78,
			marshSlopeThreshold: 0.04,
		};

		const waterClass = hydrology.classifyWaterClass(
			shape,
			lakeMask,
			isStream,
			poolMask,
			moisture,
			slopeMag,
			params,
		);
		expect(Array.from(waterClass)).toEqual([1, 2, 3, 0]);
	});

	it("grows lakes by connected component using conservative reference-height gating", async () => {
		const hydrology = await loadHydrologyModule();
		const shape = createGridShape(3, 3);
		const lakeMask = new Uint8Array([0, 0, 0, 0, 1, 0, 0, 1, 0]);
		const h = new Float32Array([
			0.8, 0.8, 0.8, 0.8, 0.2, 0.205, 0.8, 0.3, 0.295,
		]);
		const slopeMag = new Float32Array(shape.size).fill(0.02);
		const grown = hydrology.growLakeMask(shape, lakeMask, h, slopeMag, {
			lakeFlatSlopeThreshold: 0.06,
			lakeAccumThreshold: 0.65,
			lakeGrowSteps: 1,
			lakeGrowHeightDelta: 0.01,
		});

		// The seed component reference is min(H)=0.2, so threshold is 0.21.
		expect(Array.from(grown)).toEqual([0, 0, 0, 0, 1, 1, 0, 1, 0]);
		expect(Array.from(lakeMask)).toEqual([0, 0, 0, 0, 1, 0, 0, 1, 0]);
	});

	it("emits terminal sinks as pool waterClass instead of stream", async () => {
		const hydrology = await loadHydrologyModule();
		const shape = createGridShape(2, 1);
		const downstream = new Int32Array([1, -1]);
		const lakeMask = new Uint8Array([0, 0]);
		const sourceMask = new Uint8Array([1, 0]);
		const faN = new Float32Array([0.7, 0.8]);
		const streamThresholds = {
			sourceAccumMin: 0.55,
			channelAccumMin: 0.75,
			minSlope: 0.01,
			maxGapFillSteps: 0,
		};
		const waterClassParams = {
			marshMoistureThreshold: 0.78,
			marshSlopeThreshold: 0.04,
		};

		const topology = hydrology.deriveStreamTopology(
			shape,
			downstream,
			lakeMask,
			sourceMask,
			faN,
			streamThresholds,
		);
		const waterClass = hydrology.classifyWaterClass(
			shape,
			lakeMask,
			topology.isStream,
			topology.poolMask,
			new Float32Array([0.2, 0.2]),
			new Float32Array([0.2, 0.2]),
			waterClassParams,
		);

		expect(topology.poolMask[1]).toBe(1);
		expect(waterClass[1]).toBe(hydrology.WATER_CLASS_CODE.pool);
	});
});
