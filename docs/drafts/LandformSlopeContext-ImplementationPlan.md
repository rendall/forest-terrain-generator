# Landform Slope Context Implementation Plan

## Goal

Make `landform` description derive from local slope/aspect and neighbor elevation context instead of static landform phrase-bank labels, while preserving determinism and structured output.

## Non-goals (This Phase)

- No macro-feature prepass (hill systems, valley systems, regional context).
- No neighbor slope/aspect derivation in this phase.
- No optimization pass for prose compression beyond contiguous grouping.
- No sentence-cap redesign in this phase.

## Phase 1: Data Contract and Plumbing

1. Extend `DescriptionSentence` with optional `contributors` object (plural), used for derived diagnostics.
2. For `slot: "landform"`, emit:
   - `basicText` (may be multi-sentence)
   - `text` (same as `basicText` in this phase)
   - `contributorKeys.landform` (legacy key retained)
   - `contributors` (new derived payload)
3. In structured output mapping, pass through `contributors` when present.

Files:

- `src/pipeline/description.ts`
- `src/app/run-describe.ts`

## Phase 2: Local Landform Derivation

Derive local landform narration from:

- `slopeStrength`
- `slopeDirection` (spec-aligned downhill direction)
- `landform` (flat hint)

Rules:

1. Default local wording uses rise direction (opposite of downhill direction):
   - `Here the land gently rises to the north.`
2. Exception rule:
   - If the neighbor in the rise direction is flat, switch to descend wording in the downhill direction.
3. Intensity bands:
   - `flat`: local `landform === "flat"` (spec-aligned flat hint).
   - `gentle`: local `slopeStrength < 0.05`.
   - `(none)`: local `0.05 <= slopeStrength <= 0.1`.
   - `steep`: local `slopeStrength > 0.1`.

## Phase 3: Neighbor Context Derivation

For each Dir8 neighbor:

1. Classify from `elevDelta`:
   - `rise`, `descend`, or `same`
2. Assign intensity from `abs(elevDelta)`:
   - `same`: `abs(elevDelta) < 0.03`
   - `gentle`: `0.03 <= abs(elevDelta) < 0.086`
   - `(none)`: `0.086 <= abs(elevDelta) <= 0.1`
   - `steep`: `abs(elevDelta) > 0.1`
3. Group contiguous directions around the ring by identical class and intensity.
4. Do not collapse/optimize further in this phase. Emit all groups.

## Phase 4: Landform Text Rendering

Render order:

1. Local sentence first.
2. One sentence per grouped neighbor segment.

Example patterns:

- `Here the land is flat.`
- `Here the land steeply rises to the southeast.`
- `To the north, northwest, and west the land rises steeply.`
- `To the east and southeast, the land gently descends.`

Constraints:

- `basicText` may be multi-sentence.
- Output remains deterministic via canonical ring ordering and stable grouping.

## Phase 5: Integration Behavior

1. Replace phrase-bank landform sentence selection with derived landform renderer.
2. Keep `biome` slot independent and unchanged.
3. Keep movement/followable logic unchanged.
4. Preserve `contributorKeys.landform` and add `contributors` for derived payload.

## Phase 6: Test Plan

1. Unit tests for local direction semantics:
   - downhill vs rise direction correctness
   - flat handling
   - descend exception rule
2. Unit tests for neighbor grouping:
   - contiguous grouping correctness around wrap boundaries
3. Unit tests for deterministic multi-sentence `basicText` generation.
4. Structured output tests:
   - `landform.contributor` shape present
   - `contributorKeys.landform` retained
5. Regression tests confirming other slots are unaffected.

## Open Decisions Before Checklist

1. Final wording templates for local and neighbor sentences (content polish only; not a blocker).
2. Final `contributors` schema fields for landform derived payload (can evolve without blocking core implementation).
