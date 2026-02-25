# Landform Neighbor Compression - Implementation Checklist

- [ ] [description] Add helper `isMergeCompatibleNeighborBand(a, b)` in `src/pipeline/description.ts` that returns `true` for exact band matches and for `gentle`+`none` combinations.
- [ ] [description] Add helper `mergeNeighborLandformGroups(groups)` in `src/pipeline/description.ts` to merge adjacent contiguous groups when `mode` matches and `isMergeCompatibleNeighborBand(...)` is `true` (depends on previous item).
- [ ] [description] Update `renderDerivedLandform` in `src/pipeline/description.ts` to run grouped neighbor signals through `mergeNeighborLandformGroups(...)` before sentence rendering and contributor assembly (depends on previous item).
  - Ensures prose and structured diagnostics are derived from the same merged group set.
- [ ] [description] Add helper `isContiguousDirectionRun(directions)` in `src/pipeline/description.ts` that validates a wrap-safe contiguous run using ring order.
- [ ] [description] Add helper `formatDirectionArc(directions)` in `src/pipeline/description.ts` that renders arc wording as `from the {start} to the {end}` for contiguous runs (depends on previous item).
- [ ] [description] Update `renderNeighborLandformSentences` in `src/pipeline/description.ts` to render `from ... to ...` when a group has at least 4 contiguous directions, and keep existing list wording for groups of 1-3 directions (depends on previous two items).
- [ ] [description] Keep suppression behavior in `shouldEmitNeighborLandformGroup` unchanged and apply it after merge so `same` and single-direction `gentle` groups remain suppressed.
- [ ] [description] Keep local overlap suppression in `renderDerivedLandform` unchanged but evaluate overlap against the merged emitted neighbor groups so local sentence dedupe still works.
- [ ] [description] Add merge diagnostics to each neighbor contribution object in `renderDerivedLandform`: `mergedFromCount: number` and `mergeBands: string[]`.
- [ ] [description] Preserve deterministic direction ordering by retaining `RING` traversal order in merged group `directions` and avoid any alphabetical or intensity-based direction sorting.
