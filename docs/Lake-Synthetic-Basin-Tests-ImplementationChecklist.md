# Lake Synthetic Basin Tests - Implementation Checklist

Status: proposed
Scope: add deterministic artificial basin tests for lake fill/overflow behavior.

## Atomic Items

- [x] [test] Add `test/unit/lake-accounting.test.mjs` for basin-level accounting using synthetic basin graphs and fixed `externalInflow` inputs.
- [x] [test] Add `test/unit/lake-inflow-boundary.test.mjs` for strict-local boundary-crossing inflow accounting on explicit tiny grids.
- [x] [test] Add `test/unit/lake-topology-synthetic.test.mjs` for synthetic topology edge-cases needed by lake routing (spill edge ownership, flat minima grouping).
- [x] [test] Add shared fixture helpers in `test/unit/helpers/lake-fixtures.mjs` for row-major grid creation and basin node builders.
- [x] [test] In `lake-accounting.test.mjs`, add case `LA-01 closed_bowl_dry_sink` with expected `isFilled=false`, `overflowExcess=0`.
- [x] [test] In `lake-accounting.test.mjs`, add case `LA-02 closed_bowl_wet_terminal_root` with expected `isFilled=true`, positive overflow, terminal root classification.
- [x] [test] In `lake-accounting.test.mjs`, add case `LA-03 leaf_fills_and_overflows_to_parent` with expected child overflow propagation into parent `totalInflow`.
- [x] [test] In `lake-accounting.test.mjs`, add case `LA-04 leaf_not_filled_stays_sink` with expected child overflow `0`.
- [x] [test] In `lake-accounting.test.mjs`, add case `LA-05 parent_double_count_guard` to assert `totalInflow(parent)=externalInflow(parent)+sum(child overflowExcess)` only.
- [x] [test] In `lake-inflow-boundary.test.mjs`, add case `LB-01 outside_of_tiles_boundary_rule` asserting only edges `u not-in tiles(B)` and `v in tiles(B)` contribute.
- [x] [test] In `lake-inflow-boundary.test.mjs`, add case `LB-02 child_to_parent_crossing_not_external` asserting parent external inflow excludes child->parent internal crossings.
- [x] [test] In `lake-topology-synthetic.test.mjs`, add case `LT-01 flat_bottom_multi_tile_leaf` asserting adjacent equal-height minima remain one leaf basin.
- [x] [test] In `lake-topology-synthetic.test.mjs`, add case `LT-02 invalid_spill_edge_non_root` asserting deterministic failure/fallback when `childSpillFromTileId` is missing or out-of-basin.
- [x] [test] Add an integration smoke test in `test/integration/lake-synthetic-basins.test.mjs` that validates the complete accounting contract on one multi-basin synthetic fixture.

## Canonical Fixtures

### LA-01 closed_bowl_dry_sink

- Purpose: dry sink behavior with no supply.
- Accounting input:
  - `k = 1`
  - Basin `b0`: `mergeH=1.0`, tile heights `[0.2, 0.3]`, no children, `externalInflow=0.0`
- Expected:
  - `spillCapacity = 1.5`
  - `totalInflow = 0.0`
  - `fillRatio = 0.0`
  - `isFilled = false`
  - `overflowExcess = 0.0`

### LA-02 closed_bowl_wet_terminal_root

- Purpose: root basin can fill but still terminates without parent outlet.
- Accounting input:
  - `k = 1`
  - Basin `b0` (root): `mergeH=1.0`, tile heights `[0.1, 0.2]`, no children, `externalInflow=2.0`
- Expected:
  - `spillCapacity = 1.7`
  - `totalInflow = 2.0`
  - `isFilled = true`
  - `overflowExcess = 0.3`
  - Terminal reason/classification: root terminal (no parent spill target)

### LA-03 leaf_fills_and_overflows_to_parent

- Purpose: child overflow moves upward exactly once.
- Accounting input:
  - `k = 1`
  - Child `b_leaf`: `mergeH=1.0`, tile heights `[0.1, 0.9]`, `externalInflow=1.2`
  - Parent `b_parent`: `mergeH=1.0`, tile heights `[0.2, 0.6]`, `externalInflow=0.1`, child=`b_leaf`
- Expected:
  - `b_leaf spillCapacity = 1.0`, `overflowExcess = 0.2`
  - `b_parent totalInflow = 0.1 + 0.2 = 0.3`
  - `b_parent spillCapacity = 1.2`
  - `b_parent isFilled = false`

### LA-04 leaf_not_filled_stays_sink

- Purpose: non-filled leaf contributes no overflow.
- Accounting input:
  - Same structure as LA-03 but `b_leaf externalInflow=0.7`
- Expected:
  - `b_leaf spillCapacity = 1.0`
  - `b_leaf isFilled = false`
  - `b_leaf overflowExcess = 0.0`
  - `b_parent totalInflow = externalInflow(parent)` only

### LA-05 parent_double_count_guard

- Purpose: prevent child spill contributions from being counted as parent external inflow.
- Accounting input:
  - Parent `b_parent externalInflow=0.5`
  - Children overflow results: `b_a overflowExcess=0.7`, `b_b overflowExcess=0.2`
- Expected:
  - `totalInflow(parent) = 1.4` exactly
  - Not equal to any value that also re-adds child->parent crossing FA

### LB-01 outside_of_tiles_boundary_rule

- Purpose: external inflow must come from outside tile set boundary crossings only.
- Grid:
  - shape `3x1`
  - `h = [0.9, 0.5, 0.1]` (row-major)
  - strict-local FD edges: `0->1`, `1->2`, `2->NONE`
  - basin `B` tiles: `{2}`
- Expected:
  - Only edge `1->2` contributes to `externalInflow(B)`
  - With strict-local FA, contribution source is tile `1`

### LB-02 child_to_parent_crossing_not_external

- Purpose: parent external inflow excludes internal child->parent transitions.
- Grid:
  - shape `3x1`
  - `h = [0.9, 0.5, 0.1]`
  - FD edges: `0->1`, `1->2`
  - child basin tiles `{1}`
  - parent composite tiles `{1,2}`
- Expected:
  - Edge `1->2` is internal to parent tile set, not external for parent
  - Parent external inflow counts only `0->1` contribution

### LT-01 flat_bottom_multi_tile_leaf

- Purpose: adjacent equal minima should not split into artificial multiple leaf basins.
- Grid:
  - shape `3x2`
  - `h = [1.0, 1.0, 1.0, 1.0, 0.0, 0.0]`
- Expected:
  - One leaf basin contains both low adjacent tiles (indices `4` and `5`)
  - No duplicate leaf minima for the same connected flat

### LT-02 invalid_spill_edge_non_root

- Purpose: metadata safety for overflow routing prerequisites.
- Basin input:
  - non-root basin with `childSpillFromTileId` missing or not in basin tile set
- Expected:
  - deterministic failure/fallback classification
  - no silent overflow application

## Behavior Slices

### Slice 1

- Goal: lock basin-level lake accounting semantics before topology/FD coupling.
- Items: `[test] Add test/unit/lake-accounting.test.mjs`, `LA-01`, `LA-02`, `LA-03`, `LA-04`, `LA-05`.
- Type: behavior

### Slice 2

- Goal: lock strict-local boundary inflow semantics and double-count guard.
- Items: `[test] Add test/unit/lake-inflow-boundary.test.mjs`, `LB-01`, `LB-02`.
- Type: behavior

### Slice 3

- Goal: lock topology prerequisites used by lake routing.
- Items: `[test] Add test/unit/lake-topology-synthetic.test.mjs`, `LT-01`, `LT-02`.
- Type: behavior

### Slice 4

- Goal: provide one full-pipeline synthetic smoke check.
- Items: `[test] Add test/integration/lake-synthetic-basins.test.mjs`.
- Type: behavior

### Slice 5

- Goal: keep fixture setup deterministic and reusable.
- Items: `[test] Add test/unit/helpers/lake-fixtures.mjs`.
- Type: mechanical
