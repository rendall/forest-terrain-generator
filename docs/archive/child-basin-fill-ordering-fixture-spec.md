# Child-Basin Fill Ordering — Synthetic Fixture Spec

## Purpose

Define a deterministic reference fixture for lake-accounting tests that exercises:

- nested basins,
- sibling branches at multiple levels,
- child-to-parent spill metadata,
- and a single root basin.

## Topology

Required basin graph:

- `b_root` (`parentId: null`, `kind: composite`)
  - `b_A` (`kind: composite`)
    - `b_A1` (`kind: leaf`)
    - `b_A2` (`kind: leaf`)
  - `b_B` (`kind: leaf`)

Required properties:

- exactly one root,
- depth `>= 2`,
- at least one node with `>= 2` children,
- explicit `childSpillFromTileId` and `parentContactTileId` where parent links exist.

## Grid + Tile Assignment

- Use a compact deterministic grid (`5x5`).
- Assign distinct leaf tile sets:
  - `b_A1`: left-lower interior cluster,
  - `b_A2`: left-upper interior cluster,
  - `b_B`: right-side interior cluster.
- `b_A` contains bridge/rim tiles between `b_A1`/`b_A2` and root contact.
- `b_root` contains remaining outer/control tiles and top-level contact tiles.

Tile assignment constraints:

- every tile’s `tileFeatureIds` references existing basin ids only,
- child tiles include ancestor memberships in `tileFeatureIds`,
- expanded tile union of `b_root` equals all fixture tiles in scope.

## Elevation and Spill Capacity Constraints

- Pick `h` and `mergeH` so each basin has non-zero spill capacity.
- Keep capacities separated enough to show transitions across wetness sweep:
  - `k = [1, 0.5, 0.1, 0.01, 0.001, 0.0001]`.
- Avoid near-equality thresholds to reduce brittle floating-point assertions.

## Suitability Acceptance Criteria

Fixture is suitable only if all are true:

1. Structural invariants pass:
   - one root,
   - depth `>= 2`,
   - sibling parent exists.
2. Membership invariants pass:
   - no unknown basin id references,
   - root-expanded coverage matches expected scope.
3. Characterization sweep produces at least one `k` case with observable multi-level partial-fill behavior under current accounting.
4. Outputs are deterministic across repeated runs.
