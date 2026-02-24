# Directional `blocked_by` Implementation Checklist

Status: Draft execution checklist for disciplined implementation of cause-aware passage text.

Primary reference: `docs/drafts/DirectionalBlockedBy-Proposal.md`

## 0) Scope lock

- [ ] Confirm this phase only adds `blocked_by` machinery to `movement_structure` and does not rewrite unrelated slots.
- [ ] Confirm `movement_structure.basic_text` remains the baseline sentence.
- [ ] Confirm `movement_structure.text` is transformed output (with fallback to `basic_text`).
- [ ] Confirm no terrain-generation/spec changes are included in this phase.

## 1) Data model updates

Target file: `src/pipeline/description.ts`

- [ ] Add `BlockedByReason` union type with these exact keys:
  - `lake`
  - `bog_deep_water`
  - `spruce_swamp_deep_water`
  - `deep_water`
  - `wide_stream`
  - `cliff`
  - `drop`
  - `windthrow`
  - `fallen_log_barrier`
  - `boulder_barrier`
  - `root_ridges`
  - `drainage_cuts`
  - `dense_growth`
  - `dense_trees`
  - `lichen_slick_rock`
  - `bramble_thicket`
- [ ] Extend `MovementRun` to allow `blocked_by?: BlockedByReason` on runs with `type: "blockage"`.
- [ ] Keep `DescriptionSentence.basicText` for baseline movement sentence.
- [ ] Keep `DescriptionSentence.text` for transformed sentence output.

Target file: `src/app/run-describe.ts`

- [ ] Ensure structured mapping includes `movement[].blocked_by` when present.
- [ ] Keep sentence-level fallback rule:
  - `out.text = sentence.text ?? sentence.basicText`.

## 2) Inputs required for reason inference

Target file: `src/pipeline/description.ts`

- [ ] Confirm `DescriptionTileInput` contains all needed fields for reason gating:
  - `biome`
  - `moisture`
  - `standingWater`
  - `slopeStrength`
  - `passability`
  - `obstacles`
  - `neighbors[dir].water`
  - `neighbors[dir].elevDelta`
- [ ] If any required signal is missing, add it to `DescriptionTileInput` and `buildTileSignals()` mapping path in `src/app/run-describe.ts`.

## 3) Constants and thresholds

Target file: `src/pipeline/description.ts`

- [ ] Add named threshold constants (no magic numbers inline):
  - `M_HIGH` (high moisture gate)
  - `LOW_SLOPE_WET_MAX`
  - `STREAM_WIDE_SCORE_MIN`
  - `CLIFF_DELTA_MIN`
  - `DROP_DELTA_MIN`
  - `DENSE_GROWTH_OBSTRUCTION_MIN`
  - `DENSE_TREES_TREE_DENSITY_MIN`
  - `DENSE_TREES_CANOPY_MIN`
- [ ] Add helper booleans:
  - `isHighMoisture(input)`
  - `isHighSaturation(input, runDirections)`
- [ ] Use direct biome equality checks in gating logic (no biome helper wrappers):
  - e.g. `input.biome === "open_bog"`, `input.biome === "spruce_swamp"`

## 4) Candidate generation per blockage run

Target file: `src/pipeline/description.ts`

- [ ] Add helper `collectBlockageRuns(passability)` (reuse existing movement runs and filter `type === "blockage"`).
- [ ] Add `collectCandidatesForBlockageRun(input, run): BlockedByReason[]`.
- [ ] Candidate collection rules (directional over run directions):
  - `lake`: any blocked direction where origin/destination water context touches lake.
  - `wide_stream`: stream context present across run + stream-strength proxy passes threshold.
  - `bog_deep_water`: bog biome + high saturation.
  - `spruce_swamp_deep_water`: spruce-swamp biome + high saturation.
  - `deep_water`: high saturation without biome-specific deep-water selection.
  - `cliff`: steep uphill barrier signal toward blocked directions.
  - `drop`: strong fall-away signal toward blocked directions.
  - `windthrow`: obstacle includes windthrow.
  - `fallen_log_barrier`: obstacle includes fallen_log (or deadfall mapping).
  - `boulder_barrier`: obstacle includes boulder.
  - `root_ridges`: obstacle includes root_tangle.
  - `drainage_cuts`: infer from wet slope micro-relief proxy (document exact heuristic in code comment).
  - `dense_growth`: high low-growth obstruction proxy.
  - `dense_trees`: tree density/canopy gate.
  - `lichen_slick_rock`: rocky + lichen proxy from available ground signals if present.
  - `bramble_thicket`: dense brush proxy (narrative inference).
- [ ] Ensure candidate collection is deterministic in order.

## 5) Eligibility gate + score + tie-break

Target file: `src/pipeline/description.ts`

- [ ] Implement `isEligibleReason(reason, input, run): boolean`.
- [ ] Implement `scoreReason(reason, input, run): number`.
- [ ] Implement stable tie-break precedence list (exact order):
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
- [ ] Implement selector:
  - `selectBlockedByReason(input, run): BlockedByReason | null`
  - pipeline: candidates -> eligible -> highest score -> precedence tie-break.
- [ ] Explicit fall-through behavior:
  - If reason gate fails, do not select it.
  - If no reason survives, keep `blocked_by` undefined and use generic blockage sentence.

## 6) Attach selected reason to movement runs

Target file: `src/pipeline/description.ts`

- [ ] In movement rendering path, after run extraction:
  - for each blockage run, compute `blocked_by`.
  - persist into `movement` array object.
- [ ] Keep passage runs unchanged.
- [ ] Keep adjacency run order stable (ring/canonical order as currently implemented).

## 7) Text generation behavior

Target file: `src/pipeline/description.ts`

- [ ] Add reason template library as arrays (not single strings):
  - Shape: `Record<BlockedByReason, readonly string[]>`.
  - Include all `BlockedByReason` keys with at least one baseline template each.
  - Keep wording editable/expandable later without changing reason-selection logic.
  - For `lake` templates, prefer `lake` / `lake water` wording over `open water`.
- [ ] Implement formatter `formatDirectionsForClause(directions)`.
- [ ] Implement transformed movement text generator:
  - Uses blockage-run reason templates where `blocked_by` exists.
  - Chooses one template via deterministic seeded selection.
  - Falls back to generic blockage wording when `blocked_by` missing.
  - Leaves passage phrasing logic deterministic.
- [ ] Write transformed sentence into `sentence.text`.
- [ ] Preserve baseline in `sentence.basicText`.

## 8) Structured output mapping

Target file: `src/app/run-describe.ts`

- [ ] Ensure each structured movement run includes `blocked_by` when present.
- [ ] Ensure movement sentence emits:
  - `basic_text` (always for movement_structure)
  - `text` (transformed if available, fallback to basic_text)
- [ ] Keep existing fields unchanged:
  - `slot`, `contributors`, `contributorKeys`, `movement`.

## 9) Tests: unit

Target file: `test/unit/phase6-description-phase1.test.mjs` (or new focused movement reason test file)

- [ ] Add test: blockage run with lake context selects `blocked_by = lake`.
- [ ] Add test: bog biome + high saturation selects `bog_deep_water`.
- [ ] Add test: spruce_swamp + high saturation selects `spruce_swamp_deep_water`.
- [ ] Add test: high saturation without bog/swamp selects `deep_water`.
- [ ] Add test: stream context below strength threshold falls through to next eligible reason.
- [ ] Add test: tie score resolves by precedence deterministically.
- [ ] Add test: when no eligible reasons, `blocked_by` omitted and generic blocked text used.
- [ ] Add test: `movement_structure` has both `basicText` and transformed `text`.
- [ ] Add test: transformed `text` differs from `basicText` when reason template applied.
- [ ] Add test: template selection is deterministic for identical input+seed.

## 10) Tests: attach/integration

Target files:
- `test/unit/describe-attach.test.mjs`
- `test/integration/cli-describe.test.mjs`

- [ ] Assert structured movement run objects may include `blocked_by`.
- [ ] Assert movement sentence output includes `basic_text`.
- [ ] Assert `text` exists and equals transformed output (or fallback to `basic_text`).
- [ ] Add regression fixture with known reason to lock exact sentence template output.

## 11) Determinism and safety checks

- [ ] Verify deterministic output for same seed/input across repeated runs.
- [ ] Verify no random/non-stable iteration order in candidate collection or tie-break.
- [ ] Verify no changes to non-movement slots unless explicitly intended.
- [ ] Verify strict mode behavior remains unchanged unless explicitly expanded.

## 12) Documentation updates

- [ ] Keep `docs/drafts/DirectionalBlockedBy-Proposal.md` and implementation in sync.
- [ ] Add short “implemented subset” note in proposal (optional) to mark what was actually shipped.
- [ ] If scope changed materially, add/update issue summary reference.

## 13) Rollout sequence (recommended)

- [ ] Step 1: Implement reason typing + run-level `blocked_by` attachment only.
- [ ] Step 2: Add candidate gating/scoring/tie-break logic.
- [ ] Step 3: Add transformed reason templates to `movement_structure.text`.
- [ ] Step 4: Update structured mapper and tests.
- [ ] Step 5: Run focused tests + typecheck + integration tests.
- [ ] Step 6: Validate on `forest.json` sample outputs for reason plausibility.

## 14) Acceptance criteria

- [ ] Every blockage run can carry at most one selected `blocked_by`.
- [ ] `movement_structure.basic_text` always exists.
- [ ] `movement_structure.text` exists (transformed or fallback).
- [ ] Biome-specific deep-water fall-through behaves exactly:
  - `bog_deep_water` -> `spruce_swamp_deep_water` -> `deep_water`.
- [ ] Stream reasons do not overfire when stream-strength gate is weak.
- [ ] Output remains deterministic.
