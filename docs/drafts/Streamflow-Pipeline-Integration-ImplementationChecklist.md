# Streamflow Pipeline Integration Implementation Checklist

Status: v1-draft
Source plan: `docs/drafts/Streamflow-Pipeline-Integration-Plan.md`

- [x] [pipeline] `SPI-01` Create `src/pipeline/derive-hydrology.ts` exporting `deriveHydrology(shape, topographyH, topographicStructure, params)` that returns hydrology maps (`fd`, `fa`, `faN`, `isStream`) with deterministic ordering rules.
- [x] [pipeline] `SPI-02` Define and implement hydrology params parsing/validation for sink mode and FA threshold policy in pipeline-facing config, defaulting to `strict_local` sink handling and absolute `fa` thresholding.
- [x] [pipeline] `SPI-03` Implement `strict_local` sink mode in `deriveHydrology`, with sink termination at local minima and no spill continuation, using the same shared FD builder as `overflow_guided` (sink policy only changes how unresolved sinks are handled).
- [ ] [pipeline] `SPI-04` Implement optional `overflow_guided` sink mode in `deriveHydrology`, enabled via params and using a per-basin spill edge primitive `(spillFromTileId, spillToTileId)` (depends on `SPI-02`, `SPI-03`).
- [ ] [pipeline] `SPI-05` Implement deterministic tie-break selection for equal-height downhill candidates in `deriveHydrology` with invariant full-map priority: (1) lowest `h`, (2) smallest step distance to candidate (cardinal before diagonal), (3) tile index.
- [x] [pipeline] `SPI-06` Implement FA propagation in `deriveHydrology` using in-degree/topological processing, local contribution initialization of `1` per tile, and stable queue ordering within equal-priority nodes.
- [x] [pipeline] `SPI-07` Implement default stream extraction in `deriveHydrology` using absolute `fa` thresholding, with optional `faN`/quantile policy support behind params (depends on `SPI-02`, `SPI-06`).
- [ ] [pipeline] `SPI-08` Implement deterministic behavior for invalid or incomplete overflow metadata in `deriveHydrology` with per-tile fallback: if this tile's sink basin has no valid spill edge, emit `NONE` (strict_local behavior) for that tile while preserving run completion.
- [x] [app] `SPI-09` Integrate `deriveHydrology(...)` into `src/app/run-generator.ts` immediately after `deriveTopographicStructure(...)` and before envelope tile serialization.
- [ ] [io] `SPI-10` Extend debug artifact emission path to write hydrology internals (`fd`, `fa`, `fa-normalized`, `stream-mask`) for generated/derived runs without changing public tile schema.
- [x] [io] `SPI-11` Extend debug artifact emission path for debug `--input-file` runs so hydrology artifacts are produced from the loaded envelope using the same hydrology derivation logic.
- [x] [contract] `SPI-12` Preserve current envelope tile schema during Phase A/B/C (no hydrology fields added to public tile contract before the Phase C gate is complete).
- [x] [cli] `SPI-13` Keep `stream` behavior unchanged during hydrology pipeline integration.
- [x] [cli] `SPI-14` Introduce `hydrology-inspector` as a separate CLI (not a main-CLI subcommand) after approval, with a sink-mode flag to compare `strict_local` vs `overflow_guided` outputs.
- [ ] [governance] `SPI-15` Author a dedicated ADR immediately before Phase D to approve public hydrology schema exposure and migration/versioning policy.
- [ ] [invariant] `SPI-16` Enforce overflow edge invariant in hydrology implementation/docs: `spillFromTileId` is in-basin and `spillToTileId` is adjacent and outside basin; do not infer overflow from `spillTileId` membership.
- [ ] [cli] `SPI-17` Ensure `hydrology-inspector` can recompute hydrology maps from envelopes that do not contain precomputed hydrology outputs, while preferring pipeline maps when available.

## Behavior Slices

### Slice A
- Goal: Add deterministic core hydrology derivation with locked v1 defaults and explicit config plumbing.
- Items: `SPI-01`, `SPI-02`, `SPI-03`, `SPI-05`, `SPI-06`, `SPI-07`
- Type: behavior

### Slice B
- Goal: Add overflow-guided continuation with deterministic fallback behavior when metadata is incomplete.
- Items: `SPI-04`, `SPI-08`, `SPI-16`
- Type: behavior

### Slice C
- Goal: Wire hydrology derivation into generator/debug pipeline topology without public contract expansion.
- Items: `SPI-09`, `SPI-10`, `SPI-11`, `SPI-12`
- Type: behavior

### Slice D
- Goal: Preserve current stream tool and define separate inspector track.
- Items: `SPI-13`, `SPI-14`, `SPI-17`
- Type: behavior

### Slice E
- Goal: Gate public schema exposure with explicit governance.
- Items: `SPI-15`
- Type: mechanical

## Truth Pass (2026-03-02)

- Verified complete against current implementation: `SPI-01`, `SPI-02`, `SPI-03`, `SPI-06`, `SPI-07`, `SPI-09`, `SPI-11`, `SPI-12`, `SPI-13`, `SPI-14`.
- Verified incomplete/still open: `SPI-04`, `SPI-05`, `SPI-08`, `SPI-10`, `SPI-15`, `SPI-16`, `SPI-17`.
- `SPI-10` was reopened because debug output currently emits aggregated `hydrology.json` rather than separate artifacts (`fd.json`, `fa.json`, `fa-normalized.json`, `stream-mask.json`) described in the checklist/plan.
