# V2 Topographic Structure Passes Implementation Plan (Draft)

Status: draft  
Scope: planning and sequencing only (no implementation commitment in this document)  
Last updated: 2026-02-28

References:

1. `docs/drafts/V2-Topographic-Structure-Passes-Discussion.md`
2. `docs/drafts/V2-Retention-Stage-Discussion.md`
3. `docs/drafts/V2-Biome-Distribution-ImplementationPlan.md`
4. `src/pipeline/classify-landform.ts`
5. `src/pipeline/hydrology.ts`

## 1. Goal

Define a deterministic, structural topography stage that derives basin and peak persistence signals (companion passes) for downstream use in hydrology, ecology, and future description systems.

## 2. Scope

In scope:

1. Basin-pass and peak-pass structural signal derivation design.
2. Determinism contract (connectivity, tie-breaks, epsilon behavior).
3. Proposed map outputs and consumer interfaces.
4. Pipeline placement and phase-order implications.
5. Parameter surface and diagnostics for structural passes.

Out of scope:

1. Immediate biome/hydrology algorithm replacement.
2. ADR or normative-spec updates before details are locked.
3. Macro-landform naming implementation.
4. Description generation changes.

## 3. Current-State Summary

1. Current landform classification is local stencil-based (`3x3` neighbor morphology + thresholds).
2. Local morphology is deterministic but weak for structural basin/ridge interpretation.
3. Existing downstream systems (hydrology/ecology) could benefit from structural topography context not currently available.

## 4. Target Structural Invariants (Draft)

1. Structural passes must be deterministic for fixed inputs/seed/params.
2. Basin structure must not assume boundary outlet semantics.
3. Peak structure must be the dual of basin structure under consistent rules.
4. Output signals must be stable under row-major tie-break policy.
5. Structural fields should be useful as inputs, not direct policy decisions.

## 5. Candidate Structural Passes

### 5.1 Basin Pass (Sublevel DSU Sweep)

1. Sweep tiles by increasing `h` in grouped levels.
2. Activate tiles by level and union active Dir8 neighbors.
3. Record merge/spill level when a component minimum loses independence.
4. Derive basin persistence from `spillH - minH`.

### 5.2 Peak Pass (Superlevel DSU Sweep)

1. Sweep tiles by decreasing `h` (or increasing `-h`) in grouped levels.
2. Activate tiles by level and union active neighbors.
3. Record saddle/merge level when a component maximum loses independence.
4. Derive peak persistence/prominence-like signal.

## 6. Proposed Output Signals (Draft)

Basin side:

1. `basinMinIdx`
2. `basinMinH`
3. `basinSpillH` (may be unresolved by policy)
4. `basinPersistence`
5. Optional `basinDepthLike`

Peak side:

1. `peakMaxIdx`
2. `peakMaxH`
3. `peakSaddleH` (may be unresolved by policy)
4. `peakPersistence`
5. Optional `peakRiseLike`

## 7. Determinism Contract (Draft)

1. Connectivity: explicit (`dir8` recommended baseline).
2. Height grouping: explicit epsilon `hEps`.
3. Tie-break order: row-major tile index.
4. Winner rule for basin merges:
   - lower `minH` wins; tie by lower `minIdx`.
5. Winner rule for peak merges:
   - higher `maxH` wins; tie by lower `maxIdx`.
6. Canonical neighbor iteration order must be fixed.

## 8. Parameterization Strategy (Draft)

Tentative params:

1. `topography.structure.enabled`
2. `topography.structure.connectivity` (`dir8` in first wave)
3. `topography.structure.hEps`
4. `topography.structure.persistenceMin`
5. `topography.structure.unresolvedPolicy`:
   - `nan`
   - `sentinel`
   - `cap_to_map_extrema`

Policy:

1. Keep defaults conservative and deterministic.
2. Reject unknown keys.
3. Publish effective values in debug output.

## 9. Pipeline Placement (Draft)

Recommended conceptual order:

1. Base maps / topography primitives (`h`, slope/aspect)
2. Topographic structure passes (basin + peak)
3. Hydrology
4. Ecology
5. Navigation / description

Why:

1. Hydrology can consume basin/peak structure for sink/source and retention semantics.
2. Ecology can consume persistence/depth-like signals for biome predicates.

## 10. Downstream Consumer Opportunities

Hydrology:

1. Better distinction between structural sinks and noise pits.
2. Lake growth/repair constrained by structural basin signals.
3. Retention-informed chronic wetness signal inputs.

Ecology:

1. Stable basin persistence for bog/swamp candidacy.
2. Peak persistence and exposure proxies for dry ridge biomes.

Future description:

1. Macro feature extraction (mountains, valleys, hills, vales) from structural persistence.
2. Potential named-feature hierarchy using component lineage.

## 11. Risks and Mitigations

Risk:

1. New complexity and additional parameter surface.
2. Contract expansion across multiple phases.
3. Misuse of structural fields as direct biome/hydrology decisions.

Mitigation:

1. Keep outputs as intermediate signals first.
2. Introduce consumers incrementally.
3. Track diagnostics before policy coupling.

## 12. Validation Metrics (Draft)

1. Basin/peak component count and persistence distributions.
2. Determinism check across repeated runs.
3. Stability under small map sizes.
4. Correlation with known synthetic fixtures (bowl, ridge-valley, split basins).

## 13. Phased Work Plan

Phase 0: Decision framing

1. Lock algorithm contract and deterministic rules.
2. Lock pipeline placement and output set.
3. Lock unresolved-policy semantics.

Phase 1: Baseline harness

1. Add structural-pass fixture set and baseline metrics.
2. Capture representative maps for regression comparisons.

Phase 2: Basin pass implementation (if approved)

1. Implement deterministic sublevel DSU sweep.
2. Emit basin structural fields.

Phase 3: Peak pass implementation (if approved)

1. Implement deterministic superlevel dual sweep.
2. Emit peak structural fields.

Phase 4: Controlled consumers

1. Introduce hydrology/ecology consumers behind explicit policy flags.
2. Compare behavior deltas against baseline metrics.

Phase 5: Checklist and execution readiness

1. Convert this plan into checklist items per `docs/normative/checklist.md`.
2. Execute only after final decision lock.

## 14. Open Decisions (Blocking for Checklist Draft)

1. `TS-01` Should first wave include basin pass only, or both basin + peak?
2. `TS-02` Confirm connectivity (`dir8` vs `dir4`) for structural passes.
3. `TS-03` Resolve unresolved spill/saddle policy (`nan` vs sentinel/cap).
4. `TS-04` Decide initial output exposure:
   - internal-only maps
   - debug artifacts
   - tile payload inclusion
5. `TS-05` Decide whether hydrology consumes structure in first wave or later wave.

## 15. Initial Recommendation Slate (Proposed, Not Locked)

1. `R-TS-01` Adopt basin pass first as minimum structural foundation.
2. `R-TS-02` Keep peak pass in same track if complexity remains acceptable after basin pass lock.
3. `R-TS-03` Use `dir8`, row-major tie-breaks, and explicit `hEps`.
4. `R-TS-04` Keep unresolved values as `NaN` in internal maps initially.
5. `R-TS-05` Publish structural diagnostics in debug outputs before policy coupling.
6. `R-TS-06` Defer ADR and normative updates until `TS-01` to `TS-05` are locked.
