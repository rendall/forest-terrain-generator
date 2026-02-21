# Forest Terrain Generator — Implementation Plan & Checklist

This document turns the v1 specification into an executable implementation plan with a practical checklist.

## 1) Milestones

- [ ] **M1: Project scaffolding and data contracts**
- [ ] **M2: Input validation and deterministic base map handling**
- [ ] **M3: Topography derivations**
- [ ] **M4: Hydrology derivations**
- [ ] **M5: Biome, vegetation, and ground attributes**
- [ ] **M6: Navigation and movement systems**
- [ ] **M7: Output envelope and debug exports**
- [ ] **M8: Verification, determinism tests, and documentation**

## 2) Detailed Plan by Milestone

### M1: Project scaffolding and data contracts

**Goal:** establish code structure and shared types that mirror the spec.

- [ ] Define core types: `TileCoord`, `Dir8`, map grids, and tile payload schema.
- [ ] Implement canonical row-major tile iterator helper.
- [ ] Implement canonical Dir8 neighbor enumeration helper (`E, SE, S, SW, W, NW, N, NE`).
- [ ] Add deterministic queue ordering utility for Dijkstra tuple `(cost, y, x, dir)`.
- [ ] Create module boundaries:
  - [ ] `input`
  - [ ] `base_maps`
  - [ ] `topography`
  - [ ] `hydrology`
  - [ ] `vegetation`
  - [ ] `ground`
  - [ ] `navigation`
  - [ ] `output`

### M2: Input validation and deterministic base map handling

**Goal:** accept required inputs and normalize map ingestion/generation behavior.

- [ ] Parse required inputs: `seed`, `width`, `height`, `params`.
- [ ] Add operational modes: `generate`, `derive`, `debug`.
- [ ] Implement precedence: CLI args > param file > defaults.
- [ ] Validate dimensions and ranges:
  - [ ] `width`, `height` positive
  - [ ] map dimensions equal when authored maps are provided
  - [ ] map values clamped or rejected per validation policy
- [ ] Implement `subSeed(seed, mapId, octaveIndex)` for deterministic map noise.
- [ ] Wire authored map override logic for H/R/V.
- [ ] Implement exit code handling contract (`0,2,3,4,5`).

### M3: Topography derivations

**Goal:** produce deterministic terrain-shape descriptors.

- [ ] Implement slope magnitude derivation with clamped boundary sampling.
- [ ] Implement aspect derivation in degrees `[0,360)` with spec orientation.
- [ ] Implement landform classification with deterministic threshold ordering.
- [ ] Add unit tests for known synthetic map cases.

### M4: Hydrology derivations

**Goal:** compute flow and moisture signals from elevation and roughness context.

- [ ] Implement flow direction (`FD`) using deterministic tie-break rules.
- [ ] Implement flow accumulation (`FA`) with canonical traversal behavior.
- [ ] Compute normalized accumulation (`FA_N`).
- [ ] Derive lake mask from accumulation/elevation criteria.
- [ ] Generate stream/water classes based on thresholds.
- [ ] Implement water-distance BFS (`distWater`) using canonical multi-source queue ordering.
- [ ] Derive moisture using water proximity, accumulation, and roughness/elevation modifiers.
- [ ] Add regression fixtures for deterministic hydrology output.

### M5: Biome, vegetation, and ground attributes

**Goal:** classify ecological and footing properties per tile.

- [ ] Implement biome classification from moisture/elevation/variance.
- [ ] Derive `TreeDensity` and `CanopyCover` from biome + vegetation variance.
- [ ] Derive `VisibilityBaseMeters` from canopy + undergrowth assumptions.
- [ ] Classify `SoilType` and `Firmness` from moisture + landform.
- [ ] Derive `SurfaceFlags` and `FeatureFlags` deterministically.

### M6: Navigation and movement systems

**Goal:** produce movement semantics and directional passability.

- [ ] Compute base `MoveCost` from slope, soil firmness, obstruction, and water class.
- [ ] Derive directional `Passability[x,y,dir]` with boundary and non-playable constraints.
- [ ] Mark `FollowableFlags` (game trails, stream-follow hints, etc.).
- [ ] Implement trail routing via deterministic Dijkstra ordering.
- [ ] Compute `OrientationReliability` as informational-only output.

### M7: Output envelope and debug exports

**Goal:** emit a stable, machine-readable output contract for downstream tooling.

- [ ] Implement versioned JSON envelope with metadata and full `tiles` array.
- [ ] Include all required derived fields per tile.
- [ ] Add debug raster export in `debug` mode for major maps.
- [ ] Ensure reproducible output ordering by row-major tile serialization.

### M8: Verification, determinism tests, and documentation

**Goal:** lock in correctness and reproducibility.

- [ ] Golden test: same input produces identical output across repeated runs.
- [ ] Tie-break test coverage for FD, BFS, and Dijkstra ordering.
- [ ] Input validation tests for shape mismatch and invalid params.
- [ ] Add performance smoke test for representative large grid.
- [ ] Document limitations (v1 excludes cross-language byte-identical parity).
- [ ] Produce implementation notes for content pipeline consumers.

## 3) Definition of Done (DoD)

A release candidate is complete when all items below are true:

- [ ] All milestone checkboxes are complete.
- [ ] Determinism tests pass reliably in CI.
- [ ] Output JSON validates against schema and includes all required tile fields.
- [ ] Non-playable boundary behavior is enforced and tested.
- [ ] Canonical traversal/ordering constraints are explicitly validated.
- [ ] README references both spec and this implementation plan.

## 4) Suggested Execution Order (2-week sprints)

- **Sprint 1:** M1 + M2
- **Sprint 2:** M3 + M4
- **Sprint 3:** M5 + M6
- **Sprint 4:** M7 + M8 + hardening

## 5) Risks and Mitigations

- **Risk:** nondeterminism from map/set iteration.
  - **Mitigation:** centralize ordering helpers and prohibit unordered traversal in core algorithms.
- **Risk:** hidden tie behavior in floating-point comparisons.
  - **Mitigation:** use explicit epsilon/tie policies and test edge cases.
- **Risk:** scope creep into prose/content generation.
  - **Mitigation:** keep deliverable constrained to terrain dataset production for v1.
