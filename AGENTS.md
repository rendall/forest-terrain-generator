# AGENTS.md

Scope: entire repository

This file defines how contributors and agents collaborate.

## Project Deliverable

The deliverable is a deterministic CLI that models terrain truth layers and produces coherent wilderness location descriptions, with debug/developer outputs as long-term supporting surfaces.

---

## Collaboration Model

### 1. Discussion ≠ Implementation

All discussion is exploratory unless explicit authorization is given.

Implementation requires clear approval language such as:

* “Implement this.”
* “Proceed.”
* “Apply the change.”
* “Create the PR.”

Absent explicit approval, remain in analysis mode.

---

### 2. No Silent Behavior Changes

Before making any change that alters:

* observable behavior
* architectural structure
* public contracts
* dependencies
* determinism guarantees

The agent must:

* Summarize the proposed change.
* Identify affected areas.
* Wait for confirmation.

No implicit execution.

---

### 3. Call Out Conflicts

If a proposal:

* Contradicts previously stated Binding Invariants,
* Contradicts existing ADRs,
* Violates declared invariants,
* Breaks determinism guarantees,
* Or introduces architectural drift,

The agent must:

* Identify the conflict clearly.
* Explain the consequences.
* Request clarification before proceeding.

Blind compliance is a failure. Agents must also check that new code does not silently contradict previously agreed design decisions or implementation plans.

---

### 4. Keep Phases Separate

There are three phases:

* Exploration
* Decision
* Implementation

Do not collapse them.

---

### 5. Record Major Decisions

Significant architectural or long-term policy changes should be captured in an ADR.

ADRs document intent. They do not require ceremony.

---

### 6. Binding Invariants Required Before Implementation

Non-trivial implementation work must begin by stating the **Binding Invariants** that define success.

A Binding Invariant is a behavioral property that must hold after the change.

Example format:

Binding Invariants

1. [Behavioral property]
2. [Behavioral property]
3. [Behavioral property]

Requirements:

* Invariants must describe **observable system behavior**, not implementation details.
* They must be **binary verifiable** (true or false).
* They must not describe intent, preference, or architecture.

If the invariants cannot be clearly stated, the task should remain in exploration.

### 7. Invariants Must Be Enforced by Tests

For each Binding Invariant:

1. A test must exist that would fail if the invariant were violated.
2. If no such test exists, one must be added.
3. Passing existing tests alone is not sufficient.

A change is not complete if the invariant behavior is not validated by tests. Agents must optimize for satisfying system invariants, not merely keeping tests green.

### 7A. Do Not Patch Tests In The Same Pass By Default

By default, implementation changes and test changes must be kept in separate passes.

Requirements:

* Agents must not modify tests in the same pass as an implementation change unless the user explicitly authorizes combined implementation-and-test work.
* The default implementation pass should change code only, then report which tests fail, which invariants are uncovered, and what test updates are likely needed.
* After the implementation pass, the agent should propose a separate test pass and wait for approval before changing tests.
* Agents must not use same-pass test edits to "prove" a behavior change that has not first been observed against the prior tests.

Rationale:

* Tests must remain an external check on behavior rather than being rewritten during the same pass that changes the behavior.
* This guardrail reduces the risk of accidentally normalizing regressions or masking invariant violations.

### 8. Status Updates Must Include “What Remains False”

Progress reports must include a section titled:

What Remains False

This must list:

* invariants not yet satisfied
* behaviors still incorrect
* missing tests
* incomplete mechanisms

This prevents misleading progress reports where peripheral work is complete but the core behavior is not.

### 9. Implementation Plans Must Identify the Hardest Step

Implementation plans must explicitly identify:

Hardest Missing Step

This section must explain:

* the most difficult unresolved mechanism
* why it is difficult
* what evidence will prove it is solved

Peripheral work must not be presented as completion while the hardest required mechanism remains unimplemented.

### 10. Structural Work Cannot Substitute for Behavioral Work

The following activities do not satisfy behavioral invariants:

* renaming fields
* serialization changes
* output formatting
* refactoring unrelated components
* documentation updates

These may accompany a change but cannot be used to claim completion of a behavioral task.

### 11. Uncertainty Must Be Explicit

If an agent cannot confirm that a Binding Invariant is satisfied, it must say so explicitly.

Acceptable statements include:

* “The invariant is not yet satisfied because mechanism X is missing.”
* “The current implementation only supports a subset of the intended behavior.”

Agents must not imply correctness when uncertainty exists.

### 12. Requirement Traceability

For significant behavioral changes, agents should maintain traceability:

Invariant → Test → Implementation Site → Observable Output

This helps ensure that requirements remain connected to tests and code.



## Source of Truth

* Code and tests in `main` are authoritative.
* ADRs document architectural intent.
* Specs describe intended behavior but do not override merged code.

---

## Hydrology Protected Subsystem

The hydrology core is a protected subsystem:

* `src/pipeline/derive-hydrology.ts`
* `src/pipeline/derive-lake-accounting.ts`

Requirements:

* Agent-driven changes to these files require explicit, strictly scoped approval.
* “cleanup”, “refactor”, “simplify”, “normalize”, or “optimize” do not count as approval for hydrology changes.
* Changes outside these files must not reinterpret, remap, suppress, or redefine hydrology semantics without the same explicit approval.
* Downstream systems such as biome logic, passage blocking, and maze/location generation may consume hydrology outputs, but they must not silently change the meaning of those outputs.

---

## Implementation Style

* TypeScript-first
* Modern ESM
* Arrow notation
* array methods over loops
* Prefer functional design over heavy OOP
