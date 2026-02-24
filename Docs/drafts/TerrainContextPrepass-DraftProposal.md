**Draft Proposal: Terrain Context Prepass for Cohesive Landform Description (Discussion Draft)**

## 1. Objective

Build a deterministic pre-description pass that identifies larger terrain context from local heights, with flat regions as anchors.

This pass should let description say coherent things like:
- a tile is part of a hilltop flat, basin floor, valley floor, or vale-like flat;
- adjacent non-flat tiles belong to the same hill system around that flat region;
- slope/rise/fall wording is grounded in neighbor elevation, not only per-tile slope orientation.

## 2. Why this is needed

Current landform labels are tile-local and can be correct but still read incoherently across nearby tiles.  
Main failure mode: local `flat/slope/ridge/valley/basin` does not capture region-level shape.

## 3. Scope

This proposal is for analysis + structured-context output, not prose merging policy.

In scope:
1. Detect contiguous flat regions.
2. Classify each flat region by boundary rise/fall behavior.
3. Grow adjacent slope domains tied to each flat region.
4. Attach deterministic context to each tile for later sentence rendering.

Out of scope:
1. Rewriting terrain generation itself.
2. Final stylistic prose composition.
3. Visibility radius model implementation (separate issue).

## 4. Terminology

1. `Flat tile`: tile with local landform `flat` (or equivalent threshold).
2. `Flat region`: contiguous component of flat tiles (8-neighbor connectivity).
3. `Boundary neighbor`: non-region tile adjacent to at least one region tile.
4. `Ascending boundary neighbor`: boundary neighbor higher than adjacent region edge by `eps`.
5. `Descending boundary neighbor`: boundary neighbor lower than adjacent region edge by `eps`.
6. `Domain`: outward flood grown from boundary seeds under monotonic elevation rule.
7. `Region class`: `hilltop_flat | basin_floor | valley_floor | vale_floor | neutral_flat`.

## 5. Proposed outputs

Add a context artifact (in-memory and optionally structured debug), keyed by tile coordinate.

Per region:
1. `regionId: number`
2. `tiles: Coord[]`
3. `heightMin: number`
4. `heightMax: number`
5. `boundaryAscending: Coord[]`
6. `boundaryDescending: Coord[]`
7. `boundaryLevel: Coord[]`
8. `ascendingDomain: Coord[]`
9. `descendingDomain: Coord[]`
10. `classification: RegionClass`
11. `principalAxis: Direction | null` (for valley-floor interpretation)

Per tile:
1. `flatRegionId: number | null`
2. `terrainRegionClass: RegionClass | null`
3. `slopeOwnerRegionId: number | null` (if non-flat tile assigned to a nearby flat region domain)
4. `localRiseDirs: Direction[]`
5. `localFallDirs: Direction[]`

## 6. Core algorithm

### Step A: Build flat components
1. Read local landform map.
2. Mark tiles with `landform == flat` as flat mask.
3. Run deterministic connected-component labeling on flat mask with 8-neighbor adjacency.
4. Determinism rule: scan tiles row-major `(y asc, x asc)` and BFS neighbors in canonical direction order `N, NE, E, SE, S, SW, W, NW`.

### Step B: Extract boundary neighbors and classify edge relation
1. For each region tile, inspect 8 neighbors outside the region.
2. For each region-boundary adjacency, compute `delta = h_neighbor - h_region_tile`.
3. Assign relation:
- `ascending` if `delta > eps`
- `descending` if `delta < -eps`
- `level` otherwise
4. Store unique boundary coords in insertion order from deterministic scan.
5. Aggregate counts and weighted means.

### Step C: Flood domains from boundary seeds
1. `ascendingDomain` starts from ascending boundary neighbors.
2. `descendingDomain` starts from descending boundary neighbors.
3. Flood rule for ascending domain:
- move to neighbor if `h_next >= h_current - stepTol`
- and tile is not in flat region
- and not already visited by this domain
4. Flood rule for descending domain:
- move to neighbor if `h_next <= h_current + stepTol`
- and tile is not in flat region
- and not already visited by this domain
5. Stop flood at map bounds.
6. Tie ownership for non-flat tile reached by multiple regions:
- choose region with minimal geodesic distance from seed;
- tie-break by lower `regionId`.

### Step D: Region classification
Use boundary + domain metrics.

Primary metrics:
1. `ascRatio = ascCount / boundaryCount`
2. `descRatio = descCount / boundaryCount`
3. `openGapCount`: number of contiguous boundary arcs where relation is `descending|level` and arc length >= `k`
4. `domainBalance = |ascendingDomain| - |descendingDomain|`

Initial deterministic rules:
1. If `descRatio >= 0.70` and `ascRatio <= 0.15`, classify `hilltop_flat`.
2. If `ascRatio >= 0.75` and `openGapCount <= 1`, classify `basin_floor`.
3. If `ascRatio >= 0.60` and `openGapCount >= 2`, classify `valley_floor`.
4. If `ascRatio >= 0.40` and `descRatio >= 0.20`, classify `vale_floor`.
5. Else classify `neutral_flat`.

### Step E: Valley vs basin axis inference
For non-hilltop low regions:
1. Build boundary directional histogram from region centroid.
2. Find principal low openings from `descending|level` arcs.
3. If two dominant openings are roughly opposite, keep `valley_floor`.
4. If no strong opposite pair and enclosure remains high, keep `basin_floor`.

### Step F: Per-tile local rise/fall directions
For each tile:
1. Compare neighbors to tile height with same `eps`.
2. Build `localRiseDirs` and `localFallDirs`.
3. This supports slope slot text such as "land rises to..." or "falls away to...".

## 7. Parameters (discussion defaults)

1. `eps = 0.008` elevation units (noise tolerance).
2. `stepTol = 0.004` for monotonic domain flood.
3. `k = 2` minimum boundary arc length for open-gap detection.
4. Domain flood max depth optional safety cap `maxSteps = 2048` per region (debug guard only).

These are placeholders and should be tuned against real map distributions.

## 8. Determinism requirements

1. All scans row-major.
2. All neighbor iteration in fixed ring order.
3. No hash iteration dependence for output order.
4. All ties resolved by explicit rule (`distance`, then `regionId`, then coord order).
5. Region IDs assigned in first-seen scan order.

## 9. Integration plan with description pipeline

Phase 1 integration:
1. Compute terrain context in `run-describe` before calling `generateRawDescription`.
2. Attach context into `DescriptionTileInput` as optional fields.
3. Do not yet rewrite prose slots globally.
4. Expose context in structured output for inspection.

Phase 2 integration:
1. Landform slot may prefer region class when stronger than tile-local landform.
2. Slope slot may use `localRiseDirs/localFallDirs`.
3. Movement/slope continuity can reference shared region IDs.

## 10. Example interpretation

If a flat region has:
1. mostly ascending boundary neighbors,
2. little descending boundary,
3. weak opposite openings,

then classify as `basin_floor`.

If it has:
1. ascending flanks,
2. clear opposite openings along one axis,

then classify as `valley_floor`.

If a flat region has descending boundary on nearly all sides, classify as `hilltop_flat`.

## 11. Main failure risks (devil points)

1. **Noise sensitivity**: small `eps` creates spurious rise/fall flips.
2. **Overflooding**: monotonic flood can consume too much terrain without additional slope/curvature guard.
3. **Boundary ambiguity**: tiny regions near edges can look like false basins or false hilltops.
4. **Plateau chains**: adjacent flat components separated by tiny non-flat seams may be semantically one region.
5. **Ownership conflicts**: a slope tile can legitimately relate to multiple nearby regions.

## 12. Mitigations

1. Tune `eps` from distribution percentiles, not guesswork alone.
2. Add optional curvature/slope guard in flood expansion when needed.
3. Treat small regions below size threshold as `neutral_flat` unless strong signal.
4. Optionally merge neighboring flat components if seam gradient is below seam threshold.
5. Keep `secondaryOwnerRegionIds` in debug for ambiguity auditing.

## 13. Test plan

1. Synthetic maps:
- ideal hilltop plateau,
- enclosed basin,
- elongated valley floor,
- mixed vale.
2. Property tests:
- deterministic IDs across repeated runs,
- classification stable under map serialization order.
3. Regression fixtures from `forest.json` subsets:
- verify no contradictory neighboring classifications.
4. Performance:
- linear-ish scaling with tile count;
- verify no pathological flood runtime.

## 14. Implementation phases

1. Phase A: component extraction + boundary metrics + region classification.
2. Phase B: domain flooding + tile ownership.
3. Phase C: structured output exposure and diagnostics.
4. Phase D: selective slot consumption in descriptions.

## 15. Decisions to make before implementation

1. Exact `eps` and step tolerances.
2. Minimum flat region size for strong classification.
3. Whether to classify tiny edge regions at all.
4. Whether to allow multi-owner slope tiles or force single owner.
5. Whether `vale_floor` should remain explicit or collapse into `neutral_flat`.

---

If this shape matches your intent, next step is to convert this into a checklist draft in `docs/drafts` with concrete function names and file targets.
