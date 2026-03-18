# `see` Water + Stream Overlay Implementation Checklist

Source plan: `docs/archive/see-overlay-water-stream-plan.md`

- [x] `SWS-CLI-01` [cli] Add `--overlay <overlays>` parsing to `program.command("see")` in `src/cli/main.ts`, validate only `water` and `stream`, and thread normalized overlay selections through `SeeCliArgs` and `runSee` in `src/app/run-see.ts`.
  - Trace:
    - "Add support for `--overlay water,stream` in `see`." (`In Scope`)
    - "This plan does not add new overlay syntax beyond the requested `water` and `stream` overlays." (`Open Questions / Deferments`)
  - Validation: `test/integration/cli-command-wiring.test.mjs`

- [x] `SWS-REN-01` [render] Split `runSee` in `src/app/run-see.ts` into a shared dense-tile read path and a default grayscale render path that preserves the current no-overlay bytes.
  - Depends on: `SWS-CLI-01`.
  - Trace:
    - "Keep terrain height as the background image for overlay renders." (`In Scope`)
    - "When no overlay flag is provided, `see` produces the same final image output as before for the same input data." (`Binding Invariants`)
  - Validation: `test/integration/cli-command-wiring.test.mjs`

- [x] `SWS-TST-01` [test] Add renderer-focused coverage in `test/unit/run-see-overlay.test.mjs` that locks water tint math, stream-tile yellow `[255, 255, 0]` compositing at 50% alpha, and the byte-rounding rule used by `runSee`.
  - Trace:
    - "Add renderer-level tests that verify water overlay pixel behavior at representative depths such as `0`, a fractional value, and `1`" (`Validation Strategy`)
    - "The exact rounding rule for converting 50% alpha blended channel values into final byte values should be locked by tests during implementation" (`Open Questions / Deferments`)
  - Validation: `test/unit/run-see-overlay.test.mjs`

- [x] `SWS-REN-02` [render] Implement water overlay composition in `runSee` in `src/app/run-see.ts` using `[0, 0, 255]` as the overlay color, with depth `0` unchanged, depth `1` exact blue, and fractional depths blended proportionally against the terrain pixel.
  - Depends on: `SWS-REN-01`, `SWS-TST-01`.
  - Trace:
    - "Render standing water as a blue tint driven by each tile's water depth." (`In Scope`)
    - "A tile with water depth `1` renders as `[0, 0, 255]`." (`Acceptance Criteria`)
    - "For the water overlay, zero water depth leaves the terrain pixel unchanged, water depth `1` produces `[0, 0, 255]`" (`Binding Invariants`)
  - Validation: `test/unit/run-see-overlay.test.mjs`

- [x] `SWS-REN-03` [render] Implement stream-tile overlay composition in `runSee` in `src/app/run-see.ts` after terrain or terrain-plus-water using yellow `[255, 255, 0]` at 50% alpha.
  - Depends on: `SWS-REN-01`, `SWS-TST-01`.
  - Trace:
    - "Render stream paths on top of the background or background-plus-water result." (`In Scope`)
    - "`see --overlay stream` draws each stream tile as a yellow `[255, 255, 0]` overlay at 50% alpha on top of the terrain image" (`Acceptance Criteria`)
    - "each stream tile is composited after the terrain or terrain-plus-water image using yellow `[255, 255, 0]` at 50% alpha" (`Binding Invariants`)
  - Validation: `test/unit/run-see-overlay.test.mjs`

- [x] `SWS-OUT-01` [output] Update `runSee` in `src/app/run-see.ts` and the `see` command help text in `src/cli/main.ts` so overlay-enabled renders emit the required color image output while no-overlay renders keep the current grayscale output contract.
  - Depends on: `SWS-REN-02`, `SWS-REN-03`.
  - Trace:
    - "`see --overlay water,stream` shows both overlays in the same image" (`Acceptance Criteria`)
    - "Running `see` without an overlay flag produces the same image output as before this change." (`Acceptance Criteria`)
  - Validation: `test/integration/cli-command-wiring.test.mjs`

- [x] `SWS-TST-02` [test] Extend `test/integration/cli-command-wiring.test.mjs` to prove `see --overlay water`, `see --overlay stream`, and `see --overlay water,stream` produce the expected final image outputs, that default `see` output is unchanged, and that repeated runs with the same overlay args produce identical bytes.
  - Depends on: `SWS-CLI-01`, `SWS-OUT-01`.
  - Trace:
    - "Add a combined-overlay test that proves stream tile compositing still applies on top when `water,stream` is requested together." (`Validation Strategy`)
    - "Add a regression test that proves `see` without overlays keeps the prior output unchanged." (`Validation Strategy`)
    - "Add or update a determinism check that proves identical inputs and overlay arguments produce identical final image output." (`Validation Strategy`)
  - Validation: `test/integration/cli-command-wiring.test.mjs`

## Behavior Slices

### Slice A

- Goal: Accept overlay selections in `see` and preserve the current no-overlay contract while enabling overlay-capable output.
- Items: `SWS-CLI-01`, `SWS-REN-01`, `SWS-OUT-01`
- Type: behavior

### Slice B

- Goal: Lock the overlay composition math for water and stream tiles, including the exact 50% alpha rounding rule.
- Items: `SWS-TST-01`, `SWS-REN-02`, `SWS-REN-03`
- Type: behavior

### Slice C

- Goal: Prove end-to-end CLI behavior for water-only, stream-only, combined overlays, default regression, and deterministic repeated output.
- Items: `SWS-TST-02`
- Type: behavior

## Conformance QC

- Missing from plan: none
- Extra beyond plan: none; color image output for overlay-enabled renders is required to satisfy the approved color-overlay acceptance criteria
- Atomicity fixes needed: none
- Validation mapping gaps: none; renderer math, stream compositing, no-overlay regression, combined-overlay behavior, and determinism each have an explicit proof path
- Traceability readiness: ready; every behavior-changing item includes direct plan quotes
- Pass/Fail: Pass - ready for implementation
