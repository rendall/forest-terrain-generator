# V2 Simulation Repair Proposed Solutions (Draft)

Status: draft  
Scope: solution candidates only (no implementation commitment in this document)  
Last updated: 2026-02-26

Reference problem statement: `docs/drafts/V2-Simulation-Repair-ProblemStatement.md`

Scope guard:

1. Keep existing tile-scale `landform` in this repair track.
2. Defer macro-landform identification (region-scale terrain structures) as a future side quest outside current scope.

Risk tags:

1. `experiment` = useful to test, uncertain production value.
2. `likely` = practical default candidate.
3. `high-risk` = major compatibility or model-risk surface.

### 4.1 Biome Distribution Collapse (Hydrology -> Ecology)

Primary proposal (`likely`):

1. Re-center biome assignment around produced moisture distribution rather than fixed cutoffs alone.
2. Keep deterministic ordering, but add configurable threshold controls and optional small-world scaling.
3. Preserve hydrology precedence behavior explicitly and document its impact on biome reachability.

Alternatives:

1. Retune only fixed cutoffs (`experiment`).
2. Add explicit ecological quota balancing (post-pass) (`high-risk`).
3. Shift correction entirely into hydrology moisture distribution (no ecology threshold change) (`experiment`).

Tradeoffs:

1. Cutoff-only tuning is simple but fragile across map sizes.
2. Quota balancing can improve diversity fast but risks artificial-looking terrain.
3. Hydrology-only correction may be cleaner architecturally but could require wider model changes.

ADR/spec impact:

1. Likely normative changes where current thresholds are fixed.
2. ADR recommended for threshold-policy shift from fixed to configurable/adaptive behavior.

### 4.2 Stream Network Incoherence

Primary proposal (`likely`):

1. Replace threshold-only stream marking with path-aware channel tracing from valid source candidates.
2. Require downstream continuation coherence for stream tiles (`stream -> stream|lake|explicit sink rule`).
3. Add explicit simulation-level requirement that streams indicate downstream flow direction using existing outputs (`fd`, `isStream`, `waterClass`) without adding duplicate stream attributes.
4. Model non-lake terminal sinks as `waterClass: "pool"` for small standing-water endpoints.
5. Define `pool` as non-blocking for passability (movement can go around/through barring other barriers).

Alternatives:

1. Keep threshold marking and apply morphological cleanup filters (`experiment`).
2. Lower stream thresholds aggressively to increase continuity by density (`experiment`).

Tradeoffs:

1. Path-aware tracing improves coherence but changes topology more substantially.
2. Morphological cleanup is lower risk but can leave hidden logic inconsistencies.
3. Threshold-only densification may create noisy/over-wet channels.
4. Adding `pool` improves semantic clarity for terminal sinks but expands the water-class contract.

ADR/spec impact:

1. Spec update likely if continuity requirements are elevated to hard invariants.
2. ADR recommended for stream topology contract definition.
3. Spec/ADR updates required to add `waterClass: "pool"` and its passability semantics.

### 4.3 Lake Fragmentation and Growth Tradeoff

Primary proposal (`likely`):

1. Replace broad growth behavior with constrained component coherence rules.
2. Add per-component growth caps and stricter slope/height eligibility gates.
3. Add small-component repair behavior that avoids whole-system lake inflation.
4. Add lake-boundary realism enforcement with conservative default repair mode (`trim_first`) and explicit epsilon tolerance.
5. Add per-lake-tile `lakeSurfaceH` output for downstream reasoning; do not store depth as a separate field (derive as `lakeSurfaceH - h`).

Alternatives:

1. Keep `lakeGrowSteps` and retune defaults only (`experiment`).
2. Add one-shot component merge heuristics (`experiment`).

Tradeoffs:

1. Constrained growth is safer but may need more parameters.
2. Retune-only is easy but repeats previous overgrowth failure mode risk.
3. Merge heuristics can improve shape quickly but may reduce explainability.

ADR/spec impact:

1. Spec text likely needed for any new coherence rules/constraints.
2. ADR recommended if algorithm class changes from simple growth to multi-rule component repair.
3. Spec/ADR update required for `lakeSurfaceH` output contract addition.

### 4.4 Slope/Aspect Coherence

Primary proposal (`high-risk`):

1. Add strict per-neighbor monotonicity as a hard invariant.

Alternatives:

1. Introduce a discrete downhill-direction field and keep `aspectDeg` as continuous gradient output (`likely`).
2. Define tolerance-based monotonicity checks rather than strict per-neighbor guarantees (`likely`).
3. Keep current behavior and publish quality metrics only (`experiment`).

Tradeoffs:

1. Strict monotonicity is clear but may fight central-difference math on noisy/small grids.
2. Discrete-direction + continuous-aspect split is expressive but expands output contract.
3. Tolerance-based checks are practical but less absolute.

ADR/spec impact:

1. Normative update required if monotonicity becomes a hard invariant.
2. ADR strongly recommended because this changes topography semantics and downstream assumptions.

### 4.5 Game Trail Coherence

Primary proposal (`likely`):

1. Upgrade trail planning from sparse independent routes to coherence-aware network generation.
2. Add route post-pass for component stitching or validated endpoint attachment.
3. Keep deterministic tie-breaking and route-order stability.

Alternatives:

1. Increase seed density only (`experiment`).
2. Add only endpoint constraints (must end on stream/ridge classes with stronger checks) (`likely`).
3. Enable optional trail post-processing simplification/merge pass (`experiment`).

Tradeoffs:

1. Full coherence-aware routing improves quality but increases complexity.
2. Seed-density-only approach may add clutter without structure.
3. Endpoint-only tightening helps obvious failures but may not solve disconnected components.

ADR/spec impact:

1. Spec clarification likely needed around acceptable trail topology/coherence.
2. ADR recommended if route model changes from independent requests to network-level planning.

### 4.6 Taxonomy Problem: `stream_bank` as Biome

Primary proposal (`likely`):

1. Remove `stream_bank` from biome taxonomy.
2. Keep stream semantics in existing hydrology/navigation fields (`isStream`, `waterClass`, `followable.stream`).
3. Reclassify stream-adjacent ecology through biome + hydrology composition, not a dedicated stream biome.

Alternatives:

1. Keep `stream_bank` but make it optional/legacy-mode (`experiment`).
2. Keep `stream_bank` and improve assignment criteria only (`experiment`).

Tradeoffs:

1. Removal improves model clarity but is a contract change for consumers.
2. Legacy mode reduces breakage but increases maintenance surface.

ADR/spec impact:

1. Normative taxonomy update required.
2. ADR required due to architecture/model-boundary change.

### 4.7 Parameterization and Control Surface Gaps

Primary proposal (`likely`):

1. Expand params surface for hydrology/ecology/trail thresholds with strict schema validation.
2. Keep defaults stable but expose explicit opt-in controls for advanced behavior.
3. Include effective-value reporting in debug outputs for transparency.

Alternatives:

1. Keep current params and ship fixed internal retunes only (`experiment`).
2. Add presets only, without exposing low-level thresholds (`experiment`).

Tradeoffs:

1. More controls improve tuning but increase docs and validation burden.
2. Preset-only model is simpler but less flexible for edge cases.

ADR/spec impact:

1. Spec updates needed where currently fixed constants become configurable.
2. ADR recommended for params-policy expansion scope.

### 4.8 Small-World Behavior Mismatch

Primary proposal (`likely`):

1. Add deterministic optional world-size scaling for selected thresholds.
2. Scope scaling to explicit allow-listed parameters.
3. Keep scaling opt-in initially.

Alternatives:

1. Ship separate small-world default profile/preset only (`experiment`).
2. Make scaling default-on (`high-risk`).

Tradeoffs:

1. Opt-in scaling minimizes surprise but requires user awareness.
2. Default-on scaling may improve out-of-box results but changes baseline behavior globally.

ADR/spec impact:

1. Spec clarification needed if size-adaptive behavior is normative.
2. ADR recommended for adaptive-policy boundaries.

### 4.9 Wetland Flatness Realism (Bog/Swamp)

Primary proposal (`likely`):

1. Add wetland low-relief constraints for bog/swamp eligibility.
2. Couple wetland classification to both moisture and local slope-relief checks.
3. Validate wetland flatness with targeted metrics across seeds/sizes.

Alternatives:

1. Lower wetland slope thresholds only (`experiment`).
2. Flatten terrain post-pass in wetland zones (`high-risk`).

Tradeoffs:

1. Eligibility constraints preserve terrain integrity but may reduce wetland area if hydrology remains dry.
2. Terrain post-flattening can enforce realism but risks introducing artifacts and coupling complexity.

ADR/spec impact:

1. Spec update likely if wetland flatness is elevated to a hard invariant.
2. ADR recommended if terrain modification passes are introduced.

### 4.10 Relief Compression and Passability Flatness

Primary proposal (`likely`):

1. Improve base-map noise generation so terrain relief better supports hydrology and movement semantics out of the box.
2. Add noise generator presets:
   - `mountainous`
   - `hilly`
   - `flat`
   - `mixed`
3. Add a height normalization parameter to control post-noise dynamic-range shaping.
4. Add an amplitude parameter to control overall relief strength.

Alternatives:

1. Retune only movement/hydrology thresholds against current relief profile (`experiment`).
2. Keep one global noise model and expose only amplitude (`experiment`).

Tradeoffs:

1. Better relief shaping improves stream and traversal realism but adds topography-model complexity.
2. Presets improve usability but must be documented to avoid hidden behavior surprises.
3. Amplitude/normalization controls can over-steepen maps if misconfigured without guardrails.

ADR/spec impact:

1. Spec updates likely if new topography parameters/presets become part of normative behavior.
2. ADR recommended for noise-model strategy and preset contract decisions.

### 4.11 Physical Calibration Gap (Elevation/Slope Units)

Primary proposal (`likely`):

1. Introduce a physical elevation mapping layer while keeping internal normalized `h` unchanged.
2. Add explicit calibration parameters, for example:
   - `topography.elevationModel.seaLevelMeters`
   - `topography.elevationModel.reliefRangeMeters`
3. Provide derived physical outputs (for example `elevationMeters`) in debug and/or tile payload fields by policy.
4. Document calibration guidance so users can set realistic terrain envelopes intentionally.

Alternatives:

1. Keep normalized-only output and publish conversion formulas in docs (`experiment`).
2. Provide presets only (no explicit calibration params) (`experiment`).

Tradeoffs:

1. Physical mapping improves interpretability without forcing internal algorithm rewrite.
2. Emitting physical fields expands output contract and requires migration handling.
3. Presets are simple but less precise for domain-specific realism targets.

ADR/spec impact:

1. Spec updates likely for any new topography calibration fields and emitted physical values.
2. ADR recommended for physical-mapping contract and backward-compatibility policy.

### 4.12 Synthetic Acceptance Fixtures (v2 Defaults Gate)

Primary proposal (`likely`):

1. Use deterministic synthetic terrain fixtures as acceptance tests for v2 default behavior.
2. Keep these fixtures as explicit v2-default gates (pass required before declaring v2 defaults complete).
3. While defaults are still in flight, keep fixture tests as expected-fail baselines so they do not block ongoing slice work.

Initial fixtures:

1. `phase3-lake-coherence-bowl`:
   - Paraboloid bowl terrain.
   - Expected v2 default behavior: coherent interior lake (center low point water, low fragmentation, no rim flooding under baseline fixture).
2. `phase3-stream-coherence-valley`:
   - North-descending valley floor with east/west side slopes.
   - Expected v2 default behavior: strong stream adherence to valley floor with end-to-end coherent drainage semantics.

Policy:

1. Problem diagnosis and acceptance criteria should be anchored to fixture outcomes in addition to random-seed sampling.
2. Fixture assertions should align with topology contract semantics (`stream -> stream|lake|pool`) rather than prose-level expectations.
3. Once v2 defaults are finalized, convert these from expected-fail baselines to hard passing acceptance tests.

## Initial Prioritization Proposal

Recommended first wave (`likely`):

1. `4.2` stream coherence.
2. `4.3` lake coherence.
3. `4.1` biome distribution collapse.
4. `4.5` game trail coherence.
5. `4.7` params expansion.
6. `4.10` relief compression and passability flatness.
7. `4.11` physical calibration gap.

Second wave (after baseline improvements):

1. `4.8` small-world scaling.
2. `4.9` wetland flatness realism.
3. `4.4` strict slope monotonicity (or selected alternative) after explicit ADR/spec decision.
