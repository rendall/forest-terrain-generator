# Hydrology Inspector Recompute Effective Params Implementation Checklist

Status: implemented  
Scope: address PR `P1` by making hydrology-inspector recompute parity match generator/debug effective hydrology params.

## Investigation Summary

- `run-hydrology-inspector` recompute currently calls [`deriveHydrology` in src/pipeline/derive-hydrology.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/pipeline/derive-hydrology.ts) with only `{ hydrology: { sinkMode } }` from [`buildContextFromEnvelope` in src/app/run-hydrology-inspector.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/app/run-hydrology-inspector.ts), so defaults and envelope overrides are dropped.
- Repro 1 (no `paramOverrides`): same envelope yields `streamTileCount=4` via replay debug output but `streamTileCount=0` via hydrology-inspector recompute.
- Repro 2 (`paramOverrides.hydrology.faQuantileThreshold=1`): replay debug output yields `streamTileCount=1` while hydrology-inspector recompute remains `streamTileCount=0`.
- Root cause is effective-params drift, not sink-mode drift; `--sink-mode` alone cannot recover dropped threshold/quantile/lake-fill behavior.

- [x] [app] `HIP-APP-01` Build inspector recompute params with precedence `defaults -> envelope.paramOverrides -> --sink-mode` in [`buildContextFromEnvelope` in src/app/run-hydrology-inspector.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/app/run-hydrology-inspector.ts), using [`APPENDIX_A_DEFAULTS` in src/lib/default-params.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/lib/default-params.ts) as the baseline.
- [x] [input] `HIP-INP-01` Normalize and validate envelope overrides before merge (same contract as debug replay) using [`normalizeAndValidateParamsObject` in src/io/read-params.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/io/read-params.ts) with path prefix `envelope.paramOverrides`.
- [x] [app] `HIP-APP-02` Pass full effective recompute params into [`deriveHydrology` in src/pipeline/derive-hydrology.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/pipeline/derive-hydrology.ts) from [`src/app/run-hydrology-inspector.ts`](/mnt/c/workspace/projects/forest-terrain-generator/src/app/run-hydrology-inspector.ts) instead of sink-mode-only params. Depends on `HIP-APP-01`.
- [x] [contract] `HIP-CON-01` Preserve explicit CLI override semantics so `--sink-mode` overrides envelope/default sink mode only (without suppressing other effective hydrology params) in [`src/cli/hydrology-inspector.ts`](/mnt/c/workspace/projects/forest-terrain-generator/src/cli/hydrology-inspector.ts) and [`src/app/run-hydrology-inspector.ts`](/mnt/c/workspace/projects/forest-terrain-generator/src/app/run-hydrology-inspector.ts). Depends on `HIP-APP-01`.
- [x] [docs] `HIP-DOC-01` Update hydrology-inspector user docs to state recompute precedence and parity target with generator/debug replay in [`README.md`](/mnt/c/workspace/projects/forest-terrain-generator/README.md) and CLI manual block in [`src/cli/hydrology-inspector.ts`](/mnt/c/workspace/projects/forest-terrain-generator/src/cli/hydrology-inspector.ts).

## Behavior Slices

### Slice A

- Goal: Eliminate recompute parameter drift by building a single effective params object from defaults, envelope overrides, and CLI sink-mode override.
- Items: `HIP-APP-01`, `HIP-INP-01`, `HIP-APP-02`, `HIP-CON-01`
- Type: behavior

### Slice B

- Goal: Keep user-facing hydrology-inspector docs aligned with implemented recompute precedence semantics.
- Items: `HIP-DOC-01`
- Type: mechanical
