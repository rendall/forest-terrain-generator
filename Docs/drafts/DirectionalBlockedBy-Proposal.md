# Directional `blocked_by` Proposal (Discussion Draft)

## Purpose

Move passage text from generic blockage statements to cause-aware, location-grounded statements.

Current output can say:

- `Passage is blocked to the west and northwest.`

Target output can say:

- `The stream is too wide to cross west and northwest.`

This proposal defines a structured directional reason model that supports that transition.

## Scope

In scope:

1. Add directional blockage-reason structure to description structured output.
2. Define reason keys, precedence, and derivation heuristics from existing tile signals.
3. Define sentence-selection behavior for cause-aware blockage phrasing.

Out of scope:

1. Rewriting terrain generation rules.
2. Adding new terrain simulation fields.
3. Final prose composition changes outside blockage/passage wording.

## Core idea

`blocked_by` is attached to each blockage run in `movement[]` as a single selected reason.

Reasoning:

1. A blockage run can span multiple adjacent directions and should read as one coherent barrier.
2. Rendering needs one primary reason per blockage clause.
3. This keeps the structured shape simple while still supporting cause-aware wording.

## Proposed structured shape

Attach this to the `movement_structure` sentence object:

```json
{
  "slot": "movement_structure",
  "text": "Passage is blocked to the west and northwest.",
  "movement": [
    { "type": "passage", "directions": ["N", "NE", "E", "SE", "S", "SW"] },
    {
      "type": "blockage",
      "directions": ["W", "NW"],
      "blocked_by": "wide_stream"
    }
  ]
}
```

Notes:

1. `blocked_by` appears only on objects where `type == "blockage"`.
2. Each blockage run has exactly one selected reason.
3. If adjacent blocked directions need different selected reasons, they must be represented as separate blockage runs.

## Initial reason set (pared v1)

Hydrology:

1. `lake`
2. `bog_deep_water`
3. `spruce_swamp_deep_water`
4. `deep_water`
5. `wide_stream`

Topography:

1. `cliff`
2. `drop`

Pine-heath and rough terrain context:

1. `dense_trees`
2. `boulder_barrier`
3. `lichen_slick_rock`
4. `windthrow`
5. `fallen_log_barrier`
6. `root_ridges`
7. `drainage_cuts`
8. `dense_growth`
9. `bramble_thicket`

## Reason selection (gated + fall-through)

If multiple reasons are plausible, select exactly one by:

1. Eligibility gate per reason (must meet minimum signal).
2. Scoring among eligible reasons.
3. Tie-break by stable precedence order.

This avoids over-firing hydrology causes (for example, every stream becoming `wide_stream`).

### Stable tie-break precedence (highest first)

1. `lake`
2. `bog_deep_water`
3. `spruce_swamp_deep_water`
4. `deep_water`
5. `wide_stream`
6. `cliff`
7. `drop`
8. `windthrow`
9. `fallen_log_barrier`
10. `boulder_barrier`
11. `root_ridges`
12. `drainage_cuts`
13. `dense_growth`
14. `dense_trees`
15. `lichen_slick_rock`
16. `bramble_thicket`

### Wetness signal definitions

Use these normalized gates in eligibility checks:

1. `high_moisture`
 - Definition: `moisture >= M_HIGH`.
 - Notes: `M_HIGH` is a tuning constant (discussion default can start near the upper moisture band).

2. `high_saturation`
 - Definition: composite wetness state indicating effectively waterlogged footing.
 - Suggested gate:
   - `standing_water == true`, OR
   - (`high_moisture` AND low-slope/flat-wet context), OR
   - marsh-like water context in the blocked run.
 - Notes: this is intentionally broader than `high_moisture`; moisture alone is not always saturation.

### Eligibility + fall-through guidance by reason

1. `lake`
 - Eligibility: any direction in the blockage run touches lake water.
 - Behavior: hard-dominant if eligible.

2. `bog_deep_water`
 - Eligibility: biome is bog context and `high_saturation` is true.
 - Fall-through: if biome/wetness gate fails, continue.

3. `spruce_swamp_deep_water`
 - Eligibility: biome is spruce-swamp context and `high_saturation` is true.
 - Fall-through: if biome/wetness gate fails, continue.

4. `deep_water`
 - Eligibility: `high_saturation` is true regardless of biome.
 - Fall-through: if `high_saturation` is false, do not select; continue.

5. `wide_stream`
 - Eligibility: stream context present and stream-strength proxy is high.
 - Fall-through: if stream is present but not strong enough, continue.

6. `cliff`
 - Eligibility: steep uphill barrier signal above blocking threshold.
 - Fall-through: if only moderate slope, continue to `drop`/roughness reasons.

7. `drop`
 - Eligibility: sharp falling edge signal toward blocked run.
 - Fall-through: if no strong falling edge, continue.

8. `windthrow`
 - Eligibility: windthrow feature present and obstruction supports it.

9. `fallen_log_barrier`
 - Eligibility: fallen-log feature present and blockage run overlaps rough ground.

10. `boulder_barrier`
 - Eligibility: boulder/rock-obstacle signals present.

11. `root_ridges`
 - Eligibility: root-tangle or root-ridge footing signal present.

12. `drainage_cuts`
 - Eligibility: micro-cut drainage pattern signal present.

13. `dense_growth`
 - Eligibility: dense low-growth signal regardless of biome.

14. `dense_trees`
 - Eligibility: dense stand context (tree/canopy density), used after dense-growth reasons.

15. `lichen_slick_rock`
 - Eligibility: rocky exposed ground with lichen/slippery signal.

16. `bramble_thicket`
 - Eligibility: dense low brush/thicket signal (narrative inference for now).
 - Fall-through: if no strong thicket signal, do not select.

Rationale:

1. Hydrology hard barriers should dominate narration when present.
2. Hydrology reasons should dominate only when hydrology traits are strong.
3. Hard terrain barriers should outrank generic friction-style causes.
4. Vegetation/friction causes remain viable fallback outcomes.

## Derivation inputs (already available)

From tile and neighbors:

1. `navigation.passability` by direction.
2. `hydrology.waterClass` current tile + neighbor.
3. `topography.h` and directional neighbor deltas.
4. `topography.slopeMag`.
5. `ecology.biome`.
6. `ecology.roughness.featureFlags`.
7. `ecology.ground.surfaceFlags`.
8. Optional boundary knowledge for internal disambiguation (not a narrative reason by itself).

## Directional derivation heuristics (proposal)

For each blockage run in `movement[]`:

1. Compute run-local candidate reasons from all directions in the run.
2. Candidate derivation per direction:
 - If origin or destination water is lake: candidate `lake`.
 - If stream context applies: candidate `wide_stream`.
 - If bog context + `high_saturation` applies: candidate `bog_deep_water`.
 - If spruce-swamp context + `high_saturation` applies: candidate `spruce_swamp_deep_water`.
 - If `high_saturation` applies without biome-specific match: candidate `deep_water`.
 - If uphill delta indicates steep barrier and cliff-edge condition: candidate `cliff`.
 - If severe opposite drop context applies: candidate `drop`.
 - If `featureFlags` include `windthrow`: candidate `windthrow`.
 - If `featureFlags` include `fallen_log`: candidate `fallen_log_barrier`.
 - If root/ridged footing context applies: candidate `root_ridges`.
 - If rocky + exposed/lichen context applies: candidate `lichen_slick_rock`.
 - If rough rocky obstruction context applies: candidate `boulder_barrier`.
 - If dense low growth indicators apply: candidate `dense_growth`.
 - If dense tree-spacing context applies: candidate `dense_trees`.
 - If drainage-cut context applies: candidate `drainage_cuts`.
 - If dense low-growth/bramble context applies: candidate `bramble_thicket`.
3. Filter candidates by eligibility gates.
4. Score eligible candidates and choose highest score.
5. Resolve ties by stable precedence.
6. If no candidates survive gating, fall back to a generic blockage sentence.

## Sentence selection behavior (proposal)

Goal: replace generic blocked text with cause-aware blockage-run text when possible.

Process:

1. Render one sentence clause per blockage run using that run's `blocked_by`.
2. If there are multiple blockage runs, render multiple clauses/sentences in deterministic order.
3. Fall back to generic blocked phrasing only if no reason could be selected.

## Example sentence templates

Hydrology:

1. `lake`: `Open water blocks the way {dirs}.`
2. `bog_deep_water`: `Bog water lies too deep to cross {dirs}.`
3. `spruce_swamp_deep_water`: `Swamp water lies too deep to cross {dirs}.`
4. `deep_water`: `The water runs too deep {dirs}.`
5. `wide_stream`: `The stream is too wide to cross {dirs}.`

Topography:

1. `cliff`: `A steep rise blocks the way {dirs}.`
2. `drop`: `The ground falls away too sharply {dirs}.`

Rough terrain:

1. `windthrow`: `Windthrown trunks block movement {dirs}.`
2. `fallen_log_barrier`: `Fallen logs choke the route {dirs}.`
3. `boulder_barrier`: `Large boulders block the way {dirs}.`
4. `lichen_slick_rock`: `Lichen-slick rock makes crossing unsafe {dirs}.`
5. `root_ridges`: `Raised root ridges break the footing {dirs}.`
6. `drainage_cuts`: `Frequent drainage cuts interrupt the ground {dirs}.`
7. `dense_growth`: `Dense growth closes the way {dirs}.`
8. `dense_trees`: `A dense stand leaves no clear line {dirs}.`
9. `bramble_thicket`: `A bramble thicket closes the way {dirs}.`

## Example transformations

### Example A: stream-driven blockage

Input:

- blockage run directions: `W`, `NW`
- selected reason on run: `blocked_by = wide_stream`

Output:

- `The stream is too wide to cross west and northwest.`

### Example B: mixed causes

Input:

- blockage run 1: `N`, `NE`, `E`, `blocked_by = lake`
- blockage run 2: `SW`, `blocked_by = windthrow`

Output:

1. `Open water blocks the way north, northeast, and east.`
2. `Windthrown trunks block movement southwest.`

### Example C: bog constraints with a narrow exit hint

Input:

- blockage run: `N`, `NE`, `E`, `blocked_by = bog_deep_water`
- one passable direction `W`

Output:

1. `Bog water lies too deep to cross north, northeast, and east.`
2. `A drier hummock offers passage to the west.` (optional passage hint, separate from `blocked_by`)

## Non-goals and guardrails

1. `blocked_by` explains blocked movement; it does not replace passability truth.
2. Causes are plausible and signal-grounded; avoid unsupported narrative invention.
3. Blockage-run-to-cause binding must be preserved in structured output.

## Open questions for alignment

1. Should `lake` remain an absolute narrative override in all mixed-cause groups?
2. Should `wide_stream` outrank generic `deep_water` when both are eligible?
3. Which thresholds should gate hydrology dominance so stream/water reasons do not overfire?
4. Should `difficult` continue to map into blockage-style reasoning for this slot, or stay separate?
5. Should optional passage hints (for example, `drier_hummock`) be introduced now or deferred?

## Proposed rollout

1. Add `blocked_by` structured output only.
2. Validate reason coverage and direction binding on real maps.
3. Introduce reason-based sentence rendering once mappings are stable.
