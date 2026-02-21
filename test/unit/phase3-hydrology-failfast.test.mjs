import { describe, expect, it } from "vitest";
import { exitCodeForCategory, normalizeCliError } from "../../src/domain/errors.js";
import { createGridShape } from "../../src/domain/topography.js";
import { deriveFlowAccumulation } from "../../src/pipeline/hydrology.js";

describe("Phase 3 hydrology fail-fast diagnostics", () => {
  it("emits stage/invariant/reason/context for cycle detection", () => {
    const shape = createGridShape(2, 1);
    const cyclicFd = new Uint8Array([0, 4]); // 0->1 and 1->0 cycle

    expect(() => deriveFlowAccumulation(shape, cyclicFd)).toThrowError(
      /stage=flow_accumulation/
    );
    expect(() => deriveFlowAccumulation(shape, cyclicFd)).toThrowError(/invariant=acyclic_fd/);
    expect(() => deriveFlowAccumulation(shape, cyclicFd)).toThrowError(/reason=cycle_detected/);
    expect(() => deriveFlowAccumulation(shape, cyclicFd)).toThrowError(/processed=0/);
    expect(() => deriveFlowAccumulation(shape, cyclicFd)).toThrowError(/size=2/);
  });

  it("emits stage/invariant/reason/context for invalid downstream direction", () => {
    const shape = createGridShape(1, 1);
    const badFd = new Uint8Array([0]); // points outside bounds for 1x1

    expect(() => deriveFlowAccumulation(shape, badFd)).toThrowError(/stage=flow_accumulation/);
    expect(() => deriveFlowAccumulation(shape, badFd)).toThrowError(
      /invariant=downstream_in_bounds/
    );
    expect(() => deriveFlowAccumulation(shape, badFd)).toThrowError(
      /reason=fd_points_outside_grid/
    );
    expect(() => deriveFlowAccumulation(shape, badFd)).toThrowError(/index=0/);
    expect(() => deriveFlowAccumulation(shape, badFd)).toThrowError(/dir=0/);
    expect(() => deriveFlowAccumulation(shape, badFd)).toThrowError(/width=1/);
    expect(() => deriveFlowAccumulation(shape, badFd)).toThrowError(/height=1/);
  });

  it("maps hydrology fail-fast errors to internal category and exit code 5", () => {
    const shape = createGridShape(1, 1);
    const badFd = new Uint8Array([0]);

    let caught;
    try {
      deriveFlowAccumulation(shape, badFd);
    } catch (error) {
      caught = error;
    }

    const normalized = normalizeCliError(caught);
    expect(normalized.category).toBe("internal");
    expect(exitCodeForCategory(normalized.category)).toBe(5);
  });
});
