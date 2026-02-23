import { describe, expect, it } from "vitest";
import { createGridShape, LANDFORM_CODE } from "../../src/domain/topography.js";

async function loadHydrologyModule() {
	return import("../../src/pipeline/hydrology.js");
}

describe("Phase 3 hydrology facade", () => {
	it("exports stable facade symbols for orchestration and tests", async () => {
		const hydrology = await loadHydrologyModule();
		const expectedFns = [
			"deriveHydrology",
			"deriveFlowDirection",
			"deriveFlowAccumulation",
			"normalizeFlowAccumulation",
			"deriveLakeMask",
			"growLakeMask",
			"deriveStreamMask",
			"deriveDistWater",
			"deriveDistStream",
			"deriveMoisture",
			"classifyWaterClass",
		];
		for (const name of expectedFns) {
			expect(typeof hydrology[name]).toBe("function");
		}

		expect(typeof hydrology.createHydrologyMaps).toBe("function");
		expect(hydrology.DIR8_NONE).toBe(255);
		expect(hydrology.WATER_CLASS_CODE).toEqual({
			none: 0,
			lake: 1,
			stream: 2,
			marsh: 3,
		});
	});

	it("provides a single deriveHydrology facade pass", async () => {
		const hydrology = await loadHydrologyModule();
		const shape = createGridShape(3, 3);
		const h = new Float32Array([1.0, 0.9, 0.8, 1.0, 0.9, 0.8, 1.0, 0.9, 0.8]);
		const slopeMag = new Float32Array(shape.size).fill(0.5);
		const landform = new Uint8Array(shape.size).fill(LANDFORM_CODE.flat);
		const maps = hydrology.deriveHydrology(shape, h, slopeMag, landform, 42n, {
			minDropThreshold: 0.0005,
			tieEps: 0.000001,
			lakeFlatSlopeThreshold: 0.5,
			lakeAccumThreshold: 0.5,
			streamAccumThreshold: 0.5,
			streamMinSlopeThreshold: 0.5,
			waterProxMaxDist: 6,
			streamProxMaxDist: 5,
			moistureAccumStart: 0.35,
			flatnessThreshold: 0.06,
			marshMoistureThreshold: 0.78,
			marshSlopeThreshold: 0.04,
			weights: {
				accum: 0.55,
				flat: 0.25,
				prox: 0.2,
			},
		});

		expect(maps.shape).toEqual(shape);
		expect(maps.fd.length).toBe(shape.size);
		expect(maps.fa.length).toBe(shape.size);
		expect(maps.faN.length).toBe(shape.size);
		expect(maps.lakeMask.length).toBe(shape.size);
		expect(maps.isStream.length).toBe(shape.size);
		expect(maps.distWater.length).toBe(shape.size);
		expect(maps.moisture.length).toBe(shape.size);
		expect(maps.waterClass.length).toBe(shape.size);
		expect(maps.inDeg.length).toBe(shape.size);
	});
});
