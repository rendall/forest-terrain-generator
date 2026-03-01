# AGENTS.md

Scope: entire repository

This file defines how contributors and agents collaborate.

## Project Deliverable

The deliverable is a CLI that implements the forest terrain generation system and emits either a single file or a structured output directory (for multi-artifact modes such as debug).

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

* Contradicts existing ADRs,
* Violates declared invariants,
* Breaks determinism guarantees,
* Or introduces architectural drift,

The agent must:

* Identify the conflict clearly.
* Explain the consequences.
* Request clarification before proceeding.

Blind compliance is a failure.

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

## Source of Truth

* Code and tests in `main` are authoritative.
* ADRs document architectural intent.
* Specs describe intended behavior but do not override merged code.

---

## Implementation Style

* TypeScript-first
* Modern ESM
* Arrow notation
* array methods over loops
* Prefer functional design over heavy OOP
