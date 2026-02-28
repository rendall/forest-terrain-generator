# V2 Hydrology Structure Enhancements Implementation Plan (Draft)

Status: draft  
Scope: hydrology-structure integration planning and sequencing only (no code changes defined here)  
Last updated: 2026-02-28

References:

1. `docs/drafts/V2-Hydrology-Structure-Enhancements-Discussion.md`
2. `docs/drafts/V2-Topographic-Structure-Passes-ImplementationPlan.md`
3. `docs/drafts/V2-Lake-Coherence-ImplementationPlan.md`
4. `docs/drafts/V2-Retention-Stage-Discussion.md`

## 1. Goal

Use topographic-structure signals to improve hydrology coherence outcomes (streams, sinks, lakes, moisture retention) with deterministic and troubleshootable rules.

## 2. Scope

In scope:

1. Sink classification policy using structure signals (`pool|lake|route-through`).
2. Structure-aware stream continuity improvements.
3. Structure-aware lake candidacy and unresolved-spill policy.
4. Moisture retention term using basin signals.
5. Parameter surface and diagnostics required for tuning.

Out of scope:

1. Full physical water-balance simulation (precipitation/evaporation/volume over time).
2. Macro-landform naming and description generation behavior.
3. Biome-model rewrite (tracked separately).

## 3. Operating Principle

1. Thresholds are policy heuristics, not scientific truth claims.
2. Decision quality is based on operability:
   - understandable intent,
   - predictable directional effect,
   - fast diagnosis and reversibility.
3. Backward-compatibility with current map outputs is not a target for this track.

## 4. Current-State Summary

1. Hydrology currently relies heavily on local/topology-derived signals and threshold gates.
2. Structure signals now exist (`basinPersistence`, `basinDepthLike`, spill/min lineage, etc.) but are not yet consumed by hydrology.
3. Known failure modes include endpoint incoherence, weak standing-water decisions, and poor explainability of threshold effects.

## 5. Target Hydrology Invariants (Draft)

1. Stream channels remain continuous from source to terminal class under deterministic routing rules.
2. Sink outcomes are explainable by explicit gates and diagnostics.
3. Lake candidacy favors structurally meaningful basins over shallow noise pits.
4. Moisture reflects both flow-through wetness and retention tendency.
5. Parameter changes produce monotonic, inspectable behavior shifts.

## 6. Candidate First-Wave Policy

### 6.1 Sink Rule Baseline

Recommended baseline:

1. `persistence + basin size` as required hard gates.
2. Inflow gate optional and default `off` in first wave.
3. Route-through remains available when standing-water gates are not met.

Reason:

1. Reduces false certainty from hard inflow assumptions while still suppressing tiny/noisy sinks.

### 6.2 Spill-Aware Route-Through

Recommended baseline:

1. Keep spill-aware route-through as optional logic branch.
2. Default `off` until diagnostics prove net benefit.

Reason:

1. Avoid accidental divide-crossing artifacts from aggressive bridging behavior.

### 6.3 Unresolved Spill Policy

Recommended baseline:

1. Global policy, not per-mode divergence.
2. Default unresolved lake policy to `deny`.

Reason:

1. Single policy is easier to debug and avoids mode-dependent surprises.

### 6.4 Moisture Retention Term

Recommended baseline:

1. Use a linear blend (`base + wRetention * retention`).
2. Use robust quantile normalization for retention input.
3. Keep weight explicit and user-tunable.

Reason:

1. Predictable monotonic effect and better small-map stability than raw-only scaling.

## 7. Parameter Surface (Locked for Checklist Drafting)

### 7.1 First-Wave Keys and Defaults

1. `hydrology.structure.enabled = true`
2. `hydrology.structure.sinkPersistenceRouteMax = 0.005`
3. `hydrology.structure.sinkPersistenceLakeMin = 0.02`
4. `hydrology.structure.basinTileCountMinLake = 3`
5. `hydrology.structure.inflowGateEnabled = false`
6. `hydrology.structure.lakeInflowMin = 0.15`
7. `hydrology.structure.unresolvedLakePolicy = "deny"` (`deny|allow_with_strict_gates|allow`)
8. `hydrology.structure.spillAwareRouteThroughEnabled = false`
9. `hydrology.structure.retentionWeight = 0.2`
10. `hydrology.structure.retentionNormalization = "quantile"` (`quantile|minmax|raw`)

### 7.2 Deferred Keys

1. No per-mode unresolved policy in first wave.
2. No automatic saddle carving/bridging control beyond boolean opt-in gate.

### 7.3 Parameter Documentation Contract

Each first-wave parameter must document:

1. intent,
2. range/domain,
3. monotonic effect,
4. interactions,
5. failure signatures,
6. debug cues.

## 8. Diagnostics and Troubleshooting Contract (Locked for Checklist Drafting)

### 8.1 Emission Location

1. Emit aggregate diagnostics in `debug-manifest.json` under `hydrologyStructureDiagnostics`.
2. Keep normal envelope payload unchanged except direct hydrology result changes.

### 8.2 Required Diagnostics Fields

1. `params`: effective resolved `hydrology.structure.*` values.
2. `sinkCandidates`: counts for `routeThrough`, `pool`, `lake` before final selection.
3. `sinkRejections`: counts by gate reason:
   - `persistence_below_route_max`
   - `persistence_below_lake_min`
   - `basin_size_below_lake_min`
   - `inflow_below_lake_min`
   - `unresolved_policy_denied`
4. `endpointReasons`: counts for `lake|pool|marsh|route_through|blocked`.
5. `moistureDecomposition`: summary stats (`min|max|avg|p10|p50|p90`) for:
   - `baseMoisture`,
   - `retentionTerm`,
   - `finalMoisture`.

## 9. Validation Fixtures and Acceptance Criteria (Locked for Checklist Drafting)

Required fixtures:

1. bowl
2. valley
3. split-basin
4. flat-noise

Pass criteria:

1. Bowl:
   - center tile classifies as `lake`;
   - exactly one connected lake component in fixture domain.
2. Valley:
   - one continuous stream path exists from southern headwater corridor to northern terminal class;
   - no immediate flow-direction reversals on adjacent stream tiles.
3. Split-basin:
   - basin with lower minimum remains winner lineage at merge level;
   - loser lineage records first spill level deterministically.
4. Flat-noise:
   - standing-water (`lake|pool`) share remains bounded and does not explode under defaults;
   - defaults do not create widespread disconnected single-tile lake artifacts.

Global criteria:

1. deterministic replay on fixed inputs;
2. no mode-specific divergence unless explicitly configured.

## 10. Phased Work Plan

Phase 0: Decision lock

1. Lock first-wave policy defaults from Section 6.
2. Lock parameter names and validation policy.
3. Lock required debug diagnostics.

Phase 1: Baseline harness

1. Capture baseline fixture outputs and metrics.
2. Capture baseline sink/stream/lake diagnostics.

Phase 2: Sink semantics integration

1. Integrate structure signals into sink decision pipeline.
2. Add optional inflow gate and unresolved policy handling.
3. Add gate-reason diagnostics.

Phase 3: Stream/lake structure coupling

1. Integrate selected spill-aware route-through behavior (if enabled by locked policy).
2. Validate continuity and terminal semantics on valley/split fixtures.

Phase 4: Moisture retention integration

1. Add retention term and normalization path.
2. Validate moisture-shift behavior and wetland plausibility on fixtures.

Phase 5: Stabilization and checklist readiness

1. Tune defaults by fixture diagnostics.
2. Convert locked decisions into checklist items per `docs/normative/checklist.md`.

## 11. Risks and Failure Signatures

1. Over-conservative unresolved policy:
   - risk: missing plausible lakes; symptom: many basin-like tiles never form standing water.
2. Over-permissive route-through bridging:
   - risk: streams appear to cross divides; symptom: continuity improves while local relief believability drops.
3. Poor retention normalization:
   - risk: moisture collapse or saturation; symptom: biome wetness bands become unstable across map sizes.
4. Overfitted thresholds:
   - risk: works on one fixture, fails on others; symptom: regressions on bowl/valley tradeoff.

## 12. Open Decisions

No blocking open decisions remain for checklist drafting in this track.

## 13. Adopted Decision Slate (Locked)

1. `HS-01` Standing-water gates:
   - Adopted: require `persistence + basin size` as hard lake candidacy gates.
   - Reason: suppresses shallow and tiny artifacts without requiring uncertain physical assumptions.
   - If wrong: may underproduce lakes in legitimate small basins.
2. `HS-02` Inflow gate posture:
   - Adopted: inflow gate optional, default `off`; when enabled, used after structural gates.
   - Reason: inflow threshold is least physically grounded in current model class.
   - If wrong: weak/dead lakes may remain too common until inflow gate is enabled.
3. `HS-03` Spill-aware route-through:
   - Adopted: default `off` in first wave.
   - Reason: avoids unintuitive divide-crossing artifacts before diagnostics maturity.
   - If wrong: stream endpoints may remain somewhat conservative/fragmented.
4. `HS-04` Unresolved policy scope:
   - Adopted: global policy, default `deny`.
   - Reason: avoids mode divergence and simplifies debugging.
   - If wrong: unresolved contexts may lose plausible lakes.
5. `HS-05` Retention integration:
   - Adopted: linear blend + quantile normalization.
   - Reason: monotonic, explainable, and stable for small maps.
   - If wrong: moisture may flatten or saturate unexpectedly.
6. `HS-06` Troubleshooting contract:
   - Adopted: mandatory debug diagnostics per Section 8.
   - Reason: this track prioritizes operability over opaque heuristics.
   - If wrong (under-specified diagnostics): threshold tuning becomes guesswork and regressions are hard to localize.

## 14. Governance and Artifacts

Before implementation is declared complete:

1. Update ADR for hydrology policy/invariant changes.
2. Update normative spec where behavior contracts are adopted.
3. Keep discussion/plan/checklist artifacts synchronized with locked decisions.
