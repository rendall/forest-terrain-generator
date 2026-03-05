# Replay Grid Allocation Bounds Implementation Checklist

Status: proposed  
Scope: prevent resource-exhaustion from extreme replay tile coordinates in shared replay-grid validation.

## Intended Solution

- Add explicit pre-allocation bounds checks in [`validateReplayTopographyGrid` in src/lib/validate-replay-tiles.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/lib/validate-replay-tiles.ts) so malformed sparse coordinates (for example one tile at very large `x/y`) fail before large typed-array allocation.
- Keep the behavior shared across all consumers that rely on replay-grid validation (notably debug replay and hydrology-inspector recompute).

- [x] [input] `RGB-INP-01` Add pre-allocation grid bounds validation in [`validateReplayTopographyGrid` in src/lib/validate-replay-tiles.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/lib/validate-replay-tiles.ts): reject non-safe `expectedSize` and reject `expectedSize` above a defined hard cap before allocating `Float32Array`/`Int32Array`/`tilesByIndex`.
- [x] [contract] `RGB-CON-01` Emit clear fail-fast `InputValidationError` when bounds are exceeded in [`src/lib/validate-replay-tiles.ts`](/mnt/c/workspace/projects/forest-terrain-generator/src/lib/validate-replay-tiles.ts), including requested grid dimensions and expected tile count.
- [x] [contract] `RGB-CON-02` Preserve unchanged propagation of replay-grid validation failures through both replay consumers (`debug --input-file` and hydrology-inspector recompute) by using the shared validator path in [`src/app/run-generator.ts`](/mnt/c/workspace/projects/forest-terrain-generator/src/app/run-generator.ts) and [`src/app/run-hydrology-inspector.ts`](/mnt/c/workspace/projects/forest-terrain-generator/src/app/run-hydrology-inspector.ts).
- [ ] [docs] `RGB-DOC-01` Update user-facing docs to note replay-grid bounds fail-fast behavior for debug replay / hydrology-inspector recompute in [`README.md`](/mnt/c/workspace/projects/forest-terrain-generator/README.md).

## Behavior Slices

### Slice A

- Goal: Reject pathological replay-grid shapes before array allocation while preserving deterministic validation semantics.
- Items: `RGB-INP-01`, `RGB-CON-01`, `RGB-CON-02`
- Type: behavior

### Slice B

- Goal: Keep user-facing documentation aligned with replay-grid bounds validation behavior.
- Items: `RGB-DOC-01`
- Type: mechanical
