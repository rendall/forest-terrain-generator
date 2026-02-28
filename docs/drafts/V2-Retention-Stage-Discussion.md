# V2 Retention Stage Discussion (Exploratory)

Status: exploratory discussion (no implementation commitment)  
Scope: frame the question, problem fit, and conceptual design space  
Last updated: 2026-02-28

References:

1. `docs/drafts/V2-Simulation-Repair-ProblemStatement.md`
2. `docs/drafts/V2-Simulation-Repair-ProposedSolutions.md`
3. `docs/drafts/V2-Biome-Distribution-ImplementationPlan.md`
4. `src/pipeline/classify-landform.ts`
5. `src/pipeline/hydrology.ts`
6. `src/pipeline/ecology.ts`

## 1. Question

Should the simulation introduce a dedicated retention/persistence stage (between hydrology and ecology) so biomes can distinguish transient wetness from persistent saturation?

This document is for discussion only. It does not propose immediate implementation.

## 2. Problem Fit

Current observed risk:

1. Biome assignment can over-rely on single-pass moisture and collapse toward one dominant biome.
2. Single-pass moisture identifies where water is present/flows, but not where saturation is persistent enough to support peat-forming conditions.
3. Relative terrain features (concavity/hollows) are sensitive to scale choice; single-scale local checks can be arbitrary and unstable.

Potential value of a retention stage:

1. Separate "wet because water passes through" from "wet because water stays."
2. Provide stable ecology inputs for bog/swamp versus wet-forest differentiation.
3. Improve explainability of biome predicates without replacing hydrology.

## 3. What Problem Would It Solve (If Adopted)

Target outcomes:

1. Reduce biome distribution collapse by adding independent ecological drivers.
2. Improve wetland realism by requiring persistent wetness signals, not only high moisture.
3. Make biome predicates more defensible via explicit, inspectable intermediate fields.

Non-goals:

1. Full physical hydrodynamics simulation.
2. Replacing normalized hydrology/topography core fields.
3. Immediate taxonomy redesign beyond already tracked decisions.

## 4. Conceptual Model Options

### Option A: Proxy Retention Index (lowest complexity)

1. Derive `retentionIndex` from existing deterministic signals:
   - high `faN`
   - low `slopeMag`
   - concave/topographic-position indicators (multi-scale)
2. Optional formula family:
   - multiplicative or weighted blend with clamp to `[0,1]`
3. No hydrology feedback loop.

Pros:

1. Low complexity and fast.
2. Deterministic and easy to inspect.

Cons:

1. Proxy quality depends on feature design and scale choices.

### Option B: Iterative Relaxation (moderate complexity)

1. Run a small fixed number of deterministic retention iterations.
2. Each pass adjusts wetness tendency using low-slope/concave retention bias.
3. Output chronic wetness estimate after `N` passes.

Pros:

1. Better separation of persistent versus transient wetness.

Cons:

1. More parameters and behavior coupling.
2. Harder to reason about than direct proxy fields.

### Option C: Time-Step Rainfall/Evaporation Memory (highest complexity)

1. Simulate repeated rainfall-routing-evaporation cycles.
2. Track fraction of steps above saturation (`wetDuration`).

Pros:

1. Strong ecological interpretability.

Cons:

1. Large complexity increase.
2. Likely out of scope for current repair track.

## 5. Scale and "Arbitrary Concavity" Concern

Principle:

1. Avoid single-neighborhood concavity as a universal truth.
2. If used, derive position/concavity at explicit physical scales (meters), not arbitrary fixed cell counts.
3. Prefer multi-scale descriptors over one local descriptor.

Implication:

1. Any adopted retention design should state scale semantics explicitly in params and docs.

## 6. Hypothetical Pipeline Placement

If adopted, conceptual order would be:

1. Topography
2. Hydrology
3. Retention/Persistence derivation (new intermediate stage)
4. Ecology/biome assignment

Rationale:

1. Retention should consume hydrology outputs.
2. Ecology should consume retention as one of its drivers.

## 7. Candidate Outputs (Discussion Only)

Possible intermediate fields:

1. `retentionIndex` in `[0,1]`
2. `wetPersistence` in `[0,1]`
3. Optional `substratePotential` classification/score

These fields would be ecology inputs, not direct biome decisions.

## 8. Determinism and Seeds

Determinism policy (if adopted):

1. Multi-pass or iterative models can still be deterministic.
2. Determinism requires fixed iteration count, fixed traversal order, fixed tie-break rules, and fixed parameters.
3. Different seeds should still produce different landscapes; same seed/inputs should reproduce exactly.

## 9. Risks

1. Added model complexity without measurable gain.
2. Overfitting predicates to synthetic fixtures.
3. Coupling drift between hydrology and ecology responsibilities.
4. Parameter-surface bloat.

## 10. Decision Criteria

Adoption should require clear evidence that:

1. It reduces biome-collapse failure modes better than predicate/threshold tuning alone.
2. It improves wetland differentiation in a deterministic and explainable way.
3. It does not regress stream/lake coherence contracts.
4. It remains tractable for users (defaults + understandable params).

## 11. Open Questions

1. Is proxy retention (Option A) sufficient for this track, or is iteration required?
2. What minimum set of derived fields provides useful separation without over-design?
3. Which scale policy is acceptable for concavity/topographic position features?
4. Should retention outputs be exposed in debug artifacts by default?
5. If adopted, should this be feature-gated for rollout compatibility?

## 12. Next Step (Discussion Path)

1. Review this document and decide whether to pursue a formal proposal.
2. If yes, create a dedicated plan with explicit invariants, parameters, and acceptance metrics.
3. If no, continue with biome-model improvements that do not add a new stage.

## 13. Candidate Algorithm Contract (Discussion Draft)

This section records a specific deterministic candidate for basin-structure detection that does not assume boundary outlet behavior.

### 13.1 Method: Sublevel-Set Sweep with DSU (0D Merge Tree)

1. Sort tiles by `(h asc, rowMajorIndex asc)`.
2. Sweep in groups of equal (or epsilon-equal) height level `L`.
3. Activate all tiles at `L`; each starts as its own DSU component.
4. Union each activated tile with active Dir8 neighbors.
5. When two components merge at level `L`, record spill/merge level for the losing minimum component.

Interpretation:

1. A component is "born" at its minimum height.
2. It "dies" (ceases independent identity) when it merges into a component with a better minimum.
3. Persistence is `spillH - minH`.

### 13.2 Determinism Requirements

1. Neighbor set: Dir8 (fixed canonical order).
2. Tile traversal: row-major where needed for ties.
3. Equal-height grouping: use explicit `hEps`.
4. Better-minimum rule:
   - lower `minH` wins;
   - if equal within `hEps`, lower `minIdx` wins.
5. DSU union and metadata propagation must be deterministic under ties.

### 13.3 Component Metadata (Per DSU Root)

1. `minH[root]`: minimum height of component.
2. `minIdx[root]`: row-major index of winning minimum tile.
3. `spillH[root]`: first merge level where component loses independence.
   - initialize as `NaN` / unset.
4. Optional:
   - `size[root]`
   - stable `basinLabel[root] = minIdx[root]`.

### 13.4 Merge Rule (At Level `L`)

Given two distinct roots `ra`, `rb`:

1. Determine winner `rw` and loser `rl` via better-minimum rule.
2. If `spillH[rl]` is unset, set `spillH[rl] = L`.
3. Union components.
4. Carry winner minimum metadata forward:
   - `minH[newRoot] = minH[rw]`
   - `minIdx[newRoot] = minIdx[rw]`.
5. Preserve winner spill status unchanged.

### 13.5 Derived Basin Signals

Per basin minimum/component:

1. `persistence = spillH - minH` (when `spillH` is set).
2. If `spillH` is unset, treat as unresolved/ultimate component under current domain policy.

Per tile:

1. `basinMinIdx` (label of its associated minimum component).
2. `basinPersistence` (persistence of that basin).
3. Optional `depthLike = max(0, spillH[basin] - h[tile])` when `spillH` is set.

### 13.5.1 Worked Merge Example (A/B -> C)

Assume two disconnected components:

1. Component `A` has `minH(A) = 0.0`.
2. Component `B` has `minH(B) = 0.1`.
3. At sweep level `L = 0.2`, they first become connected and merge.

Merge interpretation:

1. `A` wins (better minimum: lower `minH`).
2. `B` loses independence at this merge level:
   - `spillH(B) = 0.2`
   - `persistence(B) = spillH(B) - minH(B) = 0.2 - 0.1 = 0.1`
3. The merged active set is now one DSU component (`C`) carrying the winner lineage (`A` minimum metadata).
4. `A` remains unresolved until it later loses in a higher-level merge (or remains unresolved under chosen domain policy).

Practical meaning:

1. `B` is a sub-basin that spills into `A` at level `0.2`.
2. Lower persistence indicates a weaker/noisier basin candidate.
3. Higher persistence indicates stronger structural basin-ness for retention/ecology signals.

### 13.6 Non-Assumptions and Scope Limits

1. No assumption that map boundary is an outlet.
2. No rainfall/evaporation time simulation in this method.
3. Output is structural basin-ness/persistence, not full hydrodynamic water volume.

### 13.7 Discussion Parameters (If Pursued)

1. `retention.hEps`
2. `retention.connectivity` (`dir8` in this draft)
3. `retention.persistenceMin` (threshold for "meaningful basin")
4. `retention.unresolvedSpillPolicy` (`nan` / sentinel / capped value)

## 14. `depthLike` Discussion (How to Use It)

### 14.1 Definition

For a tile assigned to basin `b`:

1. `depthLike(tile) = max(0, spillH(b) - h(tile))`
2. This is only directly meaningful when `spillH(b)` is resolved.

Interpretation:

1. `depthLike` measures how far below that basin's spill level the tile lies.
2. It is a structural "headroom to spill" proxy.

### 14.2 What `depthLike` Is and Is Not

Useful as:

1. A ranking signal for basin interior versus basin margin.
2. A contributor to chronic-wetness/retention scoring.
3. A way to bias wetland core identification toward deeper basin zones.

Not equivalent to:

1. Instantaneous water depth.
2. Simulated lake/pool depth under rainfall.
3. Full hydrodynamic volume or residence time.

### 14.3 Recommended Usage Pattern

1. Use `depthLike` as a modulator with persistence and slope, not as a standalone gate.
2. Typical composition:
   - high `basinPersistence`
   - low `slopeMag`
   - sufficient `depthLike`
3. Normalize before scoring:
   - `depthLikeN = clamp01(depthLike / depthScale)` or
   - `depthCore = depthLike / maxDepthLikeInBasin` when basin-relative behavior is preferred.

### 14.4 Edge Cases and Policy Choices

Unresolved basin lineage:

1. If `spillH` is unset (ultimate/unresolved component), `depthLike` policy must be explicit.
2. Candidate policies:
   - leave unset/`NaN` (preferred for clarity), or
   - map to sentinel, or
   - derive capped proxy under documented rule.

Noisy micro-basins:

1. High `depthLike` in tiny noisy pits should not dominate decisions.
2. Gate with persistence threshold (`retention.persistenceMin`) before using `depthLike` heavily.

Flat depressions:

1. `depthLike` may be small across wide flat basins.
2. Persistence and area context should still be considered alongside `depthLike`.

### 14.5 Ecology Application Example (Discussion)

1. Bog/swamp candidacy can use:
   - `retentionScore = f(basinPersistence, slopeMag, faN) * g(depthLikeN)`.
2. `pool` presence can be treated as a positive bonus, not a required condition.
3. Final biome decisions should still flow through eligibility + winner policy in ecology.
