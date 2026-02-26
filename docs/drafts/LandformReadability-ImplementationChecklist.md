# Landform Readability Implementation Checklist

When complete, these items will make landform prose read as terrain shape rather than coordinate output while preserving navigational precision in traversal sentences. Landform descriptions will prefer side-based phrasing over arc-style direction spans, majority/exception wording will stay deterministic and intensity-safe, lake directional grammar will be normalized, and the existing slot order and suppression behavior will remain intact.

- [ ] [description] Add helper `cardinalSidesForDirections(directions: readonly Direction[]): Direction[]` in `src/pipeline/description.ts` that maps a contiguous direction run to one or two cardinal side labels (`N`, `E`, `S`, `W`) for landform prose
  - Uses ring-contiguous directional membership to derive side coverage deterministically.

- [ ] [description] Add helper `formatLandformSideLabel(directions: readonly Direction[]): string | null` in `src/pipeline/description.ts` that returns phrases like `"the northern side"` or `"the northern and eastern sides"` (depends on previous item)

- [ ] [description] Add helper `renderLandformSideClause(group: NeighborLandformGroup): string | null` in `src/pipeline/description.ts` that renders side-based terrain clauses like `"The land descends across the northern and eastern sides."` for slope/shape narration only (depends on previous item)

- [ ] [description] Update `renderNeighborLandformSentences` in `src/pipeline/description.ts` to stop using arc wording (`"From X to Y, ..."`) for landform clauses and use `renderLandformSideClause` when side labeling is available (depends on previous item)

- [ ] [description] Keep explicit direction-list rendering in `renderPassageTransformedText` and `renderBlockageTransformedText` in `src/pipeline/description.ts` unchanged so navigation mechanics remain compass-precise

- [ ] [description] Update `renderMajorityNeighborLandformSentence` in `src/pipeline/description.ts` to prefer `across/on` side wording for the dominant mode when the minority mode still exists, while preserving current `most directions`/`nearly every direction` thresholds

- [ ] [description] Update `renderMajorityNeighborLandformSentence` in `src/pipeline/description.ts` to keep intensity adjectives only when all contributing groups for that mode share one band, and omit intensity when bands are mixed

- [ ] [description] Keep local-overlap suppression in `renderDerivedLandform` in `src/pipeline/description.ts` unchanged so local landform text remains suppressed whenever an emitted neighbor clause already covers the same direction

- [ ] [description] Normalize lake directional phrase grammar in `LAKE_PHRASES` in `src/pipeline/description.ts` by replacing article-less forms (e.g. `"Shoreline curves here..."`) with article-correct forms (e.g. `"The shoreline curves..."`)

- [ ] [description] Normalize placeholder usage in `LAKE_PHRASES` in `src/pipeline/description.ts` to `{dir}` only (remove mixed `${dir}` forms) so phrase templates are internally consistent

- [ ] [description] Keep sentence slot ordering in `generateRawDescription` in `src/pipeline/description.ts` as `biome -> landform -> hydrology/lake -> followable -> movement_structure` while applying the updated landform wording rules
