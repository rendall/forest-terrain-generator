# Checklist implementation

You have a checklist and have been tasked with following it. These are those instructions:

## Setup

Run `npm test` and ensure that everything runs green. If tests fail, stop and ask for instructions, unless those failures are already known and explicitly accepted for this implementation.

Check git status. If the git working tree is dirty *with files that are unrelated to this implementation*, stop and ask what to do. The instruction very well may be to continue with the dirty tree. If the files are related to this implementation, then fold them into the first commit as described below.

If the working tree is dirty and you are instructed to continue, do not stage or commit unrelated changes. Only stage files required for the checklist item being implemented.

Check out a new git branch with a name that reflects the goal of the implementation, in the form `<verb>-<noun>` or possibly `<verb>-<adjective>-<noun>`.

If the working tree is dirty at this stage, `git add . && git commit -m "Init <implementation>"` where implementation is suitably descriptive.

## Loop

Stop with any questions, or if implementing the task requires expanding beyond the scope of what was agreed in the checklist.

- Choose the first unchecked item of the checklist.
- If the first unchecked item depends on another unchecked item, complete the prerequisite item first.
- Group dependent checklist items into a single behavior slice when they implement one coherent behavior change.
  - A behavior slice MUST remain within checklist scope and MUST list which items it satisfies.
- If the behavior slice involves a behavioral or code change, then:
  - Write a unit/integration test that assumes the behavior slice has been changed. This test is expected to fail.
  - One failing test commit MAY cover multiple dependent checklist items in that slice.
  - Commit that failing test change with the message `Test <slice summary>`, edited for clarity and length. The message must be no more than 50 characters. If longer explanation is needed, you may add a git body.
- If an item is mechanical only (for example type plumbing, constant/table wiring, rename-only, or internal refactor with no direct behavior contract), you may implement it within the current behavior slice without adding a dedicated failing test for that single item.
- If the item is docs-only or non-code, skip the failing-test step for that item.
- Implement the selected behavior slice as written in the checklist.
- Run tests after implementation.
  - You may run a targeted test command for the touched scope first.
  - Run full `npm test` at the end of the behavior slice iteration or at the next natural checkpoint.
- If a test does not pass, avoid changing the test, particularly if it is a regression elsewhere.
  - Continue implementing the behavior slice until tests run green.
  - If it is necessary to change the test, print an acknowledgement and continue.
- Check off each completed checklist item with `[x]`.
- Commit all behavior-slice implementation changes with an imperative message `<slice summary>` edited for clarity and length less than 50 characters. You may add a git body.
- Continue with the loop until all items are completed.

Finally, create a new PR targetting the parent branch using `gh pr create --base <target branch>`. Add a descriptive title, and use this template to write the PR body:  "Previously, (bad thing happened). This PR (fixes the bad the by doing what). We expect (describe good thing)."
