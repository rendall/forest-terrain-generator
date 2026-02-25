# Landform/Biome Slot Split Checklist

## Stage 1 — Decouple Slot Generation

- [x] [description] Remove landform+biome anchor merge construction in function `generateRawDescription` in `src/pipeline/description.ts`
- [x] [description] Create a standalone `landform` sentence object in function `generateRawDescription` in `src/pipeline/description.ts` with `slot`, `basicText`, `contributors`, and `contributorKeys.landform`
- [x] [description] Create a standalone `biome` sentence object in function `generateRawDescription` in `src/pipeline/description.ts` with `slot`, `basicText`, `contributors`, and `contributorKeys.biome`
- [x] [description] Stop assigning biome contributor metadata to the `landform` sentence object in function `generateRawDescription` in `src/pipeline/description.ts` (depends on previous two items)
- [x] [description] Ensure `landform.basicText` does not reference biome content in phrase selection path `phraseOptionsForLandform` in `src/pipeline/description.ts`
- [x] [description] Ensure `biome.basicText` does not reference landform content in phrase selection path `phraseOptionsForBiome` in `src/pipeline/description.ts`

## Stage 2 — Transition Output Without Transform Logic

- [x] [description] Set `text` from `basicText` for `landform` sentence objects in function `generateRawDescription` in `src/pipeline/description.ts`
- [x] [description] Set `text` from `basicText` for `biome` sentence objects in function `generateRawDescription` in `src/pipeline/description.ts`
- [x] [cli] Keep structured sentence mapping fallback rule `text = sentence.text ?? sentence.basicText` in function `attachTileDescriptions` in `src/app/run-describe.ts`
- [x] [cli] Emit `basicText` for both `landform` and `biome` sentence objects in structured output mapping in function `attachTileDescriptions` in `src/app/run-describe.ts`
- [x] [description] Preserve existing `movement_structure` `basicText`/`text` handling in function `generateRawDescription` in `src/pipeline/description.ts` (depends on Stage 2 items above)

## Stage 3 — Ordering, Dedupe, and Cap Behavior

- [ ] [description] Insert `biome` sentence immediately after `landform` sentence in sentence assembly order in function `generateRawDescription` in `src/pipeline/description.ts`
- [ ] [description] Update dedupe keying to avoid cross-slot collapse between `landform` and `biome` sentences in dedupe loop in function `generateRawDescription` in `src/pipeline/description.ts`
- [ ] [description] Keep deterministic sentence cap behavior (`slice(0, 4)`) after separate slot insertion in function `generateRawDescription` in `src/pipeline/description.ts`
- [ ] [description] Preserve prose text assembly so both `landform` and `biome` transformed/baseline `text` values are included in `DescriptionResult.text` in function `generateRawDescription` in `src/pipeline/description.ts`
- [ ] [description] Preserve exclusion rule for `movement_structure` from top-level prose assembly in function `generateRawDescription` in `src/pipeline/description.ts`

## Stage 4 — Tests (Override Allowed)

- [ ] [tests] Add unit assertion in `test/unit/phase6-description-phase1.test.mjs` that `generateRawDescription` emits separate `landform` and `biome` slots
- [ ] [tests] Add unit assertion in `test/unit/phase6-description-phase1.test.mjs` that merged `", where "` landform/biome anchor text is no longer emitted
- [ ] [tests] Add unit assertion in `test/unit/phase6-description-phase1.test.mjs` that both `landform` and `biome` sentences include `basicText`
- [ ] [tests] Add unit assertion in `test/unit/phase6-description-phase1.test.mjs` that both `landform` and `biome` sentences include `text` fallback from `basicText`
- [ ] [tests] Add integration assertion in `test/integration/cli-describe.test.mjs` that structured output contains both `landform` and `biome` sentence objects with `basicText`
- [ ] [tests] Add integration assertion in `test/integration/cli-describe.test.mjs` that `landform.text === landform.basicText` and `biome.text === biome.basicText` in this phase
- [ ] [tests] Add regression case in `test/unit/phase6-description-phase1.test.mjs` for sentence ordering (`landform` then `biome`) under capped output (depends on Stage 3 ordering item)
- [ ] [tests] Add regression case in `test/unit/phase6-description-phase1.test.mjs` that `movement_structure` remains excluded from top-level prose text
