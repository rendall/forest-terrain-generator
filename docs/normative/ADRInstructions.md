# ADR Conventions

This file describes lightweight conventions for adding entries to [`docs/ADR.md`](/mnt/c/workspace/projects/forest-terrain-generator/docs/ADR.md).

Use these conventions to keep decisions readable and easy to audit. They are not intended to be heavy process gates.

## When To Add An ADR

Add an entry when a change does one or more of the following:

- Changes architecture or pipeline shape.
- Introduces/removes major constraints.
- Alters long-lived contracts used across multiple modules.
- Replaces prior policy with a new direction.

Do not add ADRs for small refactors, typo fixes, or local implementation details.

## Placement And Ordering

- Add new entries near the top of `ADR.md` (newest first).
- Keep older entries intact as historical context.
- If a decision is superseded, add a new entry that says so instead of deleting history.

## Suggested Entry Shape

Use this template when practical:

```md
## <Decision Title>

**Timestamp:** YYYY-MM-DD HH:MM (UTC)

### Decision
What was decided.

### Rationale
Why this direction was chosen.

### Alternatives Considered
- Option A
- Option B

### References
- PR:
- Commit:
- File(s):
- Related ADRs:
```

## Writing Style

- Prefer short, factual language.
- Capture tradeoffs directly.
- Focus on forward guidance and consequences.
