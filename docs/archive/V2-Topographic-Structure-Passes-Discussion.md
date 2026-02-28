# V2 Topographic Structure Passes Discussion (Exploratory)

Status: exploratory discussion (no implementation commitment)  
Scope: companion basin/peak structural passes and cross-phase usage  
Last updated: 2026-02-28

References:

1. `docs/drafts/V2-Retention-Stage-Discussion.md`
2. `docs/drafts/V2-Biome-Distribution-ImplementationPlan.md`
3. `src/pipeline/classify-landform.ts`
4. `src/pipeline/hydrology.ts`

## 1. Question

Should the simulation derive companion structural passes for:

1. Basin persistence (low-to-high sweep)
2. Peak persistence (high-to-low sweep / dual on `-h`)

and promote these as shared topographic structure signals that hydrology and ecology can both consume?

This is discussion-only and does not imply implementation.

## 2. Why Discuss This

Current issue:

1. Existing landform classification is local stencil-driven and can miss larger structural context.
2. Biome and retention reasoning need stable notions of enclosed lows and coherent highs.

Potential value:

1. Basin and peak structure form a symmetric pair.
2. Structural signals may reduce threshold brittleness in both hydrology and ecology.

## 3. Candidate Passes (Conceptual)

### 3.1 Basin Pass (Sublevel Merge Tree)

1. Sweep `h` from low to high.
2. Track connected components of active cells.
3. Record merge/spill levels for basin minima.
4. Derive basin persistence and basin-associated labels/fields.

### 3.2 Peak Pass (Superlevel Merge Tree)

1. Sweep `h` from high to low (or equivalently sweep `-h` low to high).
2. Track connected components of active high cells.
3. Record saddle/merge levels for peak maxima.
4. Derive peak persistence/prominence-like signals.

## 4. Shared Structural Signals (Discussion Set)

Possible outputs:

1. `basinMinIdx`, `basinPersistence`, optional `basinDepthLike`.
2. `peakMaxIdx`, `peakPersistence`, optional `peakRiseLike`.
3. Optional label fields for stable component identity.

Interpretation:

1. Basin persistence = structural strength of enclosed lows.
2. Peak persistence = structural strength of coherent highs.

## 5. Hypothetical Pipeline Position

If adopted, a conceptual placement is:

1. Base maps -> topography primitives (`h`, slope/aspect)
2. Structural passes (basin/peak persistence)
3. Hydrology
4. Ecology

Alternative:

1. Basin pass after hydrology as retention-only helper.
2. Peak pass in topography only.

Discussion point:

1. A shared topography-structure stage may be cleaner than duplicating structural logic downstream.

## 6. Potential Consumers

Hydrology might use:

1. Basin persistence to distinguish structural sinks from transient local pits.
2. Basin labels/depth-like for retention-oriented wetness signals.

Ecology might use:

1. Basin persistence/depth-like for bog/swamp candidacy.
2. Peak persistence/exposure for dry ridge/heath candidacy.

Landform might use:

1. Structural basin/peak context to replace or augment stencil thresholds.

Description/macro-landform opportunity (future extension):

1. Peak persistence and basin persistence can support macro feature extraction:
   - mountains/hills from high-persistence peaks
   - valleys/vales from convergent corridors and basin-linked lowlands
   - ridge/shoulder systems from connected high-structure components
2. Structural components can provide stable feature extents and hierarchy (parent/child), which are useful for naming and narrative consistency.
3. This is explicitly a future extension and not required for current repair-track scope.

## 7. Determinism Constraints

If pursued, both passes should lock:

1. Connectivity (Dir8 or Dir4; explicit and consistent).
2. Height tie handling (`hEps` + grouped levels).
3. Canonical tie-break order (row-major index).
4. Stable winner/loser rules at merges.

## 8. Risks

1. Added model complexity and new parameter surface.
2. Cross-phase contract expansion.
3. Potential overfitting if structural signals are used too aggressively.

## 9. Decision Criteria

Adoption should show:

1. Better structural landform realism than local stencil-only classification.
2. Improved biome stability/diversity without ad hoc threshold churn.
3. No regressions in determinism.
4. Clear user-facing controls and understandable defaults.

## 10. Open Questions

1. Should both passes be adopted together, or basin first?
2. Should structural passes be mandatory core outputs or feature-gated initially?
3. Which outputs are internal-only versus exposed in debug artifacts?
4. What minimum field set gives value without over-design?

## 11. Next Step (If Continued)

1. Keep this as exploratory unless/until decision to formalize.
2. If formalized, create ADR + implementation plan with explicit invariants and contracts.
