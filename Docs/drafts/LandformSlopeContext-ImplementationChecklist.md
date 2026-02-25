# Landform Slope Context Implementation Checklist

## Stage 1: Data Contract

- [x] [description] Add optional field `contributors?: Record<string, unknown>` to interface `DescriptionSentence` in `src/pipeline/description.ts`
- [x] [cli] Map `sentence.contributors` to `contributors` in structured sentence output inside `attachTileDescriptions` in `src/app/run-describe.ts` (depends on previous item)
  - Keep `contributors` passthrough-only in this step; do not transform keys.

## Stage 2: Local Slope Derivation

- [x] [description] Add helper `oppositeDirection(direction: Direction): Direction` in `src/pipeline/description.ts` using ring index math on the existing Dir8 order
- [x] [description] Add helper `classifyLocalSlopeBand(input: DescriptionTileInput): "flat" | "gentle" | "none" | "steep"` in `src/pipeline/description.ts` using thresholds: `landform==="flat"` => `flat`, `<0.05` => `gentle`, `>0.1` => `steep`, otherwise `none`
- [x] [description] Treat `landform === "plain"` as `flat` in `classifyLocalSlopeBand` in `src/pipeline/description.ts` (depends on previous item)
- [x] [description] Add helper `renderLocalLandformSentence(input: DescriptionTileInput): { text: string; mode: "rise" | "descend" | "flat"; direction: Direction | null; band: "flat" | "gentle" | "none" | "steep" }` in `src/pipeline/description.ts` (depends on previous two items)
  - Apply exception rule: if rise-direction neighbor is `same` (`abs(elevDelta) < 0.03`), render descend wording in downhill direction.
- [x] [description] Use fixed local sentence templates in `renderLocalLandformSentence` in `src/pipeline/description.ts`: `Here the land is flat.` or `Here the land ${qualifier}${verb} to the {dir}.` where `qualifier` is `"" | "gently " | "steeply "` and `verb` is `rises|descends` (depends on previous item)

## Stage 3: Neighbor Context Derivation

- [x] [description] Add helper `classifyNeighborDelta(elevDelta: number): { mode: "rise" | "descend" | "same"; band: "same" | "gentle" | "none" | "steep" }` in `src/pipeline/description.ts` using thresholds: `<0.03 same`, `0.03.. <0.086 gentle`, `0.086.. <=0.1 none`, `>0.1 steep`
- [x] [description] Add helper `collectNeighborLandformSignals(input: DescriptionTileInput): Array<{ direction: Direction; mode: "rise" | "descend" | "same"; band: "same" | "gentle" | "none" | "steep" }>` in `src/pipeline/description.ts` by evaluating all eight neighbors in canonical ring order (depends on previous item)
- [ ] [description] Add helper `groupNeighborLandformSignals(signals: ReturnType<typeof collectNeighborLandformSignals>): Array<{ directions: Direction[]; mode: "rise" | "descend" | "same"; band: "same" | "gentle" | "none" | "steep" }>` in `src/pipeline/description.ts` that groups contiguous identical `(mode, band)` runs and merges wraparound runs when the first and last groups share the same `(mode, band)` (depends on previous item)
- [ ] [description] Add helper `renderNeighborLandformSentences(groups: ReturnType<typeof groupNeighborLandformSignals>): string[]` in `src/pipeline/description.ts` that emits one sentence per group without optimization collapse (depends on previous item)
- [ ] [description] Use fixed neighbor templates in `renderNeighborLandformSentences` in `src/pipeline/description.ts`: `To the {dirs}, the land stays level.` for `same`, otherwise `To the {dirs}, the land ${qualifier}${verb}.` with `qualifier` and `verb` rules matching local rendering (depends on previous item)

## Stage 4: Landform Slot Rendering

- [ ] [description] Add helper `renderDerivedLandform(input: DescriptionTileInput): { basicText: string; contributors: Record<string, unknown> }` in `src/pipeline/description.ts` that combines local sentence + neighbor group sentences into one multi-sentence `basicText` (depends on Stage 2 and Stage 3 helpers)
- [ ] [description] Set a stable minimum `contributors` payload shape in `renderDerivedLandform` in `src/pipeline/description.ts`: `{ local, neighbors, thresholds, exception }` (depends on previous item)
  - `local`: `{ mode, direction, band, slopeStrength, landform }`; `neighbors`: `[{ directions, mode, band, minAbsDelta, maxAbsDelta }]`; `thresholds`: numeric constants; `exception`: `{ applied, rule }`.
- [ ] [description] Replace landform phrase-bank selection in `generateRawDescription` in `src/pipeline/description.ts` with `renderDerivedLandform(input)` output for the `landform` sentence object (depends on previous item)
- [ ] [description] Set `landform` sentence fields in `generateRawDescription` to `basicText` (derived), `text` (same as `basicText`), `contributorKeys.landform` (legacy), and `contributors` (derived payload) (depends on previous item)
- [ ] [description] Keep biome generation path unchanged in `generateRawDescription` so `biome` remains a separate slot and is not merged into landform text (depends on previous item)

## Stage 5: Cleanup

- [ ] [description] Remove unused landform-only phrase selection code in `src/pipeline/description.ts` after landform renderer migration (`DEFAULT_LANDFORM_PHRASES`, `LANDFORM_PHRASES`, `phraseOptionsForLandform`) (depends on Stage 4 completion)
- [ ] [description] Do not modify `renderMovementStructureSentence` in `src/pipeline/description.ts` during this checklist implementation (depends on Stage 4 completion)
- [ ] [description] Do not modify `renderFollowableSentence` in `src/pipeline/description.ts` during this checklist implementation (depends on Stage 4 completion)
- [ ] [cli] Do not modify `runDescribe` behavior in `src/app/run-describe.ts` beyond `contributors` passthrough added in Stage 1 (depends on Stage 4 completion)
