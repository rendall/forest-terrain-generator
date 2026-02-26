# V2 Stream Coherence Implementation Plan (Draft)

Status: draft  
Scope: stream coherence planning and sequencing only (no code changes defined here)  
Last updated: 2026-02-26

References:

1. `docs/drafts/V2-Simulation-Repair-ProblemStatement.md` (Section 4.2)
2. `docs/drafts/V2-Simulation-Repair-ProposedSolutions.md` (Section 4.2)

## 1. Goal

Define a practical, deterministic path to make streams geographically coherent and traceable from origin to termination, while keeping the model understandable and tunable.

## 2. Scope

In scope:

1. Stream topology generation in hydrology.
2. Stream continuity invariants and metrics.
3. Stream direction availability via existing outputs (`fd`, `isStream`, `waterClass`).
4. Parameter changes directly required for stream coherence.

Out of scope:

1. Lake coherence algorithm changes except where stream rules depend on lake termination behavior.
2. `describe` prose behavior.
3. Broad biome rebalance, except as downstream validation impact.

## 3. Current-State Summary

Known issue pattern:

1. Streams are currently marked by per-tile threshold tests, which can produce fragmented channel masks.
2. Fragmentation causes weak origin-to-end traceability and local incoherence.
3. Downstream stream continuity mismatches are observed in sampled vanilla outputs.

Current implementation anchors:

1. Flow direction and accumulation are already deterministic.
2. Stream mask derivation is threshold-based in `src/pipeline/hydrology.ts`.
3. Direction signal already exists in `fd` and should remain source-of-truth.

## 4. Target Stream Invariants

These are proposed v2 stream-coherence invariants for discussion:

1. Every stream tile has one valid downstream continuation:
   - another stream tile, or
   - a lake tile, or
   - an explicitly allowed sink class/rule (proposed: `waterClass: "pool"` for minor terminal standing water).
2. Stream network is acyclic under `fd` traversal.
3. Stream direction is represented by existing simulation outputs (`fd`, `isStream`, `waterClass`) with no duplicate stream-direction field.
4. In no-water edge cases, behavior is deterministic and explicit.
5. Proposed passability semantics for `pool`: non-blocking by default (unlike lake), so pools do not create lake-style directional blocking behavior.

## 5. Candidate Technical Approach

Primary candidate:

1. Replace threshold-only stream classification with path-aware channel tracing.
2. Determine source candidates from accumulation/slope constraints (default source rule).
3. Trace downstream via `fd` and mark channel membership along traversed paths.
4. Apply lake precedence and sink rules deterministically.
5. Preserve stable traversal order and tie-breaking.
6. Mark minor terminal sinks as `waterClass: "pool"` when sink criteria are met.
7. Optionally apply a headwater source boost near ridges/high divides as a parameter tweak (disabled by default).

Fallback alternatives:

1. Threshold mask + deterministic cleanup pass.
2. Threshold densification (retune-only) for short-term mitigation.

## 6. Parameterization Strategy

Proposed stream-coherence parameter group:

1. `hydrology.streamThresholds.sourceAccumMin`
2. `hydrology.streamThresholds.channelAccumMin`
3. `hydrology.streamThresholds.minSlope`
4. Optional guardrail:
   - `hydrology.streamThresholds.maxGapFillSteps` (if cleanup mode retained)
5. Optional parameter tweak (`#3` headwater boost):
   - `hydrology.streamHeadwaterBoost.enabled` (default `false`)
   - `hydrology.streamHeadwaterBoost.minElevationPct`
   - `hydrology.streamHeadwaterBoost.minSlope`
   - `hydrology.streamHeadwaterBoost.minSourceSpacing`
   - `hydrology.streamHeadwaterBoost.maxExtraSources`

Policy:

1. Keep defaults conservative for compatibility.
2. Expose explicit controls for tuning.
3. Validate unknown keys strictly.
4. Keep headwater boost opt-in so baseline behavior remains aligned with default source rule.

## 7. Validation and Metrics

Required metrics for baseline and post-change comparison:

1. Stream downstream-continuation violation rate.
2. Stream component count.
3. Stream singleton component count.
4. Largest stream component size.
5. Stream tile share (% of grid).
6. No-stream fallback frequency.

Acceptance targets (draft):

1. Downstream-continuation violations approach zero under normal maps.
2. Component fragmentation reduced versus baseline.
3. Determinism preserved for identical inputs.
4. Extreme densification/overgrowth avoided.

## 8. Phased Work Plan

Phase 0: Decision framing

1. Confirm invariants and sink semantics.
2. Confirm whether stream continuity becomes normative requirement.

Phase 1: Baseline harness

1. Lock stream metrics across agreed seed/size matrix.
2. Store baseline snapshots for comparison.

Phase 2: Core algorithm pass

1. Implement path-aware stream derivation in hydrology.
2. Keep tie-break and traversal order deterministic.

Phase 3: Validation pass

1. Add targeted unit tests for continuity invariants.
2. Add regression fixtures for edge cases (no-stream, sink termination, tie-heavy maps).

Phase 4: Params and docs

1. Add stream-coherence params schema updates.
2. Update docs with tuning guidance and expected effects.

Phase 5: Integration checks

1. Verify effects on lake, biome, and trail systems.
2. Record deltas and identify required follow-up adjustments.

## 9. Cross-System Dependencies

Likely interactions to monitor:

1. Lake derivation precedence and termination behavior.
2. Moisture distribution shifts affecting ecology.
3. Trail routing cost fields and stream-proximity terms.
4. Followable flags and downstream consumers.
5. Directional passability/move-cost implications of `pool` classification.

## 10. Risks and Mitigations

Risk:

1. Over-dense channel networks.
2. Coherence improvements that break expected v1 shape characteristics.
3. Hidden coupling with lake growth and trail endpoints.

Mitigation:

1. Use baseline metrics and guardrail thresholds.
2. Roll out behind clear params/default policy.
3. Validate across small and medium map sizes.

## 11. Governance and Artifacts

Before implementation completion:

1. Update ADR for stream topology contract decisions.
2. Update normative spec if invariants become required behavior.
3. Keep problem statement and proposed-solutions docs aligned with final decisions.

## 12. Open Decisions

Items to resolve before coding:

1. Exact threshold criteria for assigning `waterClass: "pool"` as a terminal sink (for example, `fd==NONE` plus moisture/accumulation gates).
2. Whether strict continuity is always required or tolerance-based in specific edge cases.
3. Default behavior for small maps (same defaults vs adaptive scaling hooks).
4. Whether cleanup pass remains as optional mode or is removed entirely.
5. Confirm normative precedence and passability ordering including `pool`.
6. Finalize exact default and cap values for `hydrology.streamHeadwaterBoost.*`.

## 13. Options and Recommendation (Educational Brief)

This section records the practical options discussed so far and a recommended default path for v2 stream coherence.

### 13.1 Stream Source Strategy

Option A: threshold-only local marking (current-style)

1. Mark stream tiles directly from local thresholds (for example accumulation/moisture checks) without explicit path construction.
2. Strength: simple and fast.
3. Weakness: fragmentation risk; weak origin-to-end traceability.

Option B: accumulation+slope source candidates with downstream tracing (`recommended`)

1. Build source candidates from deterministic gates (`sourceAccumMin`, `minSlope`).
2. Trace each source along `fd` until termination (`stream`, `lake`, or allowed sink class).
3. Strength: coherent, explainable channel topology with deterministic tie-breaks.
4. Weakness: broader behavior shift versus threshold-only masking.

Option C: add headwater boost near ridges/high divides (`recommended as optional tweak`)

1. Keep Option B as baseline.
2. Add controlled extra sources in high-elevation/steeper areas.
3. Strength: improves visual headwater richness.
4. Weakness: can over-densify if left unconstrained.
5. Policy recommendation: opt-in only via `hydrology.streamHeadwaterBoost.*`.

Recommendation:

1. Use Option B as default.
2. Include Option C as a disabled-by-default parameterized tweak.
3. Avoid Option A as primary model in v2.

### 13.2 `fd==NONE` and Sink Semantics

Option S0: disallow terminal sinks for stream tiles

1. Force all stream paths to terminate only in stream/lake classes.
2. Strength: very strict continuity.
3. Weakness: requires aggressive rerouting/breach behavior; can feel artificial on small/noisy maps.

Option S1: allow minor terminal sinks as pools (`recommended`)

1. When a traced path reaches valid sink conditions, classify terminal standing water as `waterClass: "pool"`.
2. Preserve continuity contract as `stream -> stream|lake|pool`.
3. Strength: realistic and deterministic handling of local depressions.
4. Weakness: requires explicit `pool` semantics in spec/docs.

Option S2: force drainage to boundary or nearest basin

1. Re-route flow across local pits by carve/breach heuristics.
2. Strength: global drainage completion.
3. Weakness: high complexity; large terrain/topology side effects.

Recommendation:

1. Adopt S1 for v2 stream coherence.
2. Keep pool passability non-blocking by default.
3. Defer S2 to a future advanced mode if needed.

### 13.3 Direction Representation

Option D0: add dedicated stream-direction attribute

1. Emit an extra stream direction field in hydrology or navigation.
2. Strength: direct readability.
3. Weakness: duplicates existing directional truth.

Option D1: use existing outputs only (`recommended`)

1. Represent downstream flow via existing `fd`, with stream membership via `isStream`/`waterClass`.
2. Strength: no schema duplication; one source of truth.

Recommendation:

1. Adopt D1.
2. Keep docs explicit on how to read stream direction from existing fields.

### 13.4 Continuity Strictness

Option C0: quality target only

1. Track continuity metrics but do not fail invariants.
2. Strength: low migration risk.
3. Weakness: allows persistent incoherence.

Option C1: hard invariant for stream tiles (`recommended`)

1. Require every stream tile to have valid downstream continuation to `stream|lake|pool`.
2. Strength: clear contract and better downstream reasoning.
3. Weakness: requires stronger validation and fixture coverage.

Recommendation:

1. Adopt C1 for v2 stream coherence scope.
2. Treat non-stream `fd==NONE` tiles as normal terrain behavior.

### 13.5 Cleanup Pass Policy

Option P0: no cleanup pass

1. Rely fully on traced topology.
2. Strength: simpler model surface.
3. Weakness: fewer guardrails for odd edge cases.

Option P1: optional deterministic cleanup (`recommended`)

1. Keep cleanup disabled by default.
2. Allow explicit opt-in if needed for niche maps.
3. Strength: conservative fallback without making it core behavior.

Recommendation:

1. Use P1.
2. Keep default behavior path-first without cleanup dependence.

### 13.6 Small-World Behavior

Option W0: single defaults for all map sizes (`recommended for first wave`)

1. Keep one deterministic baseline.
2. Strength: easier debugging and regression comparison.
3. Weakness: small maps may still need tuning.

Option W1: adaptive threshold scaling by world size

1. Scale selected hydrology thresholds by map dimensions.
2. Strength: potentially better out-of-box small-world behavior.
3. Weakness: extra complexity and harder explainability early on.

Recommendation:

1. Start with W0 for stream-coherence first wave.
2. Revisit W1 after baseline coherence metrics stabilize.

## 14. Decision List for Review and Sign-Off

This is the full stream-coherence decision list to review before implementation.

1. `D-01` Source model baseline:
   Recommended: Option B (accumulation+slope + path tracing).
2. `D-02` Headwater enrichment:
   Recommended: Option C as optional tweak, default off.
3. `D-03` Terminal sink semantics:
   Recommended: S1 (`waterClass: "pool"` for valid terminal sinks).
4. `D-04` Pool passability:
   Recommended: non-blocking by default.
5. `D-05` Direction representation:
   Recommended: D1 (use existing `fd` + stream flags; no duplicate field).
6. `D-06` Continuity policy:
   Recommended: C1 hard invariant for stream tiles.
7. `D-07` `fd==NONE` interpretation:
   Recommended: valid non-stream terrain state; stream endpoints may use `pool` when gates pass.
8. `D-08` Cleanup mode:
   Recommended: optional deterministic cleanup, default off.
9. `D-09` Small-map default policy:
   Recommended: W0 for first wave; defer adaptive scaling.
10. `D-10` Parameter surface:
    Recommended: expose explicit `streamThresholds.*` and `streamHeadwaterBoost.*` with strict validation.
11. `D-11` Metrics contract:
    Recommended: baseline and post-change tracking for continuation violations, component fragmentation, and stream share.
12. `D-12` Governance:
    Recommended: update ADR and normative spec text before declaring implementation complete.
