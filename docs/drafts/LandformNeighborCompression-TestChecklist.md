# Landform Neighbor Compression - Test Checklist

- [ ] Add unit test in `test/unit/phase6-description-phase1.test.mjs` that merges adjacent neighbor descend groups when bands are compatible (`gentle` + `none`).
- [ ] Add unit test in `test/unit/phase6-description-phase1.test.mjs` that does not merge non-contiguous neighbor groups even when mode and band are compatible.
- [ ] Add unit test in `test/unit/phase6-description-phase1.test.mjs` that keeps list wording (`to the ...`) for merged groups with 1-3 directions.
- [ ] Add unit test in `test/unit/phase6-description-phase1.test.mjs` that uses arc wording (`from the ... to the ...`) for a contiguous merged group with 4+ directions.
- [ ] Add unit test in `test/unit/phase6-description-phase1.test.mjs` that local landform sentence is suppressed when merged neighbor output already expresses the same direction/mode/band trend.
- [ ] Add unit test in `test/unit/phase6-description-phase1.test.mjs` that structured `contributors.neighbors[]` includes `mergedFromCount` and `mergeBands` with expected values.
- [ ] Add unit test in `test/unit/phase6-description-phase1.test.mjs` that output remains deterministic for identical seed and input after neighbor-group merging.
- [ ] Add unit test in `test/unit/phase6-description-phase1.test.mjs` that ring-order direction sequence is preserved in merged groups and in rendered text.
