# Child-Basin Fill Ordering — Implementation Checklist

Scope: execute the approved child-first basin fill rollout while preserving phase order and deliverables.

## Atomic Checklist Items

- [ ] [docs] Create `docs/drafts/child-basin-fill-ordering-fixture-spec.md` describing the synthetic reference topology (single root, nested levels, sibling branches) and explicit suitability criteria.
- [ ] [test-fixture] Add `buildNestedSiblingBasinFixture()` in `test/unit/helpers/lake-fixtures.mjs` returning `{ shape, h, basinFeatures, tileFeatureIds }` for a deterministic nested+sibling basin graph.
- [ ] [test-fixture] Add a fixture invariant helper in `test/unit/helpers/lake-fixtures.mjs` that validates exactly one root (`parentId: null`), depth `>= 2`, and at least one parent with `>= 2` children.
- [ ] [test-fixture] Add a fixture invariant helper in `test/unit/helpers/lake-fixtures.mjs` that validates tile membership consistency (all referenced basin ids exist; expanded root coverage is complete for fixture scope).
- [ ] [test-char] Add `test/unit/lake-fill-ordering-characterization.test.mjs` to capture current behavior over wetness sweep `k=[1,0.5,0.1,0.01,0.001,0.0001]` using `buildNestedSiblingBasinFixture()`.
- [ ] [test-char] In `test/unit/lake-fill-ordering-characterization.test.mjs`, assert current accounting contract per basin: `totalInflow(parent)=externalInflow(parent)+sum(child overflowExcess)` and preserve observed multi-level partial-fill outcomes where present.
- [ ] [test-char] In `test/unit/lake-fill-ordering-characterization.test.mjs`, include a deterministic readable per-`k` basin summary artifact (inline snapshot/string table) for reviewer inspection.
- [ ] [test-char] In `test/unit/lake-fill-ordering-characterization.test.mjs`, call production entrypoint `deriveHydrology(...)` only; do not call `deriveLakeAccounting(...)` directly from tests.
- [ ] [test-char] Add at least one independent oracle assertion (output-contract/algebraic) that is not a test-side clone of accounting control flow.
- [ ] [process] Run a local mutation-sensitivity check (temporary accounting comparison flip, then revert) and confirm characterization/expected-behavior tests fail before merge.
- [ ] [test-expected] Add `test/unit/lake-fill-ordering-child-first.test.mjs` that encodes desired invariant scenarios on the same fixture: unfilled-child blocks parent fill; all-children-filled unlocks parent fill; mixed child states keep parent blocked.
- [ ] [test-expected] In `test/unit/lake-fill-ordering-child-first.test.mjs`, assert overflow propagation semantics still hold after gate-open transitions.
- [ ] [hydrology] In `src/pipeline/derive-lake-accounting.ts`, add explicit child-gate computation (`allChildrenFilled`) in the postorder basin loop.
- [ ] [hydrology] In `src/pipeline/derive-lake-accounting.ts`, compute `rawInflow=externalInflow+childOverflow` and `effectiveInflow` gated by child completion; use `effectiveInflow` for fill computations (`fillRatio`, `isFilled`, `overflowExcess`).
- [ ] [hydrology] In `src/pipeline/derive-lake-accounting.ts`, document and enforce `totalInflow` field semantics (raw vs effective), and keep behavior deterministic.
- [ ] [docs] Update `docs/drafts/child-basin-fill-ordering-implementation-plan.md` with final implementation notes and any clarified field semantics produced by checklist execution.
- [ ] [docs] Add `docs/drafts/child-basin-fill-ordering-mismatch-report-template.md` containing required mismatch fields (`k`, basin ids, child fill states, raw/effective inflow, expected vs actual, classification).
- [ ] [process] If characterization and expected-behavior results conflict after implementation, produce a mismatch report using the template before changing assertions or policy.
- [ ] [process] If unresolved semantic ambiguity remains (for example `totalInflow` meaning), record the decision in an ADR or draft decision note before proceeding.

Dependencies:

- Item 2 depends on item 1.
- Items 3–4 depend on item 2.
- Items 5–7 depend on items 2–4.
- Items 8–10 depend on items 2–7.
- Items 11–12 depend on items 2–4 and 8–10.
- Items 13–15 depend on items 5–12.
- Item 16 depends on items 13–15.
- Item 17 can be done in parallel with items 13–16.
- Items 18–19 depend on items 13–17.

## Behavior Slices

### Slice A — Synthetic fixture and suitability gate

- Goal: Establish a deterministic nested+sibling reference fixture and prove it is structurally suitable.
- Items: 1, 2, 3, 4
- Type: mechanical

### Slice B — Current behavior lock (pre-change characterization)

- Goal: Freeze current basin-fill behavior across the wetness sweep before algorithm changes.
- Items: 5, 6, 7, 8, 9, 10
- Type: behavior

### Slice C — Desired invariant contract tests

- Goal: Express child-first expected behavior independently from implementation details.
- Items: 11, 12
- Type: behavior

### Slice D — Accounting implementation

- Goal: Implement child-complete gating in lake accounting while preserving determinism and explicit field semantics.
- Items: 13, 14, 15
- Type: behavior

### Slice E — Verification artifacts and mismatch protocol

- Goal: Preserve phase separation and ensure failures lead to diagnosis rather than expectation drift.
- Items: 16, 17, 18, 19
- Type: mechanical
