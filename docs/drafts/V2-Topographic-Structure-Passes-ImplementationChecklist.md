# V2 Topographic Structure Passes - Implementation Checklist

Primary references:

1. `docs/drafts/V2-Topographic-Structure-Passes-ImplementationPlan.md` (Section 15 adopted decisions)
2. `docs/drafts/V2-Topographic-Structure-Passes-Discussion.md`
3. `docs/drafts/V2-Retention-Stage-Discussion.md` (Section 13 algorithm contract)

Checklist constraint:

1. This checklist excludes testing steps by design; testing is handled by implementation workflow policy.

## Scope Guard

- [x] [scope] `TP-SC-01` Keep first-wave scope limited to structural signal derivation and output wiring; do not change hydrology decision behavior in `src/pipeline/hydrology.ts`.
- [x] [scope] `TP-SC-02` Keep first-wave scope limited to existing enum compatibility (`flat|slope|ridge|valley|basin`) in `src/pipeline/classify-landform.ts`; do not replace landform semantics in this checklist.
- [x] [scope] `TP-SC-03` Keep ADR and normative spec edits out of this checklist; defer them until post-implementation validation.

## Data Contract and Params

- [x] [types] `TP-DC-01` Add interface `TopographicStructureMapsSoA` to `src/domain/topography.ts` with internal structural arrays for basin and peak outputs (`basinMinIdx`, `basinMinH`, `basinSpillH`, `basinPersistence`, `basinDepthLike`, `peakMaxIdx`, `peakMaxH`, `peakSaddleH`, `peakPersistence`, `peakRiseLike`, `basinLike`, `ridgeLike`).
- [x] [types] `TP-DC-02` Add factory `createTopographicStructureMaps(shape)` in `src/domain/topography.ts` initializing all `TopographicStructureMapsSoA` arrays (depends on `TP-DC-01`).
- [x] [params] `TP-DC-03` Add `topography.structure` defaults in `src/lib/default-params.ts` with adopted keys: `enabled`, `connectivity`, `hEps`, `persistenceMin`, `unresolvedPolicy`.
- [x] [params] `TP-DC-04` Add `validateTopographyStructureParams` in `src/io/read-params.ts` for strict type/enum checks of `topography.structure.*` (depends on `TP-DC-03`).
- [x] [params] `TP-DC-05` Call `validateTopographyStructureParams(params)` from `readParamsFile` in `src/io/read-params.ts` after unknown-key validation (depends on `TP-DC-04`).
- [x] [params] `TP-DC-06` Restrict first-wave accepted values in `validateTopographyStructureParams` to adopted policy (`connectivity: "dir8"`, `unresolvedPolicy: "nan"`) and reject others.

## Basin Pass Core

- [x] [topography] `TP-BS-01` Create `src/pipeline/derive-topographic-structure.ts` and define a canonical `Dir8` neighbor order shared by structural sweeps.
- [x] [topography] `TP-BS-02` Add a deterministic grouped-height ordering helper in `derive-topographic-structure.ts` with mode (`asc|desc`) that sorts by `(h, rowMajorIndex)` and groups levels by `hEps` (depends on `TP-BS-01`).
- [x] [topography] `TP-BS-03` Add deterministic DSU utilities in `derive-topographic-structure.ts` for activation/union/find with stable tie handling (depends on `TP-BS-01`).
- [x] [topography] `TP-BS-04` Implement basin sweep metadata in `derive-topographic-structure.ts` (`minH`, `minIdx`, `spillH`) with merge rule: lower minimum wins, row-major tie-break (depends on `TP-BS-02` and `TP-BS-03`).
- [x] [topography] `TP-BS-05` Record `spillH` for losing basin lineage at first merge level in basin sweep merge operations in `derive-topographic-structure.ts` (depends on `TP-BS-04`).
- [x] [topography] `TP-BS-06` Derive per-tile basin outputs in `derive-topographic-structure.ts`: `basinMinIdx`, `basinMinH`, `basinSpillH`, `basinPersistence` under `unresolvedPolicy="nan"` (depends on `TP-BS-05`).
- [x] [topography] `TP-BS-07` Derive `basinDepthLike = max(0, basinSpillH - h)` in `derive-topographic-structure.ts` when `basinSpillH` is resolved; keep unresolved values as `NaN` (depends on `TP-BS-06`).
- [x] [topography] `TP-BS-08` Derive `basinLike` boolean mask in `derive-topographic-structure.ts` from `basinPersistence >= persistenceMin` (depends on `TP-BS-06`).

## Basin-to-Peak Gate

- [x] [scope] `TP-GT-01` Lock explicit go/no-go decision for peak-pass implementation after basin-pass outputs are reviewed against `TS-01`; if no-go, stop after basin-only scope (depends on `TP-BS-08`).

## Peak Pass Core

- [ ] [topography] `TP-PS-01` Implement peak sweep metadata in `derive-topographic-structure.ts` (`maxH`, `maxIdx`, `saddleH`) using the shared grouped-height helper in `desc` mode; merge rule: higher maximum wins, row-major tie-break (depends on `TP-BS-02`, `TP-BS-03`, and `TP-GT-01`).
- [ ] [topography] `TP-PS-02` Record `saddleH` for losing peak lineage at first merge level in peak sweep merge operations in `derive-topographic-structure.ts` (depends on `TP-PS-01`).
- [ ] [topography] `TP-PS-03` Derive per-tile peak outputs in `derive-topographic-structure.ts`: `peakMaxIdx`, `peakMaxH`, `peakSaddleH`, `peakPersistence` under `unresolvedPolicy="nan"` (depends on `TP-PS-02`).
- [ ] [topography] `TP-PS-04` Derive `peakRiseLike = max(0, h - peakSaddleH)` in `derive-topographic-structure.ts` when `peakSaddleH` is resolved; keep unresolved values as `NaN` (depends on `TP-PS-03`).
- [ ] [topography] `TP-PS-05` Derive `ridgeLike` boolean mask in `derive-topographic-structure.ts` from `peakPersistence >= persistenceMin` (depends on `TP-PS-03`).
- [ ] [topography] `TP-PS-06` Add orchestrator `deriveTopographicStructure(shape, h, params)` in `derive-topographic-structure.ts` that returns `TopographicStructureMapsSoA` and respects `topography.structure.enabled` (depends on `TP-BS-08` and `TP-PS-05`).

## Orchestration and Tile Payload

- [ ] [app] `TP-OR-01` Import and run `deriveTopographicStructure` in `runGenerator` in `src/app/run-generator.ts` after `deriveTopographyFromBaseMaps` and before hydrology/ecology consumers (depends on `TP-PS-06`).
- [ ] [app] `TP-OR-02` Keep hydrology invocation unchanged in `runGenerator` (`src/app/run-generator.ts`) so structure maps are not consumed by hydrology in first wave (depends on `TP-SC-01` and `TP-OR-01`).
- [ ] [app] `TP-OR-03` Add minimal tile payload object `topography.structure` in `runGenerator` with adopted stable subset: `basinPersistence`, `peakPersistence`, `basinLike`, `ridgeLike` (depends on `TP-OR-01`).
- [ ] [app] `TP-OR-04` Keep internal lineage/identity fields (`basinMinIdx`, `peakMaxIdx`, spill/saddle lineage internals) out of standard tile payload in `runGenerator` (depends on `TP-OR-03`).

## Debug Artifact Exposure

- [ ] [io] `TP-DB-01` Add interface `TopographyStructureDebugPayload` in `src/io/write-outputs.ts` for full structure arrays used only by debug artifact writers.
- [ ] [io] `TP-DB-02` Add optional `topographyStructureDebug` argument to `writeModeOutputs` in `src/io/write-outputs.ts` (depends on `TP-DB-01`).
- [ ] [io] `TP-DB-03` Add optional `topographyStructureDebug` argument to `writeDebugOutputs` and `writeDebugArtifacts` in `src/io/write-outputs.ts` (depends on `TP-DB-02`).
- [ ] [io] `TP-DB-04` Add helper in `src/io/write-outputs.ts` that builds topography debug tiles by merging `envelope.tiles[i].topography` with full structure debug fields from `topographyStructureDebug` when provided (depends on `TP-DB-03`).
- [ ] [io] `TP-DB-05` Update `writeDebugArtifacts` in `src/io/write-outputs.ts` to use the merged topography debug helper for `topography.json` while leaving standard envelope payload unchanged (depends on `TP-DB-04`).
- [ ] [app] `TP-DB-06` Pass full structure maps from `runGenerator` into `writeModeOutputs` as `topographyStructureDebug` so debug artifacts expose full structural fields (depends on `TP-DB-02` and `TP-OR-01`).

## Behavior Slices

- `S1`
  - Goal: establish scope boundaries and topographic-structure data/param contracts.
  - Items: `TP-SC-01`, `TP-SC-02`, `TP-SC-03`, `TP-DC-01`, `TP-DC-02`, `TP-DC-03`, `TP-DC-04`, `TP-DC-05`, `TP-DC-06`
  - Type: behavior

- `S2`
  - Goal: implement deterministic basin structural sweep and basin-derived signals.
  - Items: `TP-BS-01`, `TP-BS-02`, `TP-BS-03`, `TP-BS-04`, `TP-BS-05`, `TP-BS-06`, `TP-BS-07`, `TP-BS-08`
  - Type: behavior

- `S2.5`
  - Goal: lock explicit peak-pass go/no-go decision after basin pass review.
  - Items: `TP-GT-01`
  - Type: mechanical

- `S3`
  - Goal: implement deterministic peak structural sweep and peak-derived signals.
  - Items: `TP-PS-01`, `TP-PS-02`, `TP-PS-03`, `TP-PS-04`, `TP-PS-05`, `TP-PS-06`
  - Type: behavior

- `S4`
  - Goal: wire topographic-structure stage into generator flow and emit minimal stable tile payload fields.
  - Items: `TP-OR-01`, `TP-OR-02`, `TP-OR-03`, `TP-OR-04`
  - Type: behavior

- `S5`
  - Goal: publish full structural fields to debug artifacts while preserving minimal standard tile payload.
  - Items: `TP-DB-01`, `TP-DB-02`, `TP-DB-03`, `TP-DB-04`, `TP-DB-05`, `TP-DB-06`
  - Type: behavior
