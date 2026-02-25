# Fast Movement Phrases Implementation Checklist

Purpose: ship a minimal movement prose upgrade quickly, using predicate-gated blockage phrase pools and deterministic wording variation.

Primary reference: `docs/drafts/FastMovementPhrases-Proposal.md`

## 0) Scope lock

- [ ] Confirm this work only changes `movement_structure` wording behavior.
- [ ] Confirm no terrain-generation logic changes.
- [ ] Confirm no new required terrain fields are introduced.
- [ ] Confirm existing sentence cap/order behavior remains unchanged unless explicitly listed below.
- [ ] Treat this as a follow-up text pass to Stage 2A: preserve topology baseline in `basicText`, and apply fast-phrase prose to transformed `text`.

## 1) Data model changes (minimal)

Target file: `src/pipeline/description.ts`

- [ ] Keep existing `MovementRun` extraction behavior.
- [ ] Add optional `blockedBy?: string` on blockage runs to store selected phrase text directly.
- [ ] Invariant: `blockedBy` is only allowed on runs where `type === "blockage"` (never on `passage` runs).
- [ ] Keep passage runs unchanged.
- [ ] Keep `DescriptionSentence.basicText` as baseline movement sentence.
- [ ] Keep `DescriptionSentence.text` as transformed movement sentence.

Target file: `src/app/run-describe.ts`

- [ ] Ensure structured output mapping includes `movement[].blockedBy` when present.
- [ ] Keep sentence-level fallback:
  - [ ] `out.text = sentence.text ?? sentence.basicText`

## 2) Phrase rule system

Target file: `src/pipeline/description.ts`

- [ ] Add a small ordered rule set:
  - [ ] Rule shape includes `id`, `when(ctx)`, and `phrases: readonly string[]`.
  - [ ] `when` predicates use only existing signals.
  - [ ] Rule order is fixed and deterministic.
  - [ ] Implement the exact rule IDs, predicates, and phrase arrays from `FastMovementPhrases-Proposal.md` Appendix A (no additions/removals in this phase).
- [ ] Build a run-local context object for predicate evaluation:
  - [ ] tile-level: `biome`, `landform`, `obstacles`, `slopeStrength`, `followable`
  - [ ] run-level: blockage directions + neighbor signals for those directions
- [ ] Ensure `followable` is passed through the description input mapping path for this task (do not leave it optional in rule evaluation).
- [ ] Implement phrase pool collection:
  - [ ] Evaluate `lake_water` override first using run-local blocked directions.
  - [ ] If `lake_water` passes for a blockage run, build pool from `lake_water` phrases only and skip non-lake rules for that run.
  - [ ] If `lake_water` does not pass, evaluate remaining rules in fixed order.
  - [ ] Concatenate phrases from passing non-lake rules in that same order.
  - [ ] Keep duplicates in the concatenated pool (multiset behavior; no dedupe).
  - [ ] If no phrases are eligible, return `null`.

## 3) Deterministic phrase selection

Target file: `src/pipeline/description.ts`

- [ ] Reuse deterministic picker (`pickDeterministic`) for blocked phrase choice.
- [ ] Implement exact blockage phrase key format from `FastMovementPhrases-Proposal.md` Appendix D:
  - [ ] `` `${seedKey}:movement_structure:blockage:${runIndex}:phrase` ``
- [ ] Define `runIndex` exactly as Appendix D specifies.
- [ ] For each blockage run:
  - [ ] Pick one phrase from the eligible pool.
  - [ ] When lake override is active for a run, ensure selected phrase comes only from the `lake_water` phrase list.
  - [ ] Attach phrase as `run.blockedBy`.

## 4) Traversal noun rotation

Target file: `src/pipeline/description.ts`

- [ ] Add traversal noun pool for movement text variation:
  - [ ] Implement the exact noun catalog from `FastMovementPhrases-Proposal.md` Appendix B.
- [ ] Pick one noun deterministically per `movement_structure` sentence and reuse it across all clauses/runs in that sentence.
- [ ] Implement exact traversal noun key format from `FastMovementPhrases-Proposal.md` Appendix D:
  - [ ] `` `${seedKey}:movement_structure:noun` ``
- [ ] Handle article grammar when `opening` is selected (for example, `An opening ...`).

## 5) Text rendering behavior

Target file: `src/pipeline/description.ts`

- [ ] Keep baseline movement sentence generation for `basicText`.
- [ ] Add transformed renderer for `movement_structure.text`:
  - [ ] Passage-oriented text uses rotated traversal noun.
  - [ ] If biome-aware phrasing is used, keep it minimal:
    - [ ] `open_bog` => `across the bog`
    - [ ] `spruce_swamp` => `through the swamp`
    - [ ] default => `through the trees`
  - [ ] Blockage-oriented text uses `blockedBy` phrase directly (no transformation layer).
  - [ ] Multi-run blockage output format is fixed:
    - [ ] Run order: canonical movement run order.
    - [ ] Single blockage run: `The {noun} to the {dirs} is blocked by {phrase}.`
    - [ ] Multiple blockage runs: one sentence, first clause as above, subsequent clauses as `to the {dirs} by {phrase}`, joined with comma+`and` list punctuation.
  - [ ] Fallback policy is all-or-nothing:
    - [ ] if any blockage run lacks an eligible phrase pool, do not emit partial transformed blockage text.
    - [ ] leave transformed `sentence.text` unset and rely on `basicText` fallback for the whole movement sentence.
    - [ ] when this fallback triggers, omit `blockedBy` from all runs in that movement sentence.
- [ ] Write transformed output to `sentence.text`.

## 6) Plausibility guards

Target file: `src/pipeline/description.ts`

- [ ] Keep predicates conservative to avoid unsupported phrases.
- [ ] Use run-local checks for directional claims (for example, stream-adjacent blockage).
- [ ] Do not allow unrestricted random selection from all phrases.

## 7) Unit tests

Target file: `test/unit/phase6-description-phase1.test.mjs` (or focused movement text test file)

- [ ] Add test: identical input+seed yields identical selected `blockedBy` phrases.
- [ ] Add test: different seed key can vary phrase/noun selection deterministically.
- [ ] Add test: no eligible phrase pool falls back to whole-sentence `basicText`.
- [ ] Add test: blockage run phrase is inserted directly into transformed text.
- [ ] Add test: traversal noun rotates among allowed set (`path|track|way|opening`).
- [ ] Add test: `opening` template grammar is valid.
- [ ] Add test: duplicate phrases in the eligible pool are preserved (no dedupe).
- [ ] Add test: implemented rule IDs/predicate outcomes match Appendix A fixtures (at least one fixture per rule).
- [ ] Add test: mixed-cause blockage run containing any lake direction uses `lake_water` override for the entire run.
- [ ] Add test: if one blockage run has phrases but another does not, transformed text is not emitted and output falls back to `basicText`.
- [ ] Add test: when whole-sentence fallback triggers, all run-level `blockedBy` fields are omitted.
- [ ] Add test: seed-key construction for noun and blockage phrase picks matches Appendix D format and is stable.

## 8) Integration checks

Target files:
- `test/unit/describe-attach.test.mjs`
- `test/integration/cli-describe.test.mjs`

- [ ] Assert structured movement runs may include `blockedBy` phrase strings.
- [ ] Assert `movement_structure` still exposes `basicText` and `text`.
- [ ] Assert transformed text differs from baseline when eligible phrases exist.

## 9) Verification commands

- [ ] `npm run typecheck`
- [ ] `npm test -- test/unit/phase6-description-phase1.test.mjs test/unit/describe-attach.test.mjs test/integration/cli-describe.test.mjs`

## 10) Done criteria

- [ ] Movement prose feels less repetitive and more contextual on `forest.json` samples.
- [ ] Output remains deterministic for fixed input+seed.
- [ ] No non-movement slots regressed.
- [ ] Existing CLI behavior and output contract remain intact.
