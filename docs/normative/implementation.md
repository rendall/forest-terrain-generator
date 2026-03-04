# Implementation Conventions

Use this as a practical execution guide when implementing an approved checklist.

## Start State

- Run relevant tests to understand baseline behavior.
- Check `git status`.
- If unrelated files are dirty and scope is unclear, pause and confirm before proceeding.
- Checkout a new branch with a descriptive name `<verb>-<optional adjective>-<noun>`

## Working Loop

1. Take the first incomplete checklist item (or its required prerequisite).
2. Implement that single atomic item.
4. Run targeted tests for touched scope.
5. Run broader/full tests at natural checkpoints.
6. Mark completed checklist items.
7. Commit with a short, imperative message.

## Commit Granularity (Agent-Critical)

- Default rule: **one commit per atomic checklist item**.
- Do not batch multiple checklist items into one commit by default.
- If two or more checklist items must be implemented together due to a hard technical dependency, treat them as one explicit slice and list the item IDs in the commit message body.
- If bundling is based on convenience (not hard dependency), stop and ask for confirmation before proceeding.

Required commit message structure for checklist-driven work:

- Subject: imperative summary.
- Body:
  - `Checklist:` `<ITEM-ID>`
  - or `Checklist:` `<ITEM-ID-1>, <ITEM-ID-2>` (hard-dependency slice only)

## Commit Hygiene

- Keep commits scoped to the current atomic item (or approved hard-dependency slice).
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
