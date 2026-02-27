# V2 Lake Coherence Implementation Plan (Draft)

Status: draft  
Scope: lake coherence planning and sequencing only (no code changes defined here)  
Last updated: 2026-02-27

References:

1. `docs/drafts/V2-Simulation-Repair-ProblemStatement.md` (Section 4.3)
2. `docs/drafts/V2-Simulation-Repair-ProposedSolutions.md` (Section 4.3)
3. `docs/archive/V2-Stream-Coherence-ImplementationPlan.md` (cross-system dependency context)

## 1. Goal

Define a practical, deterministic path to make lakes read as coherent water bodies (rather than many isolated fragments) while avoiding the previous failure mode where a global growth knob (`lakeGrowSteps`) over-expands lakes.

## 2. Scope

In scope:

1. Lake-mask derivation and lake-component coherence behavior in hydrology.
2. Deterministic lake repair/growth constraints.
3. Parameter and validation surface required for lake coherence tuning.
4. Metrics required to compare baseline vs post-change lake quality.

Out of scope:

1. Stream topology redesign (already tracked in stream coherence).
2. Biome rebalance work beyond direct lake-side effects.
3. `describe` prose behavior.
4. Macro-landform modeling.

## 3. Current-State Summary

Observed issue pattern:

1. Lake outputs often contain many disconnected components, including single-tile artifacts.
2. The prior attempted fix (`lakeGrowSteps`) improved continuity in some cases but could inflate lakes too broadly.
3. Current behavior is deterministic but difficult to tune toward "coherent, not oversized" outcomes.

Current implementation anchors:

1. Lake seed classification uses slope/accumulation and landform gates.
2. Optional lake growth already exists, but is broad and not component-aware enough.
3. Downstream systems assume lake tiles are high-priority hydrology features.

## 4. Target Lake Invariants (Draft)

Proposed v2 lake-coherence invariants for discussion:

1. Lakes should be represented by fewer, larger connected components under default settings.
2. Single-tile and micro-fragment lakes should be rare under default settings.
3. Lake coherence improvements must preserve deterministic outputs for identical inputs.
4. Lake area should remain bounded by explicit guardrails (no runaway overgrowth).
5. Lake repair/growth decisions should be explainable by local eligibility rules and component limits.

## 5. Candidate Technical Approaches

### 5.1 Option A: Constrained Component-Coherence Repair (`recommended baseline`)

1. Keep current seed identification logic as the initial lake mask source.
2. Repair/expand each component with strict local gates (slope/height constraints) and per-component caps.
3. Add micro-component repair rules (for example, absorb or remove tiny isolated components) using deterministic criteria.
4. Apply explicit global guardrails on total lake coverage.

Why this is attractive:

1. Targets the real problem (fragmentation) directly.
2. Avoids single global growth behavior.
3. Keeps behavior understandable and tunable.

### 5.2 Option B: Retune Existing `lakeGrowSteps` Only (`not recommended as primary`)

1. Keep the current growth model.
2. Retune thresholds and defaults.

Tradeoff:

1. Minimal engineering cost.
2. High risk of repeating the same under-coherent vs overgrown tradeoff.

### 5.3 Option C: Deterministic One-Shot Component Merge Heuristics (`optional add-on`)

1. Identify nearby components and merge through constrained bridge rules.
2. Apply once, with strict limits.

Tradeoff:

1. Can quickly reduce fragmentation.
2. May be less explainable than local component-constrained growth unless carefully bounded.

## 6. Parameterization Strategy (Draft)

Baseline policy:

1. Keep unknown-key rejection strict.
2. Expose thresholds explicitly via params, with safe defaults.
3. Prefer small, composable knobs over one oversized global knob.

Likely parameter groups:

1. Existing lake gates:
   - `hydrology.lakeFlatSlopeThreshold`
   - `hydrology.lakeAccumThreshold`
   - `hydrology.lakeGrowSteps`
   - `hydrology.lakeGrowHeightDelta`
2. Proposed coherence controls (names tentative):
   - `hydrology.lakeCoherence.enabled`
   - `hydrology.lakeCoherence.minComponentSize`
   - `hydrology.lakeCoherence.maxGrowthPerComponent`
   - `hydrology.lakeCoherence.maxTotalLakeShare`
   - `hydrology.lakeCoherence.maxBridgeDistance`
   - `hydrology.lakeCoherence.repairSingletons`

Compatibility note:

1. If legacy `lakeGrow*` behavior remains, precedence and interaction rules must be explicit to prevent ambiguous tuning.

## 7. Validation Metrics

Required baseline/post-change metrics:

1. Lake component count.
2. Lake singleton component count.
3. Largest lake component size and share.
4. Total lake tile share (% of grid).
5. Optional component-size distribution summary (p50/p90).
6. Determinism check across repeated runs.

Draft acceptance direction:

1. Lower fragmentation than baseline at default settings.
2. No significant lake-area blowup versus baseline guardrail targets.
3. Stable behavior across small and medium map sizes.

## 8. Phased Work Plan

Phase 0: Decision framing

1. Finalize lake coherence invariants.
2. Choose primary algorithm path (Option A baseline, Option C optional).
3. Decide legacy `lakeGrow*` policy (retain, deprecate, or compatibility-only).

Phase 1: Baseline harness

1. Lock baseline lake metrics across agreed seed/size matrix.
2. Capture representative failure fixtures (fragmented and overgrowth-prone cases).

Phase 2: Core lake-coherence algorithm

1. Implement component-aware lake repair/growth with deterministic ordering.
2. Add explicit caps and guardrails.

Phase 3: Params and validation surface

1. Add/validate param schema for coherence controls.
2. Provide effective-value visibility in debug outputs where appropriate.

Phase 4: Cross-system integration

1. Validate interactions with stream termination behavior and moisture distribution.
2. Validate ecological and navigation side effects.

Phase 5: Finalize implementation checklist

1. Convert approved plan decisions into atomic checklist items per `docs/normative/checklist.md`.
2. Group checklist items into behavior slices before execution.

## 9. Cross-System Dependencies

Lake coherence changes are expected to interact with:

1. Stream termination and water-class precedence.
2. Moisture and wet-biome distribution.
3. Trail routing cost fields and shoreline followable behavior.
4. Passability and move-cost behaviors near water.

## 10. Risks and Mitigations

Risk:

1. Over-correction (lakes become too large or too uniform).
2. Under-correction (fragmentation remains high).
3. Hidden coupling with stream and ecology behavior.

Mitigation:

1. Use explicit area/component guardrails.
2. Validate against fixed metric matrix before/after each major slice.
3. Keep defaults conservative and expose deterministic tuning controls.

## 11. Governance and Artifacts

Before implementation is declared complete:

1. Update ADR entry if lake-coherence policy materially changes architecture/invariants.
2. Update normative spec text for any adopted hard invariants or parameter-contract changes.
3. Keep problem statement and proposed-solutions documents synchronized with final decisions.

## 12. Open Decisions to Resolve Before Checklist

1. `L-01` Should micro-lake components be merged, removed, or both?
2. `L-02` Should component bridging be enabled by default or opt-in only?
3. `L-03` What is the default total lake share guardrail?
4. `L-04` Keep `lakeGrowSteps` as active behavior, compatibility mode, or deprecate?
5. `L-05` If both legacy and new controls exist, what is precedence?
6. `L-06` Which metrics are required in debug manifest vs test-only harness?
7. `L-07` Do we set a hard singleton-count target for default maps?
8. `L-08` Is small-world adaptive scaling in scope now or deferred (as with stream coherence)?

## 13. Initial Recommendation Slate (Proposed, Not Locked)

1. `R-01` Adopt Option A as primary algorithm path.
2. `R-02` Keep Option C as optional add-on, disabled by default.
3. `R-03` Treat Option B as fallback only, not primary strategy.
4. `R-04` Introduce explicit component/area guardrails in params.
5. `R-05` Keep defaults conservative and deterministic.
6. `R-06` Defer small-world adaptive scaling for lake coherence first wave unless metrics prove it is required.
7. `R-07` Finalize checklist only after Section 12 decisions are resolved.
