# V2 Simulation Repair Problem Statement (Draft)

Status: draft  
Scope: problem definition only (no implementation decisions in this document)  
Last updated: 2026-02-26

## 1. Purpose

This document defines the problem space for v2 simulator repair.

It exists to ensure we are solving the right problems before committing to solution design. The goal is to capture observed failures clearly, with evidence and boundaries, so implementation planning starts from a shared diagnosis.

## 2. Scope Boundary

In scope:

1. Core simulation correctness and coherence in topography, hydrology, ecology, and navigation outputs.
2. Data-model clarity for simulation outputs.
3. Parameterization and controllability for simulation thresholds.

Out of scope:

1. `describe` prose generation design changes.
2. General UX polish unrelated to simulation correctness.
3. Macro-landform identification (region-scale valleys/mountains/slope systems) as a separate modeling layer.

Note:

1. `describe` can expose simulation errors (for example wrong slope wording), but it is treated as a downstream symptom, not the root repair target.
2. Existing tile-scale `landform` remains in scope only as a currently required simulation input/output dependency; replacing it with macro-landform modeling is deferred.

## 3. System-Level Problem

The simulator currently produces outputs that are deterministic but often not coherent enough for intended use. Several subsystems show structural inconsistency:

1. Biome distribution collapses toward `pine_heath` across sizes/seeds; wet biomes can become effectively unreachable.
2. Stream networks are fragmented and can fail path continuity expectations.
3. Lake bodies are frequently fragmented into many small isolated components.
4. Slope/aspect can conflict with local elevation relationships.
5. Game trails can appear as disconnected local segments rather than coherent routes.
6. Small-world maps are poorly served by current fixed-threshold behavior.
7. Current taxonomy mixes hydrology semantics into biome (`stream_bank`) in a way that complicates reasoning.
8. Users lack enough explicit threshold controls through params to reliably tune outcomes.
9. Wetland terrain realism is weak: bog and swamp tiles frequently present non-flat local slope behavior.
10. Relief compression can make slope-based traversal effects effectively disappear on larger/default maps.
11. Topography outputs are hard to calibrate to real-world units (elevation/slope realism).

## 4. Observed Issues and Evidence

### 4.1 Biome Distribution Collapse (Hydrology -> Ecology)

Observed behavior:

1. The issue is broader than overrepresentation of one class.
2. Across very different map sizes, biome outcomes collapse into the same shape: dominant `pine_heath`, weak `mixed_forest`, and near-absent wet biomes.

Measured examples:

1. 256x256 map (65,536 tiles):
   - `pine_heath`: 60,160 (91.80%)
   - `mixed_forest`: 3,574 (5.45%)
   - `stream_bank`: 966 (1.47%)
   - `lake`: 662 (1.01%)
   - `spruce_swamp`: 174 (0.27%)
2. 16x16 map (256 tiles):
   - `pine_heath`: 212 (82.81%)
   - `mixed_forest`: 21 (8.20%)
   - `stream_bank`: 15 (5.86%)
   - `lake`: 7 (2.73%)
   - `spruce_swamp`: 1 (0.39%)
3. 256x256 moisture support for bog-class tiles:
   - only 23 / 65,536 tiles had moisture >= 0.85 (0.035%)
4. Even those rare high-moisture candidates can be overridden by water-class-first biome assignment.

Mechanism observed in current code:

1. Ecology uses fixed thresholds including `bogMoisture = 0.85`.
2. Biome assignment gives precedence to `lake` and `stream` before moisture-based biome rules.
3. In practice, high-moisture support from hydrology is so sparse that wet-biome states are near-unreachable.

Why this is a problem:

1. Ecological variety collapses for both small and large worlds.
2. Some biome states become mathematically improbable or effectively unreachable under default model coupling.
3. This is primarily a hydrology-distribution problem with downstream threshold/precedence amplification, not just a single ecology cutoff issue.

### 4.2 Stream Network Incoherence

Observed behavior:

1. Streams can appear as isolated or weakly connected fragments.
2. Some stream tiles do not continue cleanly into stream/lake downstream context.

Measured examples (vanilla, 64x64):

1. Downstream mismatch for stream tiles roughly `15%` to `25%` in sampled runs.
2. Many separate stream components; largest component often small relative to map area.

Why this is a problem:

1. Users expect streams to be traceable from source to termination.
2. Fragmented streams break geographic logic and movement cues.

### 4.3 Lake Fragmentation and Growth Tradeoff

Observed behavior:

1. Lakes are often fragmented into many components, including many single-tile components.
2. Prior attempt (`lakeGrowSteps`) improved continuity but could over-expand lakes.

Measured examples (vanilla, 64x64):

1. Lake components commonly in the `30+` range.
2. Many single-tile components in sampled runs.

Why this is a problem:

1. Water-body shape lacks expected continuity.
2. Existing repair knob has unstable side effects (under-coherent vs overgrown).

### 4.4 Slope/Aspect Coherence

Observed behavior:

1. Dir8-projected slope/aspect direction can disagree with local neighbor elevation checks.
2. Gentle/steep interpretation can fail expected delta ordering.
3. The signal is partially coherent (non-random), but not reliably direction-consistent under nearest-neighbor projection.

Measured examples (`raw/out.json`, 936 interior tiles):

1. Downhill-direction violations (`h(aspectDir) <= h(center)` expected): `106` (`11.32%`).
2. Opposite-direction violations (`h(oppositeDir) >= h(center)` expected): `84` (`8.97%`).
3. Coherence metrics:
   - corr(`slopeMag`, downhill delta) = `0.597`
   - corr(`slopeMag`, opposite delta) = `0.647`

Interpretation:

1. This appears to be a quantized-direction and finite-difference mismatch (continuous central-difference aspect mapped into Dir8 checks), not pure randomness.
2. Current normative behavior does not define strict per-neighbor monotonicity as a hard invariant, so this is treated as a quality/coherence issue rather than an explicit spec violation.

Why this is a problem:

1. Physical model becomes hard to trust.
2. Any consumer using slope direction (including `describe`) inherits these errors.

### 4.5 Game Trail Coherence

Observed behavior:

1. Trails can begin/end abruptly as local segments.
2. Multiple disconnected trail components are common.

Measured examples:

1. `raw/out.json` (32x32): 2 disconnected trail components (sizes 8 and 5), with endpoint-heavy shape.
2. Large sampled output (`out.json`): many disconnected trail components (for example, 55 components).
3. Vanilla 64x64 sampled runs also show multiple disconnected trail components.

Why this is a problem:

1. Trails read as arbitrary marks rather than navigable route structure.
2. Navigation semantics lose coherence for players and downstream tools.

### 4.6 Taxonomy Problem: `stream_bank` as Biome

Observed behavior:

1. `stream_bank` is currently modeled as a biome.
2. Streamness is already represented in hydrology/navigation fields.

Why this is a problem:

1. Cross-layer duplication blurs conceptual boundaries.
2. Biome semantics become less about ecology and more about hydrology flags.

### 4.7 Parameterization and Control Surface Gaps

Observed behavior:

1. Important thresholds are fixed or insufficiently exposed.
2. Users cannot easily tune behavior to their world size and design intent.

Why this is a problem:

1. Correctness fixes and balancing become code-change heavy.
2. Iteration cost is high for users who should be able to tune via params.

### 4.8 Small-World Behavior Mismatch

Observed behavior:

1. Current threshold behavior appears tuned to larger maps.
2. Maps under roughly `1000` tiles can show exaggerated sparsity/fragmentation patterns.

Why this is a problem:

1. The simulator does not adapt well to the declared use case of very small worlds.

### 4.9 Wetland Flatness Realism (Bog/Swamp)

Observed behavior:

1. Bog and swamp areas frequently present local slope variation ("sloping this way and that") instead of reading as flat wetland terrain.

Why this is a problem:

1. It conflicts with expected wetland physical character in target world modeling.
2. It weakens ecological/hydrological plausibility where wetlands are expected to be low-relief.

### 4.10 Relief Compression and Passability Flatness

Observed behavior:

1. Some generated maps are so low-relief that slope-based passability effects are effectively absent.
2. Terrain reads broadly flat even when the system supports slope-driven blocking/difficulty rules.

Measured examples:

1. `out.json` (256x256):
   - `slopeMag`: `min=0.0000549`, `max=0.0397`, `avg=0.0118`
   - max neighbor height delta (`dh`) on full grid: `0.0586`
   - on playable, non-lake directions: `blocked=0`, `difficult=0` (all passable)
2. `raw/out.json` (32x32):
   - `slopeMag`: `min=0.0020`, `max=0.1574`, `avg=0.0467`
   - max neighbor `dh`: `0.2196`
   - on playable, non-lake directions: `blocked=0`, `difficult=110`

Mechanism observed in current model:

1. Base height generation is smooth, multi-octave Perlin with conservative default parameters.
2. `slopeMag` is derived from central differences over neighboring heights, which keeps local gradient values low when `H` is smooth.
3. Movement steepness thresholds are substantially higher than observed large-map deltas (`difficult` at `dh >= 0.12`, `blocked` at `dh >= 0.22`), so slope-driven blocking can disappear.
4. In sampled `raw/out.json`, `H` values appear quantized to `1/255` increments, which can raise local deltas and produce steeper behavior than default generated maps.

Why this is a problem:

1. Out-of-box terrain can fail to produce meaningful climb/steepness gameplay cues on larger maps.
2. Stream/lake realism and movement semantics are both weakened by insufficient relief amplitude.
3. The system may require better coupling between topography amplitude and movement/hydrology thresholds.

### 4.11 Physical Calibration Gap (Elevation/Slope Units)

Observed behavior:

1. `h` is normalized to `[0,1]` but has no explicit physical elevation mapping.
2. Users cannot readily specify or interpret real-world-like terrain scales (for example sea level, 2.5km relief, 10km relief).
3. Slope proxies are hard to reason about in practical terms without a physical unit context.

Why this is a problem:

1. Tuning becomes guesswork because output values are abstract rather than physically anchored.
2. Realism targets are difficult to express or compare across maps.
3. Thresholds in hydrology/movement/ecology are harder to set consistently without calibration context.

## 5. Impact

These issues jointly create:

1. Reduced trust in simulation outputs.
2. Harder debugging and tuning due to interacting failures.
3. Weaker gameplay and world-authoring outcomes.
4. Higher maintenance burden because symptoms appear across multiple downstream layers.

## 6. Constraints and Governance

Any eventual solution must account for:

1. Normative spec currently defines some fixed thresholds and includes `stream_bank` as a biome.
2. Unknown params keys are currently hard validation errors.
3. Determinism remains a hard requirement.
4. Architecture/policy shifts require ADR/spec updates.

## 7. Problem Statement Summary

The v2 problem is not one isolated bug. It is a coherence and modeling failure across hydrology, ecology, topography semantics, and navigation graph formation, combined with insufficient user-tunable controls and weak small-world behavior. The project needs a repair effort that:

1. Prioritizes simulation correctness and coherence.
2. Clarifies model boundaries (biome vs hydrology semantics).
3. Expands explicit, deterministic parameter control.
4. Preserves determinism while improving practical output quality.

## 8. Next Step

Use this document as the baseline input to the implementation plan.  
The implementation plan should explicitly map each repair phase to one or more issues listed above.
