# Fast Movement Phrases Proposal (Discussion Draft)

## Purpose

Improve `movement_structure` prose quickly with minimal machinery.

Current text is often generic. Target text should feel more contextual with low implementation risk.

Examples:

- `A path through the trees leads to the southeast.`
- `A track across the bog leads to the west.`
- `The way to the north, west, and east is blocked by a stand of trees, and to the south by a wide stream.`

## Scope

In scope:

1. Improve `movement_structure.text` wording only.
2. Keep deterministic output.
3. Select one blockage phrase per blockage run via predicate-gated phrase pools.
4. Rotate traversal nouns deterministically (`path`, `track`, `way`, `opening`).

Out of scope:

1. Terrain-generation logic changes.
2. New simulation fields.
3. Large scoring/precedence frameworks.
4. Rewriting non-movement description slots.

## Core model

For each blockage run:

1. Check lake override first: if any direction in the blockage run has lake context, treat the entire run as `lake_water`.
2. If lake override fired, skip non-lake rule pooling for that run and pick deterministically from the `lake_water` phrase list.
3. Otherwise, evaluate the remaining ordered predicate rules against run-local and tile context.
4. Collect phrases from passing rules by appending each rule's phrase array to a single pool.
5. Keep duplicates in the pool (multiset behavior; no dedupe).
6. Deterministically pick one phrase from the collected pool.
7. Store that picked phrase directly on the run as `blocked_by` and render it directly in text.

No reason-key-to-template transformation stage is required in this proposal.

## Rule shape

Suggested shape:

```ts
type BlockedPhraseRule = {
  id: string;
  when: (ctx: BlockageRunContext) => boolean;
  phrases: readonly string[];
};
```

Notes:

1. `id` is for maintainability and tests.
2. `when` is a predicate; this is the plausibility gate.
3. `phrases` are direct renderable phrases (for example, `a wide stream`, `deep water`, `a stand of trees`).

## Minimum context signals

Use already-available inputs only:

1. `biome`
2. `landform`
3. `obstacles`
4. `slopeStrength`
5. `followable`
6. Run directions and neighbor water/elevation signals

## Determinism rules

1. Rule evaluation order is fixed.
2. `lake_water` is a run-level override: if triggered, use only the `lake_water` phrase list for that run.
3. Phrase pool concatenation (for non-lake runs) follows rule order.
4. Duplicates are preserved intentionally (implicit weighting); no dedupe pass is applied.
5. Selection uses deterministic seeded pick with exact key formats defined in Appendix D.
6. Direction ordering remains canonical ring order.

## Passage noun rotation

Traversal noun pool:

1. `path`
2. `track`
3. `way`
4. `opening`

Pick deterministically per tile/run and reuse within the same movement sentence.
When `opening` is selected, sentence templates should use appropriate article/grammar (for example, `An opening ...`).

## Text behavior

1. If open exits dominate, keep existing passage-first behavior and emit path-style sentence using rotated noun and biome-aware context:
   - `open_bog` => `across the bog`
   - `spruce_swamp` => `through the swamp`
   - fallback => `through the trees`
2. For blockage runs, use selected phrase directly:
   - `The {noun} to the {dirs} is blocked by {blocked_by_phrase}.`
3. Multiple blockage runs render as deterministic joined clauses.
4. Lake override applies to the whole blockage run, not per-direction wording.
5. Fallback is all-or-nothing for the movement sentence:
   - if any blockage run cannot produce an eligible phrase pool, do not emit partial transformed blockage text.
   - fall back the whole `movement_structure.text` to `basicText`.
   - clear `blocked_by` on all runs for that movement sentence (no partial structured attribution when fallback triggers).

## Proposed structured shape

No schema expansion required beyond existing `movement[]` run objects. Keep run-level attachment minimal:

```json
{
  "type": "blockage",
  "directions": ["N", "W", "E"],
  "blocked_by": "a stand of trees"
}
```

`blocked_by` here is the selected phrase string, not a reason key.

## Rationale

1. Very small implementation surface.
2. Better prose immediately.
3. Deterministic and testable.
4. Easy to extend later by adding rules/phrases without redesign.

## Risks and mitigations

Risk: implausible phrases if predicates are too loose.
Mitigation: keep predicates explicit and conservative; require run-local checks where relevant.

Risk: repetition.
Mitigation: phrase arrays plus deterministic selection and noun rotation.

## Compatibility note

`docs/drafts/ImplementationPlan.md` currently references a "topology-only" Stage 2A movement sentence. This proposal should be treated as a separate follow-up text pass unless that sequencing note is intentionally revised.

## Appendix A: Locked v1 Rule Catalog (Ordered)

This appendix defines the exact v1 catalog to implement for fast movement phrases.

1. Rules are evaluated in listed order.
2. Special-case override: if Rule 1 (`lake_water`) predicate passes for a blockage run, that whole run uses only Rule 1 phrases.
3. If Rule 1 does not pass, evaluate Rules 2..N and append phrases from passing rules.
4. Duplicates are preserved (no dedupe).
5. If any blockage run's final eligible pool is empty, use whole-sentence `basicText` fallback.
6. On whole-sentence fallback, `blocked_by` is omitted on all runs for that sentence.

Rule 1:

- `id`: `lake_water`
- `predicate`: any blocked-run neighbor has water class `lake`
- `signals`: `neighborWater`
- `override`: yes (whole-run override; skip Rules 2..N for this run)
- `phrases`:
  - `lake water`
  - `the lake`
  - `deep water`
  - `a broad stretch of water`

Rule 2:

- `id`: `stream_crossing`
- `predicate`: any blocked-run neighbor has water class `stream`
- `signals`: `neighborWater`
- `phrases`:
  - `a wide stream`
  - `running water`
  - `a fast-moving channel`
  - `the stream`

Rule 3:

- `id`: `saturated_ground`
- `predicate`: `biome === "open_bog"` OR `biome === "spruce_swamp"` OR any blocked-run neighbor has water class `marsh`
- `signals`: `biome`, `neighborWater`
- `phrases`:
  - `deep bog`
  - `saturated ground`
  - `soft, waterlogged soil`
  - `wet ground`

Rule 4:

- `id`: `steep_rise`
- `predicate`: `slopeStrength >= 0.10` AND any blocked-run neighbor elevation delta `> 0.08`
- `signals`: `slopeStrength`, `neighborElevDelta`
- `phrases`:
  - `a steep rise`
  - `a sharp incline`
  - `rising ground`
  - `a sudden climb`

Rule 5:

- `id`: `windthrow`
- `predicate`: obstacles include `windthrow` OR `deadfall` OR `fallen_log`
- `signals`: `obstacles`
- `phrases`:
  - `a tangle of fallen trees`
  - `deadfall`
  - `a mass of broken timber`
  - `uprooted trunks`

Rule 6:

- `id`: `brush_blockage`
- `predicate`: obstacles include `brush_blockage`
- `signals`: `obstacles`
- `phrases`:
  - `dense brush`
  - `thick undergrowth`
  - `a stand of young trees`
  - `close growth`

Rule 7:

- `id`: `ridge_edge`
- `predicate`: `landform === "ridge"` AND any blocked-run neighbor elevation delta `< -0.08`
- `signals`: `landform`, `neighborElevDelta`
- `phrases`:
  - `a drop along the ridge edge`
  - `falling ground`
  - `the edge of the ridge`

Rule 8:

- `id`: `dense_stand`
- `predicate`: `biome === "spruce_swamp"` OR `biome === "mixed_forest"`
- `signals`: `biome`
- `phrases`:
  - `a dense stand of trees`
  - `close-set trunks`
  - `thick forest`

## Appendix B: Traversal Noun Catalog (Locked v1)

Use this exact noun pool for deterministic movement variation:

1. `path`
2. `track`
3. `way`
4. `opening`

Grammar rule:

1. If selected noun is `opening`, use `An opening ...`.
2. Otherwise use `A {noun} ...` unless another template form is explicitly defined.

## Appendix C: Predicate Context Contract (Locked v1)

Predicates in Appendix A assume this run context shape:

```ts
type BlockageRunContext = {
  biome: string;
  landform: string;
  obstacles: readonly string[];
  slopeStrength: number;
  followable: readonly string[];
  runDirections: Direction[];
  neighborWater: ("none" | "lake" | "stream" | "marsh")[];
  neighborElevDelta: number[];
};
```

`neighborWater` and `neighborElevDelta` arrays are run-local over blocked directions in canonical run direction order.

## Appendix D: Seed Key Contract (Locked v1)

Use these exact seed-key formats:

1. Traversal noun pick key:
   - `` `${seedKey}:movement_structure:noun` ``
2. Blockage phrase pick key per blockage run:
   - `` `${seedKey}:movement_structure:blockage:${runIndex}:phrase` ``
3. `runIndex`:
   - zero-based index of the blockage run in canonical movement-run order.
4. No additional entropy:
   - do not append timestamps, counters, random values, or non-deterministic identifiers.
