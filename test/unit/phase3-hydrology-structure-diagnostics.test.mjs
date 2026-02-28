import { describe, expect, it } from "vitest";
import { createGridShape, createTopographicStructureMaps } from "../../src/domain/topography.js";
import { LANDFORM_CODE } from "../../src/domain/topography.js";
import { deriveHydrology } from "../../src/pipeline/hydrology.js";

describe("Phase 3 hydrology-structure diagnostics", () => {
  it("emits structure diagnostics and applies retention moisture blend", () => {
    const shape = createGridShape(1, 1);
    const h = new Float32Array([0.4]);
    const slopeMag = new Float32Array([1]);
    const landform = new Uint8Array([LANDFORM_CODE.slope]);

    const structure = createTopographicStructureMaps(shape);
    structure.basinMinIdx[0] = 0;
    structure.basinPersistence[0] = 0.4;
    structure.basinDepthLike[0] = 0.8;
    structure.basinSpillH[0] = 0.9;
    structure.basinLike[0] = 1;

    const maps = deriveHydrology(
      shape,
      h,
      slopeMag,
      landform,
      1n,
      {
        minDropThreshold: 0.0005,
        tieEps: 0.000001,
        streamThresholds: {
          sourceAccumMin: 0.55,
          channelAccumMin: 0.55,
          minSlope: 0.01,
          maxGapFillSteps: 0,
        },
        lakeFlatSlopeThreshold: 0.03,
        lakeAccumThreshold: 0.65,
        lakeGrowSteps: 0,
        lakeGrowHeightDelta: 0.01,
        moistureAccumStart: 0.35,
        flatnessThreshold: 0.06,
        waterProxMaxDist: 6,
        streamProxMaxDist: 5,
        weights: { accum: 0.55, flat: 0.25, prox: 0.2 },
        marshMoistureThreshold: 0.78,
        marshSlopeThreshold: 0.04,
        structure: {
          enabled: true,
          sinkPersistenceRouteMax: 0.005,
          sinkPersistenceLakeMin: 0.02,
          basinTileCountMinLake: 3,
          inflowGateEnabled: false,
          lakeInflowMin: 0.15,
          unresolvedLakePolicy: "deny",
          spillAwareRouteThroughEnabled: false,
          retentionWeight: 0.5,
          retentionNormalization: "raw",
        },
      },
      structure,
    );

    expect(maps.moisture[0]).toBeGreaterThan(0);
    expect(maps.structureDiagnostics).toBeDefined();
    expect(maps.structureDiagnostics.params).toBeDefined();
    expect(maps.structureDiagnostics.sinkCandidates).toBeDefined();
    expect(maps.structureDiagnostics.sinkRejections).toBeDefined();
    expect(maps.structureDiagnostics.endpointReasons).toBeDefined();
    expect(maps.structureDiagnostics.moistureDecomposition).toBeDefined();
  });

  it("disables retention blending when hydrology.structure.enabled=false", () => {
    const shape = createGridShape(1, 1);
    const h = new Float32Array([0.4]);
    const slopeMag = new Float32Array([0.02]);
    const landform = new Uint8Array([LANDFORM_CODE.slope]);

    const structure = createTopographicStructureMaps(shape);
    structure.basinMinIdx[0] = 0;
    structure.basinPersistence[0] = 0.4;
    structure.basinDepthLike[0] = 0.8;
    structure.basinSpillH[0] = 0.9;
    structure.basinLike[0] = 1;

    const maps = deriveHydrology(
      shape,
      h,
      slopeMag,
      landform,
      1n,
      {
        minDropThreshold: 0.0005,
        tieEps: 0.000001,
        streamThresholds: {
          sourceAccumMin: 0.55,
          channelAccumMin: 0.55,
          minSlope: 0.01,
          maxGapFillSteps: 0,
        },
        lakeFlatSlopeThreshold: 0.03,
        lakeAccumThreshold: 0.65,
        lakeGrowSteps: 0,
        lakeGrowHeightDelta: 0.01,
        moistureAccumStart: 0.35,
        flatnessThreshold: 0.06,
        waterProxMaxDist: 6,
        streamProxMaxDist: 5,
        weights: { accum: 0, flat: 0, prox: 0 },
        marshMoistureThreshold: 0.78,
        marshSlopeThreshold: 0.04,
        structure: {
          enabled: false,
          sinkPersistenceRouteMax: 0.005,
          sinkPersistenceLakeMin: 0.02,
          basinTileCountMinLake: 3,
          inflowGateEnabled: false,
          lakeInflowMin: 0.15,
          unresolvedLakePolicy: "deny",
          spillAwareRouteThroughEnabled: false,
          retentionWeight: 1.0,
          retentionNormalization: "raw",
        },
      },
      structure,
    );

    expect(maps.structureDiagnostics.params.enabled).toBe(false);
    expect(maps.structureDiagnostics.moistureDecomposition.baseMoisture.max).toBe(0);
    expect(maps.structureDiagnostics.moistureDecomposition.retentionTerm.max).toBe(0);
    expect(maps.structureDiagnostics.moistureDecomposition.finalMoisture.max).toBe(0);
    expect(maps.moisture[0]).toBe(0);
  });
});
