# V2 Biome Distribution Implementation Plan (Draft)

Status: draft  
Scope: biome distribution planning and sequencing only (no code changes defined here)  
Last updated: 2026-02-28

References:

1. `docs/drafts/V2-Simulation-Repair-ProblemStatement.md` (biome-collapse and hydrology/ecology mismatch findings)
2. `docs/drafts/V2-Simulation-Repair-ProposedSolutions.md` (Section 4.1)
3. `src/pipeline/ecology.ts` (current biome assignment logic)

## 1. Goal

Define a deterministic, explainable, and user-configurable biome assignment model that avoids single-biome collapse (for example, `pine_heath` dominance), scales better across map sizes, and supports future biome additions without brittle overwrite chains.

## 2. Scope

In scope:

1. Biome assignment model in Ecology Phase 4.
2. Biome eligibility-gate structure and winner algorithm contract.
3. Moisture-distribution recentering strategy for wet-biome reachability.
4. Parameter surface expansion for biome predicates and winner behavior.
5. Metrics/debug outputs needed to reason about biome outcomes.

Out of scope:

1. Stream and lake algorithm redesign (already tracked separately).
2. Description/prose behavior changes.
3. Macro-landform system design.
4. Quota-balancing post-pass in first wave.

## 3. Current-State Summary

Observed pattern:

1. Biome assignment is currently implemented as a hardcoded threshold/overwrite cascade.
2. Fixed absolute moisture cutoffs interact poorly with produced moisture distributions.
3. `pine_heath` effectively acts as a catch-all fallback in many maps.
4. Resulting proportions can remain similar across size/seed, indicating systemic gating collapse rather than stochastic variation.
5. Existing behavior is deterministic but difficult to tune or explain.

Current implementation anchor:

1. `deriveBiome` in `src/pipeline/ecology.ts` combines hydrology and topography signals through fixed predicates and default fallthrough.

## 4. Design Principles (Proposed)

1. Separate eligibility from selection.
2. Keep deterministic replay as a hard requirement.
3. Expose rules as configurable data, not hidden control flow.
4. Preserve hydrology precedence for water classes.
5. Keep defaults conservative, but make control explicit.
6. Treat small-map behavior as first-class policy, not incidental side effect.

## 4.1 Working Definitions

Biome predicate:

1. A biome predicate is a deterministic boolean function associated with a biome.
2. It evaluates a tile's available simulation traits and configured biome-policy thresholds.
3. `true` means the biome is eligible for that tile; `false` means ineligible.
4. Predicates determine eligibility only; they do not directly finalize assignment.
5. Final assignment is selected by the winner algorithm among eligible biomes after hard gates are applied.

Derived physical coordinates for predicates:

1. Keep normalized `h` as internal simulation state for core terrain/hydrology stability.
2. Add derived physical elevation for ecology reasoning:
   - `elevationMeters = minElevationMeters + h * (maxElevationMeters - minElevationMeters)`.
3. Add horizontal scale input:
   - `cellSizeMeters` (one tile edge length in meters).
4. Predicates may use `elevationMeters` and meter-space local relief where absolute terrain interpretation is desired.
5. This track uses meter-space in predicate logic without replacing normalized internals in hydrology/topography.

Derived moisture interpretation scale for predicates:

1. Keep `hydrology.moisture` as the internal normalized wetness signal.
2. Keep map-relative `moistureRank` and blended wetness `wet` for distribution-aware ecology logic.
3. Add derived moisture percentage for intuitive predicate thresholds:
   - `soilMoisturePct = minSoilMoisturePct + wet * (maxSoilMoisturePct - minSoilMoisturePct)`.
4. Use `soilMoisturePct` in predicates where absolute wetness cut points are easier to reason about.
5. This does not require replacing existing hydrology moisture internals.

## 5. Target Biome Invariants (Draft)

1. Every tile is assigned exactly one biome.
2. Lake-locked tiles are resolved first and are not overwritten by land-biome competition.
3. Non-water biomes are selected only from explicitly eligible candidates.
4. Default behavior should not collapse into one dominant non-water biome under normal maps.
5. Biome decisions should be explainable from emitted signals and params.
6. Small maps may legitimately omit some biomes under explicit policy.

## 6. Candidate Model: Eligibility -> Score -> Winner (`recommended baseline`)

### 6.1 Stage A: Hard Gates

1. Resolve lake hard gate first (`lake` policy).
2. Exclude only lake tiles from land-biome competition.
3. Keep `stream`, `marsh`, and `pool` as hydrology classes that may still receive a biome assignment under configured ecology/taxonomy policy.

### 6.2 Stage B: Eligibility Gates

1. For each non-water biome, evaluate configurable eligibility predicates (range checks and boolean conditions).
2. Build an eligible biome set per tile.
3. If eligible set is empty, use explicit fallback policy (`mixed_forest` candidate default; configurable).

### 6.3 Stage C: Scoring

1. Compute biome scores over eligible candidates using interpretable weighted terms.
2. Support moisture-distribution-aware terms (Section 7) and direct signal terms (`elevationMeters`, `slopeMag`, `distWater`, `soil`, `surfaceFlags`, etc.).

### 6.4 Stage D: Winner

1. Apply configurable winner algorithm (default deterministic `argmax_score`).
2. Tie-breaking defaults to deterministic stable order or seeded deterministic hash.
3. Emit exactly one biome for each tile.

### 6.5 Initial Predicate Catalog for Current Biomes (Draft)

Notes:

1. These are default predicate candidates, not final locked constants.
2. Predicates consume tile traits (and optional precomputed neighborhood traits) and return `true|false`.
3. Thresholds are expected to be parameterized.

`lake`:

1. `lakeMask == true` (hard gate).
2. If true, assign `lake` directly and skip land-biome competition.

Stream-adjacent policy note:

1. `stream_bank` is removed from biome taxonomy in this track. `stream_bank` is NOT a biome.
2. Stream adjacency remains available as a predicate/scoring signal for land biomes (for example, wetland and mixed-forest competition near channels).

`open_bog`:

1. `wet >= openBogWetMin`.
2. `slopeMag <= openBogSlopeMax`.
3. `lakeMask == false`.

`spruce_swamp`:

1. `wet >= spruceSwampWetMin`.
2. `slopeMag <= spruceSwampSlopeMax`.
3. `lakeMask == false`.

`esker_pine`:

1. `(landform == "ridge" OR elevationMeters >= eskerElevationMinMeters OR r >= eskerRoughnessMin)`.
2. `wet <= eskerWetMax`.
3. `lakeMask == false`.

`pine_heath`:

1. `wet <= pineHeathWetMax`.
2. `lakeMask == false`.

`mixed_forest`:

1. `lakeMask == false`.
2. `wet` is in configurable mid-band:
   - `mixedWetMin <= wet <= mixedWetMax`.
3. Also serves as explicit fallback biome when no other non-lake predicates pass (configurable policy).

Precomputed neighborhood traits (for predicates that need neighbor context):

1. `streamAdjacent`: at least one Dir8 neighbor with `waterClass == "stream"`.
2. `localReliefMeters`: max-min neighbor elevation delta in Dir8 window (optional use in wetland/esker rules).
3. Predicates must not depend on neighbors' biome assignments from the same pass.

## 7. Moisture Re-centering Strategy (Draft)

Primary proposal (`likely`):

1. Keep `hydrology.moisture` unchanged as the normalized wetness signal.
2. Derive map-relative moisture distribution signal:
   - `moistureRank` in `[0,1]` from percentile rank.
3. Use blended wetness for ecology:
   - `wet = alpha * moistureRaw + (1 - alpha) * moistureRank`.
4. Derive intuitive moisture scale for predicates:
   - `soilMoisturePct = minSoilMoisturePct + wet * (maxSoilMoisturePct - minSoilMoisturePct)`.
5. Use `wet` and/or `soilMoisturePct` in wetland eligibility/scoring.

Why blended instead of rank-only:

1. Rank-only can be unstable on very small maps.
2. Blend keeps absolute and relative wetness information.

## 8. Parameterization Strategy (Draft)

Policy:

1. Expand user-tunable controls with strict validation.
2. Keep unknown-key rejection.
3. Publish effective biome params in debug outputs.

Tentative params surface:

1. `ecology.biomeModel.enabled` (feature gate for new model rollout).
2. `ecology.biomeModel.winnerMode`:
   - `argmax_score` (default)
   - `priority_then_score`
   - `weighted_deterministic`
3. `ecology.biomeModel.fallbackBiome` (default `mixed_forest`).
4. `ecology.biomeModel.moistureBlendAlpha` (`alpha` in blend).
5. `ecology.biomeModel.moistureScale.*`:
   - `minSoilMoisturePct`
   - `maxSoilMoisturePct`
6. `ecology.biomeModel.elevationScale.*`:
   - `minElevationMeters`
   - `maxElevationMeters`
   - `cellSizeMeters`
7. `ecology.biomeModel.smallMapPolicy.*`:
   - minimum map-size gates by biome
   - optional min-tile expectation by biome
8. `ecology.biomeModel.biomes.<biomeId>.enabled`.
9. `ecology.biomeModel.biomes.<biomeId>.eligibility.*`.
10. `ecology.biomeModel.biomes.<biomeId>.weights.*`.

Draft defaults for `ecology.biomeModel.moistureScale`:

1. `minSoilMoisturePct = 5`
2. `maxSoilMoisturePct = 60`

Draft defaults for `ecology.biomeModel.elevationScale`:

1. `minElevationMeters = 0`
2. `maxElevationMeters = 2500`
3. `cellSizeMeters = 100`

Interpretation note:

1. These defaults provide a practical physical frame for biome predicates and description-facing reasoning.
2. They do not require replacing normalized `h` inside hydrology/topography internals.

## 9. Small-Map Policy (Draft)

1. Explicitly allow biome omission on small worlds via configuration.
2. Default policy should disable/merge low-support biomes when map size is below configurable thresholds.
3. Small-map policy must remain deterministic and transparent in diagnostics.

## 10. Metrics and Diagnostics

Required metrics for comparison:

1. Per-biome tile share histogram.
2. Largest non-water biome share.
3. Eligibility counts per biome (how many tiles pass gates).
4. Winner counts per biome (how many tiles selected).
5. Empty-eligible fallback count.
6. Moisture distribution summary (`p10`, `p50`, `p90`, max) and `moistureRank` sanity checks.

Debug artifact recommendation:

1. Include effective biome-model settings and winner mode in debug manifest.
2. Include per-biome gate hit counts for explainability.

## 11. Acceptance Direction (Draft)

1. Biome collapse should be reduced versus baseline under default settings.
2. Wet-biome reachability should be possible whenever hydrology/soil conditions plausibly support it.
3. No nondeterministic drift across repeated runs with fixed inputs.
4. Small-map behavior should be consistent with declared policy (not accidental).

## 12. Phased Work Plan

Phase 0: Decision framing

1. Lock target model and winner algorithm contract.
2. Lock moisture recentering strategy (raw, rank, or blend).
3. Lock small-map policy defaults.

Phase 1: Baseline harness

1. Capture baseline biome histograms for agreed seed/size matrix.
2. Capture diagnostic signals for current eligibility bottlenecks.

Phase 2: Core ecology model

1. Implement eligibility-gate structure for non-water biomes.
2. Implement scoring model and deterministic winner policy.
3. Keep a controlled fallback path for feature-gated rollout.

Phase 3: Params and diagnostics

1. Add schema/validation/defaults for biome-model params.
2. Add debug metrics for eligibility and winner outcomes.

Phase 4: Integration and stabilization

1. Validate interactions with hydrology outputs and downstream navigation/ecology fields.
2. Tune defaults using diagnostics, not ad hoc retuning of hidden constants.

Phase 5: Checklist creation

1. Convert approved plan decisions into atomic checklist items per `docs/normative/checklist.md`.
2. Group checklist items into behavior slices before execution.

## 13. Risks and Mitigations

Risk:

1. Over-parameterization can increase complexity and user confusion.
2. Rank-heavy logic can be noisy on tiny maps.
3. Winner algorithm changes can break compatibility with existing baselines.
4. Water/land gate misordering can introduce semantic regressions.

Mitigation:

1. Keep a conservative default mode and strict validation.
2. Use blended moisture signal and explicit small-map policy.
3. Use phased rollout behind `ecology.biomeModel.enabled` during transition.
4. Publish diagnostics so rule behavior is visible.

## 14. Governance and Artifacts

Before implementation is declared complete:

1. Add/update ADR for biome model architecture shift (eligibility+winner model).
2. Update normative spec for new biome decision contract and parameter semantics.
3. Keep problem statement and proposed-solutions documents synchronized.

## 15. Open Decisions (Blocking for Checklist Draft)

1. `B-01` Winner algorithm default:
   - choose one: `argmax_score` / `priority_then_score` / `weighted_deterministic`.
2. `B-02` Fallback biome policy:
   - default `mixed_forest` only, or configurable list/order.
3. `B-03` Moisture recentering default:
   - raw only / rank only / blended (recommended).
4. `B-04` Small-map handling:
   - disable-by-threshold, merge-to-parent, or leave unconstrained.

Resolved decision:

1. `B-05` Stream-adjacent taxonomy:
   - resolved: remove `stream_bank` from biome taxonomy in this track.
   - stream adjacency remains a hydrology signal and optional biome predicate/scoring input.

## 16. Initial Recommendation Slate (Proposed, Not Locked)

1. `R-01` Adopt Eligibility -> Score -> Winner model as the baseline architecture.
2. `R-02` Use deterministic `argmax_score` as default winner algorithm.
3. `R-03` Use blended moisture signal (`raw + rank`) with configurable alpha.
4. `R-04` Set default non-water fallback to `mixed_forest`, not `pine_heath`.
5. `R-05` Add explicit small-map biome policy with deterministic thresholds.
6. `R-06` Keep water-class precedence hard and explicit.
7. `R-07` Publish per-biome eligibility/winner diagnostics by default in debug mode.
8. `R-08` Finalize checklist only after `B-01` to `B-04` are locked.
