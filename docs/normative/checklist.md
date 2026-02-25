# Checklist writing instructions

You have been tasked with creating a checklist for a task. These are the instructions for doing that properly.

There have been discussions about how to implement the task. This exercise is to write a step-by-step implementation checklist according to those instructions such that an engineer could implement your vision of the plan simply by following the checklist. The intent is to review and discuss specifics so there is no drift between understanding.

Each checklist item MUST be a minimal, imperative, and checkable implementation step.
Use one behavior change per item.
If code is modified, name the exact function/file and the concrete change.
If an item depends on another, state that dependency explicitly.
Prefix each item with a short scope tag (e.g. `[description]`, `[cli]`, `[docs]`).
You MAY add one brief sub-bullet for context.
You MUST NOT include tests or testing in this exercise, as that topic is addressed in a later step.

e.g.

```md
- [ ] [description] Add optional field `basicText?: string` to interface `DescriptionSentence` in `src/pipeline/description.ts`
- [ ] [description] Set `basicText` on the `movement_structure` sentence object in `generateRawDescription` in `src/pipeline/description.ts` (depends on previous item)
- [ ] [cli] Map `sentence.basicText` to `basicText` in structured sentence output inside `attachTileDescriptions` in `src/app/run-describe.ts` (depends on first item)
  - Keeps baseline text available for later transformed rendering.
```
