# Child-Basin Fill Ordering — Implementation Checklist

Scope: execute the approved child-first basin fill rollout while preserving phase order and deliverables.

## Atomic Checklist Items

- [ ] [process] Capture implementation start state: run relevant baseline lake/hydrology tests and record current outcomes in the implementation notes.
- [ ] [process] Confirm clean working scope (`git status`), and isolate work on a dedicated branch before editing checklist-target files.
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
- [ ] [process] Run targeted tests for touched scope after each behavior slice and run a broader hydrology/lake checkpoint before finalizing.
- [ ] [process] Mark completed checklist items and commit each completed slice with a scoped, imperative commit message.

Dependencies:

- Item 2 depends on item 1.
- Item 4 depends on items 1–3.
- Items 5–6 depend on item 4.
- Items 7–11 depend on items 4–6.
- Item 12 depends on items 7–11.
- Items 13–14 depend on items 4–6 and 7–12.
- Items 15–17 depend on items 7–14.
- Item 18 depends on items 15–17.
- Item 19 can be done in parallel with items 15–18.
- Items 20–21 depend on items 15–19.
- Item 22 depends on items 7–21.
- Item 23 depends on items 1–22.

## Behavior Slices

### Slice A — Start-state and fixture suitability gate

- Goal: Establish implementation baseline and create a deterministic nested+sibling reference fixture proven structurally suitable.
- Items: 1, 2, 3, 4, 5, 6
- Type: mechanical

### Slice B — Current behavior lock (pre-change characterization)

- Goal: Freeze current basin-fill behavior across the wetness sweep before algorithm changes and prove tests hit production code.
- Items: 7, 8, 9, 10, 11, 12
- Type: behavior

### Slice C — Desired invariant contract tests

- Goal: Express child-first expected behavior independently from implementation details.
- Items: 13, 14
- Type: behavior

### Slice D — Accounting implementation

- Goal: Implement child-complete gating in lake accounting while preserving determinism and explicit field semantics.
- Items: 15, 16, 17
- Type: behavior

### Slice E — Verification artifacts and implementation hygiene

- Goal: Preserve phase separation and ensure failures lead to diagnosis rather than expectation drift while following execution hygiene.
- Items: 18, 19, 20, 21, 22, 23
- Type: mechanical
