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

Expectation addendum:

1. Lake behavior should align with intuitive water expectations at local boundaries: a lake edge should not sit directly beside a strictly lower non-lake tile under adopted tolerance rules.

## 2. Scope

In scope:

1. Lake-mask derivation and lake-component coherence behavior in hydrology.
2. Deterministic lake repair/growth constraints.
3. Parameter and validation surface required for lake coherence tuning.
4. Metrics required to compare baseline vs post-change lake quality.
5. Lake water-surface output contract for downstream consumers (`lakeSurfaceH`).

Out of scope:

1. Stream topology redesign (already tracked in stream coherence).
2. Biome rebalance work beyond direct lake-side effects.
3. `describe` prose behavior.
4. Macro-landform modeling.
5. Full dynamic flood simulation (time-step volume/rise model) in this phase.

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
6. Lake boundary realism invariant (proposed): no lake-boundary tile has a strictly lower adjacent non-lake tile beyond configured epsilon.

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

### 5.4 Option D: Boundary-Realism Enforcement Layer (`recommended as required stage`)

1. After initial lake mask/coherence pass, evaluate each lake component boundary.
2. Enforce local boundary realism via deterministic repair rules:
   - trim invalid high-edge lake tiles, or
   - expand/fill adjacent lower non-lake tiles where consistent with guardrails.
3. Start with conservative repair (trim-first) before any broader fill-to-spill model.

Tradeoff:

1. Adds algorithm complexity and may reshape current lakes.
2. Directly addresses the key expectation mismatch ("unexplained perched edge" behavior).

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
   - `hydrology.lakeCoherence.boundaryEps`
   - `hydrology.lakeCoherence.enforceBoundaryRealism`
   - `hydrology.lakeCoherence.boundaryRepairMode` (`trim_first` in first wave; `fill_first` deferred)

Data contract stipulation:

1. Emit `hydrology.lakeSurfaceH` on lake tiles as the component water-surface elevation.
2. Do not emit `lakeDepthH` as a stored field in this phase.
3. Consumers derive depth when needed as `lakeSurfaceH - topography.h`.

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
7. Lake boundary realism violations (count/share):
   - number of lake-boundary tiles adjacent to strictly lower non-lake tiles beyond epsilon.

Draft acceptance direction:

1. Lower fragmentation than baseline at default settings.
2. No significant lake-area blowup versus baseline guardrail targets.
3. Stable behavior across small and medium map sizes.
4. Boundary realism violations approach zero under default v2 settings.

## 8. Phased Work Plan

Phase 0: Decision framing

1. Finalize lake coherence invariants.
2. Choose primary algorithm path (Option A baseline, Option C optional).
3. Decide legacy `lakeGrow*` policy (retain, deprecate, or compatibility-only).
4. Apply adopted boundary-realism policy defaults (`hard invariant`, `trim_first`, `boundaryEps=0.0005`).

Phase 1: Baseline harness

1. Lock baseline lake metrics across agreed seed/size matrix.
2. Capture representative failure fixtures (fragmented and overgrowth-prone cases).

Phase 2: Core lake-coherence algorithm

1. Implement component-aware lake repair/growth with deterministic ordering.
2. Add explicit caps and guardrails.
3. Implement boundary-realism enforcement layer (trim/fill policy as decided).

Phase 3: Params and validation surface

1. Add/validate param schema for coherence controls.
2. Provide effective-value visibility in debug outputs where appropriate.
3. Add `lakeSurfaceH` to hydrology/tile outputs and document derivation semantics.

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
5. `describe` interpretation of relative elevation around lake tiles.

## 10. Risks and Mitigations

Risk:

1. Over-correction (lakes become too large or too uniform).
2. Under-correction (fragmentation remains high).
3. Hidden coupling with stream and ecology behavior.
4. Boundary-repair oscillation or over-trimming in noisy/small grids.

Mitigation:

1. Use explicit area/component guardrails.
2. Validate against fixed metric matrix before/after each major slice.
3. Keep defaults conservative and expose deterministic tuning controls.
4. Use epsilon-tolerant boundary checks and deterministic one-pass repair order.

## 11. Governance and Artifacts

Before implementation is declared complete:

1. Update ADR entry if lake-coherence policy materially changes architecture/invariants.
2. Update normative spec text for any adopted hard invariants or parameter-contract changes.
3. Keep problem statement and proposed-solutions documents synchronized with final decisions.

## 12. Open Decisions

No blocking open decisions remain for checklist drafting in this track.

## 13. Initial Recommendation Slate (Proposed, Not Locked)

1. `R-01` Adopt Option A as primary algorithm path.
2. `R-02` Keep Option C as optional add-on, disabled by default.
3. `R-03` Treat Option B as fallback only, not primary strategy.
4. `R-04` Add Option D boundary-realism enforcement in first-wave implementation.
5. `R-05` Introduce explicit component/area/boundary guardrails in params.
6. `R-06` Keep defaults conservative and deterministic.
7. `R-07` Defer small-world adaptive scaling for lake coherence first wave unless metrics prove it is required.
8. `R-08` Finalize checklist after the adopted decision slate is locked.

## 14. Adopted Decision Slate (Locked)

The following decisions are adopted for this lake-coherence track:

1. `L-01` Micro-lake handling:
   - Adopted: define micro-lake as connected component size `<= hydrology.lakeCoherence.microLakeMaxSize` (default `2`).
   - Adopted: parameterized action via `hydrology.lakeCoherence.microLakeMode` with enum `merge|remove|leave`.
2. `L-02` Component bridging:
   - Adopted: enabled by default via `hydrology.lakeCoherence.bridgeEnabled=true`.
   - Adopted: opt-out supported (`bridgeEnabled=false`).
3. `L-03` Total lake-share guardrail:
   - Adopted: no hard default guardrail in first wave.
   - Adopted: monitor/report `totalLakeShare` and related metrics for visibility.
4. `L-04` Legacy `lakeGrowSteps`:
   - Adopted: keep current policy (`lakeGrowSteps=0` default, opt-in behavior preserved).
5. `L-05` Legacy/new control precedence:
   - Adopted: existing lake gates (`lakeFlatSlopeThreshold`, `lakeAccumThreshold`, `lakeGrow*`) run upstream.
   - Adopted: `lakeCoherence.*` runs as post-pass coherence enforcement.
6. `L-06` Metrics publication split:
   - Adopted debug-manifest subset: `componentCount`, `singletonCount`, `largestComponentSize`, `largestComponentShare`, `totalLakeShare`, `boundaryViolationCount`.
   - Adopted: deeper distributions/harness-only metrics remain test-only unless explicitly promoted later.
7. `L-07` Singleton target policy:
   - Adopted: singleton = one-tile lake component.
   - Adopted: no hard singleton-count target in first wave; track and reduce by metrics.
8. `L-08` Small-world scaling:
   - Adopted: deferred for this first-wave lake-coherence track.
9. `L-09` Boundary realism policy:
   - Adopted: hard invariant for v2 defaults.
10. `L-10` Boundary repair mode default:
   - Adopted: `trim_first`.
   - Adopted: `fill_first` was considered and deferred from first-wave implementation.
11. `L-11` Boundary epsilon:
   - Adopted: `boundaryEps = 0.0005` in normalized `h` space.
12. Lake surface output field:
   - Adopted: add `lakeSurfaceH` to lake tiles.
   - Adopted: do not add `lakeDepthH` as a stored output field in this phase.
