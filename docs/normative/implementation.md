# Implementation Conventions

Use this as a practical execution guide when implementing an approved checklist.

## Start State

- Run relevant tests to understand baseline behavior.
- Check `git status`.
- If unrelated files are dirty and scope is unclear, pause and confirm before proceeding.

## Working Loop

1. Take the first incomplete checklist item (or its required prerequisite).
2. Group dependent items into one behavior slice when they form one coherent change.
3. Implement the slice.
4. Run targeted tests for touched scope.
5. Run broader/full tests at natural checkpoints.
6. Mark completed checklist items.
7. Commit with a short, imperative message.

## Commit Hygiene

- Keep commits scoped to the current slice.
- Avoid bundling unrelated file changes.
- Keep message lines concise and descriptive.

## Hydrology Reset Track Note

For work explicitly scoped to hydrology reset:

- Legacy hydrology parity is not required.
- Legacy hydrology golden failures can be expected during transition.
- Do not add compatibility patches only to satisfy legacy baselines.
- Treat non-hydrology regressions as blockers unless explicitly accepted.

## Stop Conditions

Pause and confirm direction when:

- Proposed changes exceed checklist scope.
- Governance or contract references conflict.
- You find unexpected repo state that could risk unrelated work.
