# V2 Hydrology Structure Enhancements Discussion (Draft)

Status: discussion
Scope: option framing only (no implementation commitment)
Last updated: 2026-02-28

References:

1. `docs/drafts/V2-Topographic-Structure-Passes-ImplementationPlan.md`
2. `docs/drafts/V2-Retention-Stage-Discussion.md`
3. `docs/drafts/V2-Lake-Coherence-ImplementationPlan.md`
4. `docs/drafts/V2-Simulation-Repair-ProblemStatement.md`

## 1. Purpose

Document hydrology enhancement options that use topographic-structure signals to improve stream continuity, sink semantics, lake realism, and moisture retention behavior.

### 1.1 Epistemic and Operability Note

1. We cannot physically answer questions such as "how much inflow is enough for a real lake?" in this model class because water volume balance, precipitation, and evaporation are not modeled.
2. Therefore, thresholds in this document are policy heuristics, not scientific truth claims.
3. Decision quality is judged by operability:
   - can a human/agent understand the knob,
   - can they predict direction of effect,
   - can they diagnose and undo a bad choice quickly.
4. This track is greenfield; preserving current map outputs is not a goal.

## 2. Available Structure Signals

From topographic structure outputs:

1. `basinPersistence`
2. `basinDepthLike`
3. `basinMinIdx`, `basinMinH`, `basinSpillH`
4. `peakPersistence`
5. `peakRiseLike`
6. `basinLike`, `ridgeLike`

Working interpretation:

1. `basinPersistence` reflects basin significance (`spillH - minH`).
2. `basinDepthLike` reflects local depth-to-spill for a tile.
3. Higher persistence generally means stronger retention potential.

## 3. Sink Rule Semantics: Options

Question: for terminal/downstream-dead-end behavior, when do we classify as `pool`, `lake`, or route-through?

### 3.1 Option A: Persistence-Only

1. `p < pRouteThroughMax` => route-through
2. `pRouteThroughMax <= p < pLakeMin` => `pool`
3. `p >= pLakeMin` => `lake`

Pros:

1. Simple and deterministic.

Cons:

1. Can over-trust a single structural signal.

### 3.2 Option B: Persistence + Basin Size

1. Same as Option A plus `basinSize >= basinTileCountMinLake` for `lake`.

Pros:

1. Prevents tiny basins from becoming lakes too easily.

Cons:

1. Requires additional size threshold tuning.

### 3.3 Option C: Persistence + Size + Inflow (`candidate`)

1. `lake` requires persistence, minimum basin size, and inflow/accumulation gate.
2. `pool` remains the intermediate class.

Pros:

1. Best realism/robustness balance without heavy complexity.

Cons:

1. More knobs than Option A.

### 3.4 Option D: Spill-Aware Route-Through Override

1. Even if pit-like locally, prefer route-through when spill context suggests transient drainage.

Pros:

1. Helps avoid artificial standing-water artifacts.

Cons:

1. Can be harder to reason about without diagnostics.

## 4. Unresolved Spill Policy for Lake Formation

Question: should unresolved spill/saddle basins be allowed to form lakes?

### 4.1 Option U1: `deny`

1. If unresolved, do not form `lake`.

Pros:

1. Most conservative and explainable.

Cons:

1. May under-produce lakes in edge/global-winner cases.

### 4.2 Option U2: `allow_with_strict_gates`

1. Allow only with strict persistence proxy + inflow + size checks.

Pros:

1. Better coverage while still bounded.

Cons:

1. More policy complexity.

### 4.3 Option U3: `allow`

1. Unresolved status does not block lake formation.

Pros:

1. Simplest permissive behavior.

Cons:

1. Highest risk of unrealistic perched/ambiguous lakes.

### 4.4 Discussion Recommendation

1. Parameterize policy.
2. Default to `deny` in first wave.
3. Candidate key: `hydrology.structure.unresolvedLakePolicy` with enum `deny|allow_with_strict_gates|allow`.

## 5. Retention Term for Moisture: Options

Question: how should topographic-structure retention influence moisture?

### 5.1 Retention Signal Candidates

1. `retention = norm(basinDepthLike) * norm(basinPersistence)`
2. `retention = norm(basinDepthLike)`
3. `retention = basinLike ? norm(basinDepthLike) : 0`

### 5.2 Moisture Combination Formulas

1. Linear blend:
   - `moistureOut = clamp01(baseMoisture + wRetention * retention)`
2. Multiplicative boost:
   - `moistureOut = clamp01(baseMoisture * (1 + wRetention * retention))`
3. Piecewise boost:
   - boost only when basin-like or above retention threshold.

### 5.3 Normalization Options

1. Global min-max per map.
2. Robust quantile normalization (for example p05-p95 clamp, then scale).
3. Raw unnormalized values.

### 5.4 Discussion Recommendation

1. First-wave preference: linear blend + robust quantile normalization.
2. Keep weight explicit and user-tunable.
3. Candidate key: `hydrology.structure.retentionWeight`.

## 6. Candidate Parameter Surface (Draft)

1. `hydrology.structure.enabled`
2. `hydrology.structure.sinkPersistenceRouteMax`
3. `hydrology.structure.sinkPersistenceLakeMin`
4. `hydrology.structure.basinTileCountMinLake`
5. `hydrology.structure.lakeInflowMin`
6. `hydrology.structure.unresolvedLakePolicy`
7. `hydrology.structure.retentionWeight`
8. `hydrology.structure.retentionNormalization` (`quantile|minmax|raw`)

Note:

1. Exact names are draft and may be adjusted in implementation planning.

## 7. Determinism and Explainability Requirements

1. No randomized tie-breaking in hydrology decisions.
2. Fixed traversal/tie rules for all structure-aware decisions.
3. Diagnostics should explain why tile became `pool`/`lake`/route-through.
4. Prefer explicit thresholds to opaque blended magic values.

## 8. Synthetic Fixtures for Evaluation

1. Bowl fixture: expected coherent lake behavior with stable sink semantics.
2. Valley fixture: expected continuous stream path to outlet/terminal class.
3. Split-basin merge fixture: expected spill-aware basin hierarchy behavior.
4. Flat/noise fixture: avoid overproduction of standing water.

## 9. Provisional Decision Guesses (With Risks)

The following are best-guess defaults for first implementation planning, with explicit reasons and failure signatures if wrong.

### 9.1 Inflow Gate: Required vs Optional

Provisional choice:

1. Keep inflow as optional in first wave, default `off`.
2. When enabled, use inflow as a soft scoring bias before hard exclusion.

Reason:

1. Inflow thresholds are the least physically grounded in current model assumptions.
2. Optional/soft treatment reduces risk of hardcoded false certainty.

What could go wrong if incorrect:

1. If default `off` is wrong, weak/dead lakes may appear too often.
2. If default `on` hard-gated is wrong, legitimate basin lakes may disappear.
3. Symptom to watch: many `basinLike` tiles never reaching `waterClass=lake` despite coherent basin geometry.

### 9.2 Route-Through Auto Carve/Bridge Across Shallow Saddles

Provisional choice:

1. Do not auto carve/bridge by default (`off`).
2. If introduced later, require explicit opt-in parameter.

Reason:

1. Automatic carving is high-risk for unintuitive "water crossing divides" artifacts.
2. Conservative default keeps behavior easier to reason about.

What could go wrong if incorrect:

1. If too conservative, fragmented endpoints and short dead-end streams may remain.
2. If too permissive, streams may appear to violate obvious local topography.
3. Symptom to watch: channel continuity improves at cost of believable relief semantics.

### 9.3 Unresolved-Lake Policy Scope: Global vs Per-Mode

Provisional choice:

1. Make unresolved policy global for first wave.
2. Default global mode to `deny`.

Reason:

1. One global policy is easier to communicate, debug, and test.
2. Per-mode divergence (`generate|derive|debug`) would complicate troubleshooting early.

What could go wrong if incorrect:

1. Global `deny` may underproduce lakes near unresolved/edge-like contexts.
2. Per-mode policies (if introduced too early) may produce confusing mismatches between debug and generate outputs.
3. Symptom to watch: users seeing expected lakes in one mode but not another without obvious reason.

### 9.4 Default Threshold Selection Strategy

Provisional choice:

1. Do not target backward-compatibility of current maps.
2. Choose defaults by fixture-based behavior and diagnostics:
   - bowl, valley, split-basin, flat/noise.
3. Document each threshold using an operability template:
   - intent, range/domain, monotonic effect, interactions, failure signatures, debug cues.

Reason:

1. Current outputs are not the desired target state.
2. Fixture-led defaults are more robust and easier to revise with evidence.

What could go wrong if incorrect:

1. Thresholds tuned to old outputs will preserve old failure modes.
2. Overfitting to one fixture can damage general behavior on other map classes.
3. Symptom to watch: "works on bowl, fails on valley" or vice versa.

## 10. Next Step

If adopted, this discussion should feed:

1. `V2-Hydrology-Structure-Enhancements-ImplementationPlan.md` (decision-locked plan)
2. Checklist drafting per `docs/normative/checklist.md`
