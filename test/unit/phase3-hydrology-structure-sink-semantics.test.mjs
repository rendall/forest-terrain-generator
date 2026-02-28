import { describe, expect, it } from "vitest";
import { createGridShape } from "../../src/domain/topography.js";
import { WATER_CLASS_CODE } from "../../src/domain/hydrology.js";

describe("Phase 3 hydrology-structure sink semantics", () => {
  it("derives deterministic per-tile basin sizes from basinMinIdx", async () => {
    const { deriveBasinTileCounts } = await import("../../src/pipeline/hydrology.js");
    const shape = createGridShape(4, 1);
    const basinMinIdx = new Int32Array([1, 1, 2, -1]);

    const out = deriveBasinTileCounts(shape, basinMinIdx);
    expect(Array.from(out)).toEqual([2, 2, 1, 0]);
  });

  it("classifies route-through for very shallow persistence", async () => {
    const { classifyTerminalWaterClass, normalizeHydrologyStructureParams } = await import(
      "../../src/pipeline/hydrology.js"
    );
    const config = normalizeHydrologyStructureParams({
      sinkPersistenceRouteMax: 0.005,
      sinkPersistenceLakeMin: 0.02,
      basinTileCountMinLake: 3,
      unresolvedLakePolicy: "deny",
    });

    const out = classifyTerminalWaterClass({
      persistence: 0.003,
      basinTileCount: 2,
      inflow: 0.4,
      unresolved: false,
      config,
    });

    expect(out.terminalClass).toBe("route_through");
    expect(out.waterClass).toBe(WATER_CLASS_CODE.none);
    expect(out.rejectionReason).toBe("persistence_below_route_max");
  });

  it("classifies lake when hard gates pass", async () => {
    const { classifyTerminalWaterClass, normalizeHydrologyStructureParams } = await import(
      "../../src/pipeline/hydrology.js"
    );
    const config = normalizeHydrologyStructureParams({
      sinkPersistenceRouteMax: 0.005,
      sinkPersistenceLakeMin: 0.02,
      basinTileCountMinLake: 3,
      unresolvedLakePolicy: "deny",
      inflowGateEnabled: true,
      lakeInflowMin: 0.15,
    });

    const out = classifyTerminalWaterClass({
      persistence: 0.12,
      basinTileCount: 5,
      inflow: 0.4,
      unresolved: false,
      config,
    });

    expect(out.terminalClass).toBe("lake");
    expect(out.waterClass).toBe(WATER_CLASS_CODE.lake);
    expect(out.rejectionReason).toBeNull();
  });

  it("downgrades unresolved lake candidates to pool under deny policy", async () => {
    const { classifyTerminalWaterClass, normalizeHydrologyStructureParams } = await import(
      "../../src/pipeline/hydrology.js"
    );
    const config = normalizeHydrologyStructureParams({
      sinkPersistenceRouteMax: 0.005,
      sinkPersistenceLakeMin: 0.02,
      basinTileCountMinLake: 3,
      unresolvedLakePolicy: "deny",
    });

    const out = classifyTerminalWaterClass({
      persistence: 0.2,
      basinTileCount: 6,
      inflow: 0.5,
      unresolved: true,
      config,
    });

    expect(out.terminalClass).toBe("pool");
    expect(out.waterClass).toBe(WATER_CLASS_CODE.pool);
    expect(out.rejectionReason).toBe("unresolved_policy_denied");
  });
});
