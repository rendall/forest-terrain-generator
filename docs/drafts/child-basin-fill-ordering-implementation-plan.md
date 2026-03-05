# Child-Basin Fill Ordering — Implementation Plan

## Purpose

This plan describes a phased path to:

1. Build a deterministic synthetic tile set with nested + sibling basins.
2. Lock in **current behavior** via characterization tests across a wetness-scale sweep.
3. Implement child-first fill ordering.
4. Verify that behavior changed in the intended way.
5. Define what to do if results do not match expectations.

---

## Phase 0 — Scope and guardrails

### Goal

Ensure we are testing one thing at a time:

- Basins and lake accounting behavior
- Not map generation randomness
- Not unrelated hydrology modes

### Guardrails

- Use synthetic, hand-authored fixtures in unit tests.
- Keep topology small enough to reason about manually.
- Keep all tests deterministic (fixed tile layout, fixed basin graph, fixed heights).
- Do not “fix tests to green” if they fail after implementation; investigate model mismatch first.

---

## Phase 1 — Build the synthetic reference tile set

## 1.1 Basin topology requirements

The fixture must include all of these:

- A single root basin with `parentId: null`.
- Multiple hierarchy levels (`depth >= 2`).
- Siblings at at least two levels.
- Explicit child-to-parent spill edges (`childSpillFromTileId` -> `parentContactTileId`).

Recommended hierarchy:

- `b_root`
  - `b_A` (composite)
    - `b_A1` (leaf)
    - `b_A2` (leaf)
  - `b_B` (leaf)

This gives:

- level-1 siblings: `b_A`, `b_B`
- level-2 siblings: `b_A1`, `b_A2`

## 1.2 Tile layout requirements

Use a compact grid (e.g., `5x5` or `6x6`) with:

- Distinct tile subsets for each leaf/composite node.
- Root membership covering the full relevant area (directly and/or by expansion through children).
- Height values chosen so each basin has non-trivial spill capacity.

Practical constraints:

- Capacities should be far enough apart to show transitions across `k` values.
- Avoid razor-thin numeric boundaries that make assertions fragile.

## 1.3 Fixture deliverables

Create reusable fixture builder(s) under unit-test helpers:

- `buildNestedSiblingBasinFixture()` returning:
  - `shape`
  - `h`
  - `basinFeatures`
  - `tileFeatureIds`
- Optional small helper for wetness sweep execution.

---

## Phase 2 — Build current-behavior characterization tests (lock tests)

## 2.1 Why this comes before implementation

We need a test-backed snapshot of current behavior before changing logic.

These tests are **characterization tests**, not “desired final behavior” tests.

## 2.2 Wetness-scale sweep

Run the same fixture for:

- `k = [1, 0.5, 0.1, 0.01, 0.001, 0.0001]`

For each `k`, collect by-basin fields:

- `externalInflow`
- `totalInflow`
- `fillRatio`
- `isFilled`
- `overflowExcess`

## 2.3 Characterization assertions

Add assertions that encode **observed current behavior**. Examples:

- Parent basin can show partial fill while at least one child is not filled.
- `totalInflow(parent) = externalInflow(parent) + sum(child overflowExcess)`.
- No double counting of child->parent internal boundary crossings as external inflow.

Use robust assertions:

- Predicates across values (e.g., existence of `0 < fillRatio < 1`) rather than brittle exact long decimals.
- Exact equality only where structurally guaranteed.

## 2.5 Prove tests execute production code (anti-harness checks)

Add explicit checks so tests validate production behavior, not only fixture plumbing:

- Invoke only production entrypoint `deriveHydrology(...)` in characterization and expected-behavior tests.
- Avoid test-side reimplementation of lake-accounting logic; assert algebraic/contracts from outputs instead.
- Add at least one independent oracle assertion that does not mirror implementation control flow.
- Add a local mutation-sensitivity check during development (temporary flip like `>=`/`>` in accounting) and confirm tests fail, then revert.
- Keep fixture-invariant assertions separate from behavior assertions so topology bugs cannot masquerade as accounting behavior.

---

## Phase 4 — Add expected-behavior tests for child-first ordering

## 4.1 Desired invariant

For any non-leaf basin:

- If **any direct child is not filled**, parent effective fill inflow is blocked.
- Parent begins filling only once all direct children are filled.

## 4.2 New expected-behavior tests

Create tests that assert:

1. `unfilled child => parent not filling` (for same `k`).
2. `all children filled => parent begins filling`.
3. Mixed-child state keeps parent blocked.
4. Overflow propagation still works once gate opens.

These tests should run on the same synthetic fixture to isolate policy differences.

---

## Phase 5 — Implement child-first fill gating

## 5.1 Implementation approach

In lake accounting (postorder loop), compute:

- `allChildrenFilled`
- `rawInflow = externalInflow + childOverflow`
- `effectiveInflow = allChildrenFilled ? rawInflow : 0` (for fill computations)

Use `effectiveInflow` for:

- `fillRatio`
- `isFilled`
- `overflowExcess`

Decide/document whether `totalInflow` field remains raw or becomes effective. If kept raw, document clearly in tests and comments.

## 5.2 Non-goals

- Do not change unrelated flow-direction routing logic.
- Do not add nondeterministic or iterative simulation steps in this patch.

---

## Phase 6 — Verification after implementation

## 6.1 Required checks

1. Characterization tests:
   - Some should now fail if they encoded old behavior (expected).
2. Desired-invariant tests:
   - Must pass.
3. Existing lake accounting + boundary tests:
   - Must pass unless they intentionally encoded superseded behavior.
4. Determinism tests:
   - Must still pass.

## 6.2 Success criteria

Implementation is successful when:

- Parent no longer partially fills while any direct child remains unfilled (under tested `k` cases).
- Parent starts filling immediately after all direct children become filled.
- No double-count regressions are introduced.
- All updated/remaining tests are deterministic and stable.

---

## Phase 7 — If implementation does not succeed

If tests or results disagree with expectations:

1. **Do not rewrite expectations to force green.**
2. Produce a mismatch report with:
   - failing `k`
   - basin ids involved
   - child fill states
   - parent raw/effective inflow
   - expected vs actual result
3. Classify mismatch cause:
   - fixture design issue
   - expectation issue
   - algorithm bug
   - field-semantic ambiguity (`totalInflow` raw vs effective)
4. Fix the root cause, then rerun full suite.
5. If ambiguity remains, document decision in an ADR or draft note before changing assertions.

---

## Deliverables checklist

- [ ] Synthetic nested-sibling fixture helper added.
- [ ] Current-behavior characterization tests added across wetness sweep.
- [ ] Desired child-first invariant tests added.
- [ ] Lake accounting gating implemented.
- [ ] Post-implementation verification complete.
- [ ] Mismatch handling protocol followed for any failures.

