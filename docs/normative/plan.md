# Plan Conventions

Use this guide to turn a plain-language request or brainstorm into a formal plan that is ready for checklist authoring.

Goal: keep plans readable by humans first, while still making the path from intent to tests and implementation explicit.

## Source of Truth

Merged code and tests on `main` remain the repository source of truth.

An approved plan is the source of truth for:

- scoped implementation intent
- checklist authoring
- review of whether the delivered change matches the approved outcome

If implementation diverges from approved plan intent, implementation has failed even if code compiles and tests pass.

## Collaboration Requirement

Plan refinement is collaborative by default.

Do not treat a brainstorm draft or request note as final scope without explicit review of:

- intended outcomes
- scope boundaries
- acceptance criteria
- open questions or deferments

Checklist authoring begins only after collaborators explicitly approve the plan text.

## Plain-Language Accountability

The plan must be understandable to a contributor who did not write it.

Use everyday language wherever possible.

Rules:

- prefer plain words over shorthand or internal jargon
- define unavoidable technical terms in place
- do not hide multiple decisions inside one sentence
- do not use process language to avoid saying what the system should do

The test for readiness is simple:

- a contributor should be able to read `Plain-Language Intent` and `Acceptance Criteria` and explain what success looks like without translating the document into different words first

If a required section cannot be written clearly in plain language, the plan is not ready.

## Required Sections

A formal plan must include these sections under stable headings:

- `Goal`
- `Plain-Language Intent`
- `In Scope`
- `Out of Scope`
- `Acceptance Criteria`
- `Open Questions / Deferments`

These sections are the human-readable center of the plan. They should describe what is changing, what is not changing, and what result counts as success.

## Implementation Guardrails

When the plan changes observable behavior, contracts, architecture, dependencies, build outputs, or determinism guarantees, add a short `Implementation Guardrails` section.

This section exists to translate human intent into verifiable engineering terms. It must stay short and must remain readable in plain language.

Include:

- `Binding Invariants`
- `Validation Strategy`
- `Hardest Missing Step`

### Binding Invariants

Binding invariants describe observable properties that must remain true after the change.

Rules:

- describe behavior, not implementation structure
- make each statement binary verifiable
- phrase invariants in plain language

Bad:

- "Refactor renderer to use overlay composition pipeline"

Good:

- "When no overlay flag is provided, `see` produces the same image bytes as before."

### Validation Strategy

State the evidence required to prove the plan was implemented correctly.

Use plain language. Prefer evidence statements such as:

- a unit test proves a specific rule
- an integration or smoke test proves CLI behavior
- a determinism check proves repeated runs produce identical output

For significant behavioral changes, maintain traceability in this form:

`Invariant -> Test -> Implementation Site -> Observable Output`

### Hardest Missing Step

Identify the most difficult unresolved mechanism before checklist authoring.

State:

- what is hardest
- why it is hard
- what evidence will prove it is solved

Do not present peripheral work as completion while this step remains unresolved.

## Ambiguity, Conflict, and Risk Surfacing

During plan refinement, explicitly surface:

- ambiguous wording
- hidden assumptions
- cross-surface coupling risks
- behavior or contract conflicts
- determinism risks
- ADR or prior-invariant conflicts

Any unresolved issue must be either:

- resolved in the plan text, or
- recorded as an explicit deferment

If a proposal conflicts with an existing ADR, declared invariant, or determinism guarantee, do not move to checklist authoring until the conflict is addressed.

## Validation Strategy Requirement

`Validation Strategy` is required when the plan changes:

- observable behavior
- public or cross-module contracts
- build or debug outputs
- determinism guarantees
- architecture in a way that affects external behavior

It is optional for purely mechanical work.

## Plan QC Modes

Two QC modes are supported:

- `Conformance QC`: required; checks fidelity to approved intent, scope, clarity, and readiness for checklist authoring
- `Advisory QC`: optional; suggests improvements beyond current requirements

Conformance QC output format:

- `Intent clarity issues`
- `Missing required sections`
- `Ambiguities/assumptions to resolve`
- `Guardrail gaps`
- `Traceability readiness`
- `Pass/Fail: ready for checklist authoring`

Keep advisory suggestions in a separate `Advisory` section.

## Exit Criteria for Checklist Authoring

Checklist authoring under `docs/normative/checklist.md` may begin only when:

- required plan sections are present
- `Plain-Language Intent` is approved by collaborators
- scope boundaries are explicit
- acceptance criteria are explicit and checkable
- if required, `Implementation Guardrails` are present and readable in plain language
- if required, `Validation Strategy` defines checkable evidence expectations
- unresolved ambiguity is either resolved or explicitly deferred
- conformance QC result is `Pass`

## Relationship to Request Docs

A request note may stay shorter and less formal than a plan.

Typical flow:

1. Request note captures the problem in plain language.
2. Plan turns that request into approved scope and acceptance criteria.
3. Checklist turns the approved plan into atomic execution items.

Do not skip the plan step when behavior, contracts, determinism, or architecture are changing.
