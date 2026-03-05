# Hydrology Inspector Recompute Dense-Grid Validation Implementation Checklist

Status: proposed  
Scope: address PR `P2` by rejecting invalid tile geometry before hydrology-inspector recompute.

## Investigation Summary

- Current recompute flow in [`buildContextFromEnvelope` in src/app/run-hydrology-inspector.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/app/run-hydrology-inspector.ts) infers shape from `maxX/maxY`, then fills `h` with defaults for missing cells and silently overwrites duplicate coordinates.
- Repro (sparse coordinates): envelope with `(0,0)` and `(2,0)` succeeds and reports stats for a synthetic 3-tile grid instead of failing.
- Repro (duplicate coordinates): envelope with duplicate `(0,0)` succeeds and reports stats based on last-write-wins behavior instead of failing.
- Existing helper [`validateReplayTopographyGrid` in src/lib/validate-replay-tiles.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/lib/validate-replay-tiles.ts) already enforces dense rectangular coverage, duplicate rejection, and finite `topography.h` for debug replay and should be reused to keep invariants aligned.

- [x] [input] `HIPDG-INP-01` In hydrology-inspector recompute path, validate envelope tiles with [`validateReplayTopographyGrid` in src/lib/validate-replay-tiles.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/lib/validate-replay-tiles.ts) before any hydrology derivation in [`src/app/run-hydrology-inspector.ts`](/mnt/c/workspace/projects/forest-terrain-generator/src/app/run-hydrology-inspector.ts).
- [x] [input] `HIPDG-INP-02` Replace max-coordinate shape inference and implicit `h=0` fill behavior in recompute mode with validated replay-grid outputs (`shape`, `h`, coordinate uniqueness) from [`validateReplayTopographyGrid` in src/lib/validate-replay-tiles.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/lib/validate-replay-tiles.ts). Depends on `HIPDG-INP-01`.
- [x] [contract] `HIPDG-CON-01` Preserve fail-fast error contract for invalid recompute geometry (holes, duplicates, invalid/missing `topography.h`) by surfacing input-validation failures from replay-grid validation in [`src/app/run-hydrology-inspector.ts`](/mnt/c/workspace/projects/forest-terrain-generator/src/app/run-hydrology-inspector.ts). Depends on `HIPDG-INP-01`.
- [ ] [docs] `HIPDG-DOC-01` Update hydrology-inspector docs to state that recompute mode requires dense rectangular tile coverage with finite `topography.h`, and that invalid coverage fails fast, in [`README.md`](/mnt/c/workspace/projects/forest-terrain-generator/README.md) and [`src/cli/hydrology-inspector.ts`](/mnt/c/workspace/projects/forest-terrain-generator/src/cli/hydrology-inspector.ts).

## Behavior Slices

### Slice A

- Goal: Ensure hydrology-inspector recompute only runs on valid dense replay geometry and never fabricates cells or masks duplicates.
- Items: `HIPDG-INP-01`, `HIPDG-INP-02`, `HIPDG-CON-01`
- Type: behavior

### Slice B

- Goal: Keep user-facing hydrology-inspector recompute docs aligned with dense-grid validation behavior.
- Items: `HIPDG-DOC-01`
- Type: mechanical
