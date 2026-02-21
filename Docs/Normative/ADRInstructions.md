# ADR Instructions

This document defines how to add a new entry to `/docs/ADR.md`.

## Ordering

* New entries MUST be added at the top of `ADR.md`, directly below the main `# Architecture Decision Record` header and explanatory paragraph.
* Entries are ordered newest first.
* Do not reorder or edit historical entries except to correct factual errors.

## When to Create an Entry

Create an ADR entry when a decision:

* Changes architecture, structure, or core conventions
* Introduces or removes major dependencies
* Establishes new patterns, constraints, or policies
* Has long-term impact on maintainability or behavior

Do not create ADRs for trivial refactors, cosmetic changes, or obvious fixes.

## Entry Template

Each entry MUST follow this structure exactly:

```md
## <Short Decision Title>

**Timestamp:** YYYY-MM-DD HH:MM (UTC)

### Decision
A concise description of the decision that was taken.

### Rationale
Why this decision was made. Include constraints, tradeoffs, and context.

### Alternatives Considered
- Option A – why it was rejected
- Option B – why it was rejected
- If none, explicitly state: None.

### References
- PR: #123
- Commit: abcdef1
- File(s): path/to/file.ts
- Related ADRs: link or title
```

## Title Guidelines

* The title must be brief and declarative.
* It should describe what was decided, not what was discussed.
* Example: `Adopt Deterministic Forest Generation v1`
* Avoid vague titles such as “Update” or “Refactor”.

## Style Rules

* Be factual and precise.
* Avoid narrative storytelling.
* Do not justify emotionally.
* Capture reasoning clearly enough that someone new to the project can understand the constraints.

## Immutability

ADR entries are historical records.

If a decision is later reversed:

* Do not delete the original entry.
* Add a new entry describing the superseding decision.
* Reference the prior ADR in the new entry.
