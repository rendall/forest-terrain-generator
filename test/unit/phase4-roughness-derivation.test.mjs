import { describe, expect, it } from "vitest";
import { FEATURE_FLAG_BIT } from "../../src/domain/ecology.js";
import { createGridShape } from "../../src/domain/topography.js";

describe("Phase 4 roughness derivation", () => {
  it("derives Obstruction and FeatureFlags from locked deterministic rules", async () => {
    const { deriveRoughness } = await import("../../src/pipeline/ecology.js");
    const shape = createGridShape(4, 1);
    const r = new Float32Array([0.2, 0.8, 0.4, 0.6]);
    const moisture = new Float32Array([0.2, 0.9, 0.65, 0.4]);
    const h = new Float32Array([0.3, 0.8, 0.8, 0.2]);

    const { obstruction, featureFlags } = deriveRoughness(shape, r, moisture, h, {
      obstructionMoistureMix: 0.15,
      windthrowThreshold: 0.7,
      fallenLogThreshold: 0.45,
      rootTangleMoistureThreshold: 0.6,
      boulderHeightMin: 0.7,
      boulderRoughnessMin: 0.6
    });

    expect(obstruction[0]).toBeCloseTo(0.2, 6);
    expect(obstruction[1]).toBeCloseTo(0.815, 6);
    expect(obstruction[2]).toBeCloseTo(0.4375, 6);
    expect(obstruction[3]).toBeCloseTo(0.57, 6);

    expect(featureFlags[0]).toBe(0);
    expect(featureFlags[1]).toBe(
      FEATURE_FLAG_BIT.fallen_log |
        FEATURE_FLAG_BIT.root_tangle |
        FEATURE_FLAG_BIT.boulder |
        FEATURE_FLAG_BIT.windthrow
    );
    expect(featureFlags[2]).toBe(FEATURE_FLAG_BIT.root_tangle);
    expect(featureFlags[3]).toBe(FEATURE_FLAG_BIT.fallen_log);
  });
});
