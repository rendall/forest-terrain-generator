# `see` Water + Stream Overlay Plan

## Goal

Define an approved implementation plan for adding water and stream overlays to `see` so one rendered image can be used to inspect terrain height, standing water, and stream routing together.

## Plain-Language Intent

When a contributor implements this plan, `see` will keep the terrain height map as its grayscale base image and will optionally add two visual layers on top of that base. The water overlay will tint tiles toward blue `[0, 0, 255]` according to water depth, and the stream overlay will tint stream tiles toward yellow `[255, 255, 0]` at 50% alpha on top of the finished image so drainage remains easy to see. The result should be one deterministic debug image that is faster to inspect than switching between separate views.

## In Scope

- Add support for `--overlay water,stream` in `see`.
- Keep terrain height as the background image for overlay renders.
- Render standing water as a blue tint driven by each tile's water depth.
- Render stream paths on top of the background or background-plus-water result.
- Support the combined `water,stream` case in one final image.
- Add tests that prove the overlay behavior and the unchanged no-overlay behavior.

## Out of Scope

- Changing terrain generation, hydrology simulation, or stream routing behavior.
- Replacing the terrain height map as the base image for `see`.
- Adding new overlay types beyond `water` and `stream`.
- Adding interactive controls, legends, or alternate export formats.
- Changing default `see` output when no overlay flag is provided.

## Acceptance Criteria

- `see --overlay water` renders the same grayscale terrain background as today, with water tiles tinted toward blue `[0, 0, 255]` by depth.
- A tile with water depth `0` keeps its original grayscale terrain color.
- A tile with water depth `1` renders as `[0, 0, 255]`.
- A tile with water depth between `0` and `1` renders as a proportional blend of `[0, 0, 255]` and the underlying grayscale terrain.
- `see --overlay stream` draws each stream tile as a yellow `[255, 255, 0]` overlay at 50% alpha on top of the terrain image so the stream tile remains visible in the final render.
- `see --overlay water,stream` shows both overlays in the same image, with stream tiles still visible on top of the water-tinted terrain.
- Running `see` without an overlay flag produces the same image output as before this change.
- Repeated runs with the same inputs and overlay arguments produce identical image output.

## Implementation Guardrails

### Binding Invariants

1. When no overlay flag is provided, `see` produces the same final image output as before for the same input data.
2. For the water overlay, zero water depth leaves the terrain pixel unchanged, water depth `1` produces `[0, 0, 255]`, and fractional water depth produces a proportional blend between that blue and the original terrain pixel.
3. For any render that includes the stream overlay, each stream tile is composited after the terrain or terrain-plus-water image using yellow `[255, 255, 0]` at 50% alpha so the stream tile remains visible in the final output.
4. Given the same terrain data, hydrology data, and overlay arguments, overlay rendering remains deterministic across repeated runs.

### Validation Strategy

- Add renderer-level tests that verify water overlay pixel behavior at representative depths such as `0`, a fractional value, and `1`, including the exact `[0, 0, 255]` result at depth `1`.
- Add a render or CLI-level test that proves stream tiles are blended using yellow `[255, 255, 0]` at 50% alpha when the stream overlay is requested.
- Add a combined-overlay test that proves stream tile compositing still applies on top when `water,stream` is requested together.
- Add a regression test that proves `see` without overlays keeps the prior output unchanged.
- Add or update a determinism check that proves identical inputs and overlay arguments produce identical final image output.

Traceability:

- Invariant 1 -> no-overlay regression test -> `see` overlay dispatch and renderer entry point -> unchanged default image output
- Invariant 2 -> water pixel-behavior tests -> water overlay composition logic -> blue tint matches water depth
- Invariant 3 -> stream overlay composition test -> stream overlay composition step -> yellow 50%-alpha stream tile remains visible in final image
- Invariant 4 -> determinism test -> end-to-end render path for overlay-enabled `see` -> repeated runs match exactly

### Hardest Missing Step

The hardest missing step is locking the overlay composition rules so water depth shading toward `[0, 0, 255]` preserves terrain readability while yellow `[255, 255, 0]` stream tiles at 50% alpha stay clearly visible on top. This is difficult because the renderer must combine continuous depth-based tinting with a second alpha-blended tile overlay without changing the current no-overlay result or introducing nondeterministic output differences. This step is proven solved when tests show the expected pixel behavior for representative water depths, verify the exact stream-tile blend rule, and confirm that combined `water,stream` renders keep stream tiles visible in the final image.

## Open Questions / Deferments

- This plan does not add new overlay syntax beyond the requested `water` and `stream` overlays.
- The exact rounding rule for converting 50% alpha blended channel values into final byte values should be locked by tests during implementation if the renderer surface requires an explicit choice.

## Conformance QC

- Intent clarity issues: none
- Missing required sections: none
- Ambiguities/assumptions to resolve: the byte-rounding rule for 50% alpha compositing should be fixed by tests during implementation
- Guardrail gaps: none, assuming checklist authoring preserves the no-overlay regression, combined-overlay composition proof, and determinism proof
- Traceability readiness: ready; each invariant has a named evidence path and observable output
- Pass/Fail: Pass - ready for checklist authoring
