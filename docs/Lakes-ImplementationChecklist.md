# Lakes Implementation Checklist (from lakesProposal)

Status: proposed  
Scope: implement basin-based lake classification and overflow behavior so basin role (`sink` vs `overflow carrier`) is determined before stream routing.

## Atomic Items

- [LKC-01][test] Convert current lake synthetic tests to production-path acceptance tests (no helper-only self-fulfilling accounting assertions).
- [LKC-02][test] Add a fail-first gate: run acceptance tests against current production path and confirm they fail before lake implementation begins.  
  Depends on: `LKC-01`.
- [LKC-03][params] Add `params.hydrology.lakeFill.wetnessScale` with default `1.0` in [default-params.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/lib/default-params.ts).
- [LKC-04][params] Add schema/validation support for `params.hydrology.lakeFill.wetnessScale` in [read-params.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/io/read-params.ts) (finite, non-negative number).
- [LKC-05][pipeline] Add a dedicated lake-accounting stage module (for example `src/pipeline/derive-lake-accounting.ts`) that consumes shape, `h`, `FD_base/FA_base`, basin features, and params.
- [LKC-06][pipeline] In lake-accounting stage, build expanded `tiles(B)` membership for composite basins via child closure.
- [LKC-07][pipeline] Compute `externalInflow(B)` from strict-local boundary crossings only: count FD edges `u -> v` where `u ∉ tiles(B)` and `v ∈ tiles(B)`.
- [LKC-08][pipeline] Compute `spillCapacity(B) = sum(max(0, mergeH(B) - h(t)))` for each basin.
- [LKC-09][pipeline] Process basins bottom-up (children before parent) to compute `totalInflow`, `fillRatio`, `isFilled`, and `overflowExcess`.
- [LKC-10][pipeline] Implement edge handling rules in accounting stage: zero-capacity basins and root basins with no parent spill target.
- [LKC-11][pipeline] Keep accounting FD basis fixed to strict-local (`FD_base`), independent of stream routing mode.
- [LKC-12][pipeline] Integrate lake-accounting stage into generation pipeline before stream routing decisions are applied.
- [LKC-13][stream] Update stream routing decision point to use basin role from lake accounting:
  - `isFilled=false` => sink basin
  - `isFilled=true` => overflow carrier via `childSpillFromTileId -> parentContactTileId`.
- [LKC-14][output] Publish per-basin lake accounting fields in debug hydrology outputs (or adjacent debug artifact) using codebase nomenclature.
- [LKC-15][output] Publish per-tile lake depth output (`depth`, and optional `lakeBasinId`) in debug artifact wiring where appropriate.
- [LKC-16][cli] Update hydrology inspector surfaces/stats to report lake-accounting fields where available.
- [LKC-17][docs] Update [README.md](/mnt/c/workspace/projects/forest-terrain-generator/README.md) and [lakesProposal.md](/mnt/c/workspace/projects/forest-terrain-generator/docs/lakesProposal.md) to reflect implemented param names, outputs, and routing behavior.
- [LKC-19][test] Add deterministic repeatability assertions: same input and params must produce identical lake accounting outputs and basin role classifications across repeated runs; include tie-case fixtures.
- [LKC-20][test] Add routing guard assertions that overflow routing uses `childSpillFromTileId -> parentContactTileId` and never treats `spillOutTileId` as a routing target.
- [LKC-21][analysis] Add a wetness-scale calibration pass: run fixed seeds, inspect `fillRatio` distributions, and document selected default/range for `params.hydrology.lakeFill.wetnessScale`.
- [LKC-22][docs] Mark normalization-based alternative (`I'/C'`) as explicitly deferred/non-goal for v1 implementation in docs.
- [LKC-18][test] Run acceptance suite and require all lake acceptance tests to pass.  
  Depends on: `LKC-02`, `LKC-03`, `LKC-04`, `LKC-05`, `LKC-06`, `LKC-07`, `LKC-08`, `LKC-09`, `LKC-10`, `LKC-11`, `LKC-12`, `LKC-13`, `LKC-14`, `LKC-15`, `LKC-16`, `LKC-17`, `LKC-19`, `LKC-20`, `LKC-21`, `LKC-22`.

## Behavior Slices

### Slice 1

- Goal: enforce fail-first acceptance testing discipline before implementation.
- Items: `LKC-01`, `LKC-02`.
- Type: behavior

### Slice 2

- Goal: establish stable configuration contract for lake accounting.
- Items: `LKC-03`, `LKC-04`.
- Type: behavior

### Slice 3

- Goal: implement deterministic basin accounting math from topology + FD/FA.
- Items: `LKC-05`, `LKC-06`, `LKC-07`, `LKC-08`, `LKC-09`, `LKC-10`, `LKC-11`.
- Type: behavior

### Slice 4

- Goal: wire lake accounting into generation flow before stream routing.
- Items: `LKC-12`, `LKC-13`.
- Type: behavior

### Slice 5

- Goal: surface lake-accounting outputs for debugging and inspection.
- Items: `LKC-14`, `LKC-15`, `LKC-16`.
- Type: behavior

### Slice 6

- Goal: finalize docs and close with green acceptance tests.
- Items: `LKC-17`, `LKC-22`, `LKC-18`.
- Type: behavior

### Slice 7

- Goal: lock determinism and routing invariants, then calibrate wetness scale.
- Items: `LKC-19`, `LKC-20`, `LKC-21`.
- Type: behavior
