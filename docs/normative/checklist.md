# Checklist Conventions

Use this guide when writing implementation checklists.

Goal: make checklists clear enough that another engineer can execute them without hidden assumptions.

## Plan Prerequisite

Checklist authoring starts only after plan refinement is complete under `docs/normative/plan.md`.

Before drafting checklist items, extract and lock from the approved plan:

- in-scope statements
- out-of-scope statements
- acceptance criteria
- binding invariants, if present
- validation strategy and required evidence expectations, if present

If the plan changes behavior, contracts, determinism guarantees, architecture, or build/debug outputs and does not include the required guardrails from `docs/normative/plan.md`, stop and fail conformance QC before checklist drafting.

## Traceability

Every checklist must include a `Source plan:` reference near the top.

Traceability should live on the checklist item itself.

The purpose of `Trace` is to make scope drift visible at the exact point where work is being proposed, reviewed, and executed.

`Trace` is required for:

- behavior-changing items
- contract-changing items
- determinism-sensitive items
- items whose scope would be unclear without plan text

`Trace` is optional for clearly mechanical items when the intent is obvious from the item text and approved scope.

Minimum `Trace` contents:

- one or more short direct quotes from the approved plan
- the source section heading for each quote

Recommended item shape:

```md
Source plan: `docs/drafts/example-plan.md`

- [ ] `C01` [tag] Imperative implementation statement.
  - Depends on: `C00`.
  - Trace:
    - "plan quote 1" (`Acceptance Criteria`)
    - "plan quote 2" (`Binding Invariants`)
  - Validation: `test/path.test.mjs`
```

Keep `Trace` minimal. Quote only the plan text needed to justify why the item exists.

Scope-control rules:

- do not silently add scope not present in the approved plan
- treat an item as out of plan if it is not supported by approved `In Scope`, `Acceptance Criteria`, `Binding Invariants`, `Validation Strategy`, or explicit deferment text
- if additional work is proposed, place it in a separate `Advisory Add-ons` section with a short rationale
- do not move advisory add-ons into the executable checklist until explicit approval exists

## Validation Mapping

When the source plan includes `Binding Invariants`, `Validation Strategy`, or acceptance criteria that require explicit proof, the checklist must show how that proof will be produced.

Ways to satisfy this:

- include dedicated validation items
- name existing tests, commands, or fixtures that satisfy the evidence requirement
- make an implementation item explicitly depend on a validation item when separate proof is required

Rules:

- each behavior-changing item must have an explicit validation path
- keep validation work tied to approved plan intent
- do not add unrelated or speculative validation work
- if the plan requires determinism evidence, name the determinism check explicitly

## Item Quality

Each checklist item should be:

- Atomic (one behavior change per item).
- Imperative (clear action verb).
- Checkable (easy to tell when done).
- Scoped (prefix with a tag like `[hydrology]`, `[docs]`, `[cli]`).
- Traceable (clearly tied to approved plan text when required).

If code changes are involved, name exact files/functions.

If an item depends on another, state that dependency explicitly.

If an item contains multiple independent actions, split it unless those actions are inseparable in the same surface.

Recommended item shape:

```md
- [ ] `ID` [tag] Imperative implementation statement naming exact file(s) or function(s) when code is involved.
  - Depends on: `ID`, if needed.
  - Trace:
    - "plan quote" (`Section`)
  - Validation: test file, command, fixture, or existing proof path when required.
```

## Atomicity Gate

An item is ready only if:

- it can be marked complete without also completing another checklist item
- it can be implemented without hiding unrelated work
- it can be committed as one coherent unit of work

If an item fails this gate, split it before implementation.

## Checklist QC Modes

Two QC modes are supported:

- `Conformance QC`: required; verify fidelity to plan and checklist norms only
- `Advisory QC`: optional; propose improvements beyond the approved plan

Conformance QC must not silently rewrite scope. It reports deviations.

QC output format:

- `Missing from plan`
- `Extra beyond plan`
- `Atomicity fixes needed`
- `Validation mapping gaps`
- `Traceability readiness`
- `Pass/Fail: ready for implementation`

Keep advisory suggestions in a separate `Advisory` section.

## Exclusions

Do not add speculative implementation or validation work.

Include validation work only when:

- the approved plan requires evidence
- a binding invariant needs proof
- the acceptance criteria are not otherwise checkable
- the user explicitly asks for it

## Behavior Slices

After atomic items, add a `## Behavior Slices` section to group execution bundles.

For each slice include:

- `Goal`: one coherent behavior outcome.
- `Items`: exact checklist items covered by that slice.
- `Type`: `behavior` or `mechanical`.

Rules:

- Every checklist item belongs to exactly one slice.
- Slices must remain within approved scope.
- Slices do not replace atomic items; they organize them.
- Slices may be used for execution grouping only.
