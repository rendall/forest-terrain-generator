# Child-Basin Fill Ordering — Mismatch Report Template

Use this template when characterization/expected-behavior outputs conflict after implementation.

## Metadata

- Date:
- Branch/commit:
- Reporter:
- Test command(s):

## Failing Context

- Wetness scale `k`:
- Fixture/test name:
- Basin ids involved:

## Basin State Snapshot

For each involved basin:

- `id`:
- `parentId`:
- `childIds`:
- Child fill states (`childId -> isFilled`):
- `externalInflow`:
- `totalInflow` (raw):
- `effectiveInflow` (if available):
- `spillCapacity`:
- `fillRatio`:
- `isFilled`:
- `overflowExcess`:

## Expectation vs Actual

- Expected behavior:
- Actual behavior:
- Exact assertion failure text:

## Classification

Choose one (or more):

- [ ] Fixture design issue
- [ ] Expectation issue
- [ ] Algorithm bug
- [ ] Field-semantic ambiguity (`totalInflow` raw vs effective)

## Resolution Plan

- Proposed fix:
- Why this fix addresses root cause:
- Validation commands to rerun:

## Decision Record

- ADR / draft note reference (if needed):
- Follow-up tasks:
