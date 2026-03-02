# Streamflow Pipeline Integration Implementation Checklist

Status: v1-draft
Source plan: `docs/drafts/Streamflow-Pipeline-Integration-Plan.md`

- [ ] [pipeline] `SPI-01` Create `src/pipeline/derive-hydrology.ts` exporting `deriveHydrology(shape, topographyH, topographicStructure, params)` that returns hydrology maps (`fd`, `fa`, `faN`, `isStream`) with deterministic ordering rules.
- [ ] [pipeline] `SPI-02` Implement `strict_local` sink mode as the default in `deriveHydrology`, with sink termination at local minima and no spill continuation.
- [ ] [pipeline] `SPI-03` Implement optional `overflow_guided` sink mode in `deriveHydrology`, enabled via hydrology params and using basin spill/parent-contact relationships from topographic structure outputs.
- [ ] [pipeline] `SPI-04` Implement deterministic tie-break selection for equal-height downhill candidates in `deriveHydrology` with priority: (1) in direction of flow, (2) toward map center, (3) tile index.
- [ ] [pipeline] `SPI-05` Implement FA propagation in `deriveHydrology` using in-degree/topological processing and local contribution initialization of `1` per tile.
- [ ] [pipeline] `SPI-06` Implement default stream extraction in `deriveHydrology` using absolute `fa` thresholding, with optional `faN`/quantile policy support behind params.
- [ ] [app] `SPI-07` Integrate `deriveHydrology(...)` into `src/app/run-generator.ts` immediately after `deriveTopographicStructure(...)` and before envelope tile serialization.
- [ ] [io] `SPI-08` Extend debug artifact emission path (existing debug output flow) to write hydrology internals (`fd`, `fa`, `fa-normalized`, `stream-mask`) without changing public tile schema.
- [ ] [contract] `SPI-09` Preserve current envelope tile schema during Phase A/B/C (no hydrology fields added to public tile contract before Phase D gate).
- [ ] [cli] `SPI-10` Keep `stream` behavior unchanged during hydrology pipeline integration.
- [ ] [cli] `SPI-11` Introduce `hydrology-inspector` as a separate CLI (not a main-CLI subcommand) after approval, with a sink-mode flag to compare `strict_local` vs `overflow_guided` outputs.
- [ ] [governance] `SPI-12` Author a dedicated ADR immediately before Phase D to approve public hydrology schema exposure and migration/versioning policy.

## Behavior Slices

### Slice A
- Goal: Add deterministic core hydrology derivation with locked v1 defaults.
- Items: `SPI-01`, `SPI-02`, `SPI-04`, `SPI-05`, `SPI-06`
- Type: behavior

### Slice B
- Goal: Add optional overflow-guided continuation while preserving default strict-local behavior.
- Items: `SPI-03`
- Type: behavior

### Slice C
- Goal: Wire hydrology derivation into generator pipeline topology without public contract expansion.
- Items: `SPI-07`, `SPI-08`, `SPI-09`
- Type: behavior

### Slice D
- Goal: Preserve current stream tool and define separate inspector track.
- Items: `SPI-10`, `SPI-11`
- Type: behavior

### Slice E
- Goal: Gate public schema exposure with explicit governance.
- Items: `SPI-12`
- Type: mechanical
