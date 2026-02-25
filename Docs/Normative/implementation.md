# Checklist implementation

You have a checklist and have been tasked with following it. These are those instructions:

## Setup

Run `npm test` and ensure that everything runs green. If tests fail, stop and ask for instructions, unless those failures are already known and explicitly accepted for this implementation.

Check git status. If the git working tree is dirty, stop and ask what to do. The instruction very well may be to continue with the dirty tree.

If the working tree is dirty and you are instructed to continue, do not stage or commit unrelated changes. Only stage files required for the checklist item being implemented.

Check out a new git branch with a name that reflects the goal of the implementation, in the form `<verb>-<noun>` or possibly `<verb>-<adjective>-<noun>`.

## Loop

Stop with any questions, or if implementing the task requires expanding beyond the scope of what was agreed in the checklist.

- Choose the first unchecked item of the checklist.
- If the first unchecked item depends on another unchecked item, complete the prerequisite item first.
- If the item involves a behavioral or code change, then:
  - Write a unit test that assumes the code has been changed. This test is expected to fail.
  - Commit that change with the message `Test <item copy>`, but edit for clarity and length. The message must be no more than 50 characters. If longer explanation is needed, you may add a git body.
- If the item is a pure refactor with no behavior change, you may skip the failing-test step for that item.
- If the item is docs-only or non-code, skip the failing-test step for that item.
- Implement the checklist item as written.
- Run tests after implementation.
  - You may run a targeted test command for the touched scope first.
  - Run full `npm test` at the end of the loop iteration or at the next natural checkpoint.
- If a test does not pass, avoid changing the test, particularly if it is a regression elsewhere.
  - Continue implementing the checklist item until tests run green.
  - If it is necessary to change the test, print an acknowledgement and continue.
- Check off the item with `[x]`.
- Commit all changes with an imperative message `<item copy>` edited for clarity and length less than 50 characters. You may add a git body.
- Continue with the loop until all items are completed.
