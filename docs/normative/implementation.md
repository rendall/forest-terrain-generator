# Implementation Conventions

Use this as a practical execution guide when implementing an approved checklist.

Implementation is step 3 of the repository workflow:

1. Refine and approve a plan under `docs/normative/plan.md`.
2. Create and approve a checklist under `docs/normative/checklist.md`.
3. Execute that checklist using this document.

For non-trivial checklist-driven work, if there is no approved checklist created under `docs/normative/checklist.md`, stop and confirm direction before implementing.

## Start State

- Run relevant tests to understand baseline behavior.
- Check `git status`.
- If unrelated files are dirty and scope is unclear, pause and confirm before proceeding.
- Checkout a new branch with a descriptive name `<verb>-<optional adjective>-<noun>`

## Validation Selection

Select the primary validation approach for each checklist item from the item's `Validation` entry and the approved plan requirements.

- behavior or contract change: prefer fail-first unit or integration tests
- determinism-sensitive change: include the determinism check named by the checklist or plan
- docs or governance-only change: verify references, commands, and cited evidence consistency
- broader repository validation when required: use repo commands such as `npm run test`, `npm run typecheck`, `npm run lint`, or `npm run check`

Do not rely on tool-internal assertions when behavior-level evidence is available.

## Working Loop

1. Take the first incomplete checklist item (or its required prerequisite).
2. Read the item's `Trace` and `Validation` entries when present before changing code or docs.
3. If the required evidence is not already covered by existing tests or checklist-cited validation, add the smallest valid fail-first proof for the approved behavior.
4. Implement that single atomic item.
5. Run targeted validation for the touched scope and the item's required evidence.
6. Run broader or full validation at natural checkpoints when the scope warrants it.
7. Ensure required evidence runs green. Do not change tests or validation only to force green. If the approved behavior and the current evidence disagree, stop and confirm direction.
8. Mark completed checklist item.
9. You MUST commit this change with a short, imperative message.
10. Return to step 1 until all items are checked.

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

## Hydrology Governance Note

For work that touches hydrology:

- `src/pipeline/derive-hydrology.ts` and `src/pipeline/derive-lake-accounting.ts` are protected hydrology-core files.
- Agent-driven changes to those files require explicit, strictly scoped approval.
- Downstream systems may consume hydrology outputs, but must not reinterpret hydrology semantics without the same approval.

## Stop Conditions

Pause and confirm direction when:

- Proposed changes exceed checklist scope.
- Governance or contract references conflict.
- You find unexpected repo state that could risk unrelated work.
