# V2 Hydrology Structure Enhancements - Implementation Checklist

Primary references:

1. `docs/drafts/V2-Hydrology-Structure-Enhancements-ImplementationPlan.md` (Sections 7, 8, 9, 13)
2. `docs/drafts/V2-Hydrology-Structure-Enhancements-Discussion.md`
3. `docs/drafts/V2-Topographic-Structure-Passes-ImplementationPlan.md`

Checklist constraint:

1. This checklist excludes testing steps by design; testing is handled by implementation workflow policy.

## Scope Guard

- [x] [scope] `HS-SC-01` Keep this track scoped to hydrology behavior, params, diagnostics, and output wiring for structure-aware decisions.
- [x] [scope] `HS-SC-02` Do not implement physical time-step water balance (rainfall/evaporation/volume simulation) in this track.
- [x] [scope] `HS-SC-03` Do not add per-mode (`generate|derive|debug`) unresolved-lake policy branching in this track.

## Params and Validation

- [x] [params] `HS-DC-01` Add `hydrology.structure` defaults to `src/lib/default-params.ts` with locked first-wave keys and values from plan Section 7.1.
- [x] [params] `HS-DC-02` Extend params schema acceptance for `hydrology.structure.*` in `src/io/read-params.ts` (depends on `HS-DC-01`).
- [x] [params] `HS-DC-03` Add strict enum validation for `hydrology.structure.unresolvedLakePolicy` (`deny|allow_with_strict_gates|allow`) and `hydrology.structure.retentionNormalization` (`quantile|minmax|raw`) in `src/io/read-params.ts` (depends on `HS-DC-02`).
- [x] [params] `HS-DC-04` Add strict numeric and range validation for `sinkPersistenceRouteMax`, `sinkPersistenceLakeMin`, `basinTileCountMinLake`, `lakeInflowMin`, and `retentionWeight` in `src/io/read-params.ts` (depends on `HS-DC-02`).
- [x] [app] `HS-DC-05` Update `buildHydrologyParams` in `src/app/run-generator.ts` to forward `hydrology.structure` to hydrology derivation path (depends on `HS-DC-01`).

## Hydrology Structure Config Plumbing

- [x] [hydrology] `HS-HY-01` Add `HydrologyStructureParams` interface in `src/pipeline/hydrology.ts` for first-wave structure controls.
- [x] [hydrology] `HS-HY-02` Extend `HydrologyParams` in `src/pipeline/hydrology.ts` to include `structure?: HydrologyStructureParams` (depends on `HS-HY-01`).
- [x] [hydrology] `HS-HY-03` Add normalization/resolution helper in `src/pipeline/hydrology.ts` that applies locked defaults for `hydrology.structure.*` and returns effective structure config (depends on `HS-HY-01`).

## Sink Semantics (Persistence + Size; Optional Inflow)

- [x] [hydrology] `HS-SK-01` Add deterministic helper `deriveBasinTileCounts(shape, basinMinIdx)` in `src/pipeline/hydrology.ts` that returns per-tile basin-size lookup keyed by `basinMinIdx` from topographic structure maps.
- [x] [hydrology] `HS-SK-02` Add helper `classifyTerminalWaterClass(...)` in `src/pipeline/hydrology.ts` that applies standing-water gates in adopted order: persistence gates, basin-size gate, optional inflow gate, unresolved policy gate (depends on `HS-HY-03` and `HS-SK-01`).
  - Ensure helper returns both selected class and rejection-reason code for diagnostics.
- [x] [hydrology] `HS-SK-03` Integrate `classifyTerminalWaterClass` into terminal handling path in `deriveHydrology` in `src/pipeline/hydrology.ts` for `pool|lake|route-through` outcomes while preserving deterministic traversal order (depends on `HS-SK-02`).
- [x] [hydrology] `HS-SK-04` Keep spill-aware route-through behavior behind `spillAwareRouteThroughEnabled` and default no-op when disabled in `deriveHydrology` (depends on `HS-SK-03`).

## Retention-Aware Moisture

- [x] [hydrology] `HS-MR-01` Add retention-term derivation helper in `src/pipeline/hydrology.ts` using basin structure signals and configured normalization mode (`quantile|minmax|raw`) (depends on `HS-HY-03`).
- [x] [hydrology] `HS-MR-02` Add moisture blend helper in `src/pipeline/hydrology.ts` implementing `finalMoisture = clamp01(baseMoisture + retentionWeight * retentionTerm)` (depends on `HS-MR-01`).
- [x] [hydrology] `HS-MR-03` Update moisture assignment in `deriveHydrology` to use the retention-aware blend output and preserve deterministic result shape (depends on `HS-MR-02`).

## Diagnostics Contract

- [x] [hydrology] `HS-DG-01` Add `HydrologyStructureDiagnostics` interface in `src/pipeline/hydrology.ts` with locked fields from plan Section 8.2 and add optional `structureDiagnostics?: HydrologyStructureDiagnostics` on the hydrology derive return contract (depends on `HS-HY-02`).
- [x] [hydrology] `HS-DG-02` Populate sink candidate counters and gate-rejection counters inside `deriveHydrology` according to Section 8.2 taxonomy (depends on `HS-SK-03` and `HS-DG-01`).
- [x] [hydrology] `HS-DG-03` Populate endpoint reason counters (`lake|pool|marsh|route_through|blocked`) in `deriveHydrology` (depends on `HS-SK-03` and `HS-DG-01`).
- [x] [hydrology] `HS-DG-04` Populate moisture decomposition summaries (`baseMoisture`, `retentionTerm`, `finalMoisture`) in `deriveHydrology` (depends on `HS-MR-03` and `HS-DG-01`).
- [x] [hydrology] `HS-DG-05` Include effective resolved `hydrology.structure.*` values in `structureDiagnostics.params` from `deriveHydrology` (depends on `HS-HY-03` and `HS-DG-01`).

## App and Debug Output Wiring

- [x] [app] `HS-OR-01` In `runGenerator` (`src/app/run-generator.ts`), read `hydrology.structureDiagnostics` from hydrology output and store as `hydrologyStructureDiagnostics` local for output wiring.
- [x] [io] `HS-OR-02` Add optional `hydrologyStructureDiagnostics` argument to `writeModeOutputs` in `src/io/write-outputs.ts` (depends on `HS-OR-01`).
- [x] [io] `HS-OR-03` Add optional `hydrologyStructureDiagnostics` argument to `writeDebugOutputs` and `writeDebugArtifacts` in `src/io/write-outputs.ts` (depends on `HS-OR-02`).
- [x] [io] `HS-OR-04` Emit `hydrologyStructureDiagnostics` into `debug-manifest.json` under the same key when provided (depends on `HS-OR-03`).
- [x] [app] `HS-OR-05` Pass hydrology structure diagnostics from `runGenerator` to `writeModeOutputs` in debug mode path (depends on `HS-OR-02` and `HS-DG-05`).

## Governance and Documentation Alignment

- [ ] [docs] `HS-GV-01` Add/update ADR entry documenting adopted hydrology structure decisions `HS-01` through `HS-06`.
- [ ] [docs] `HS-GV-02` Update `docs/normative/ForestTerrainGeneration.md` with first-wave `hydrology.structure` parameter contract and sink/moisture behavior semantics.
- [ ] [docs] `HS-GV-03` Add parameter intent/monotonic/failure-signature notes for each `hydrology.structure.*` key in user-facing docs (`README.md` or normative appendix), matching plan Section 7.3.
- [ ] [docs] `HS-GV-04` Add explicit fixture path references for acceptance criteria to the plan/checklist docs (`bowl`, `valley`, `split-basin`, `flat-noise`) using existing test locations and planned new fixture paths as needed.
  - Use `test/unit/phase3-lake-coherence-bowl.test.mjs` and `test/unit/phase3-stream-coherence-valley.test.mjs` as canonical anchors for first two fixtures.

## Behavior Slices

- `S1`
  - Goal: lock scope and add first-wave parameter contract plumbing.
  - Items: `HS-SC-01`, `HS-SC-02`, `HS-SC-03`, `HS-DC-01`, `HS-DC-02`, `HS-DC-03`, `HS-DC-04`, `HS-DC-05`, `HS-HY-01`, `HS-HY-02`, `HS-HY-03`.
  - Type: behavior

- `S2`
  - Goal: implement structure-aware sink semantics with adopted defaults.
  - Items: `HS-SK-01`, `HS-SK-02`, `HS-SK-03`, `HS-SK-04`.
  - Type: behavior

- `S3`
  - Goal: add retention-aware moisture blending.
  - Items: `HS-MR-01`, `HS-MR-02`, `HS-MR-03`.
  - Type: behavior

- `S4`
  - Goal: expose required diagnostics for troubleshooting and tuning.
  - Items: `HS-DG-01`, `HS-DG-02`, `HS-DG-03`, `HS-DG-04`, `HS-DG-05`.
  - Type: behavior

- `S5`
  - Goal: wire hydrology structure diagnostics to debug outputs.
  - Items: `HS-OR-01`, `HS-OR-02`, `HS-OR-03`, `HS-OR-04`, `HS-OR-05`.
  - Type: behavior

- `S6`
  - Goal: align ADR, normative, and user-facing docs with adopted policy.
  - Items: `HS-GV-01`, `HS-GV-02`, `HS-GV-03`, `HS-GV-04`.
  - Type: behavior
