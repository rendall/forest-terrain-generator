# AGENTS.md

Scope: entire repository

This file defines collaboration and implementation expectations for contributors and agents.

## Project deliverable

This repository's deliverable is a CLI that implements the forest terrain generation spec; the CLI outputs either a single file path or an output directory for multi-artifact modes (for example, debug).

## Work Collaboratively

The agent MUST treat all discussion as exploratory unless explicitly authorized to implement.

### 1. No Implicit Directives

* Do not interpret brainstorming, questions, hypotheticals, or partial thoughts as implementation instructions.
* Do not modify code, files, or structure unless the user explicitly states approval using clear execution language such as:

  * “Implement this.”
  * “Proceed.”
  * “Create the PR.”
  * “Apply the change.”

If explicit approval is absent, remain in analysis mode.

If uncertain whether something is a directive, assume it is not.

### 2. Require Explicit Approval Before Changes

Before making any change that alters behavior, structure, dependencies, or spec interpretation:

* Summarize the proposed change.
* Identify affected files or systems.
* Wait for confirmation.

No changes without approval.

### 3. Push Back on Questionable Decisions

The agent MUST actively evaluate proposals against:

* `docs/normative`
* Existing ADRs
* The declared spec
* Previously established constraints

If a proposal:

* Contradicts normative documentation
* Violates stated invariants
* Introduces architectural drift
* Conflicts with determinism or declared non-goals
* Appears underspecified or incoherent

The agent MUST:

* Explicitly identify the conflict.
* Quote or reference the relevant constraint.
* Explain the consequences.
* Request clarification or confirmation before proceeding.

Silently complying with a flawed or contradictory directive is a failure.

### 4. Separate Discussion from Commitment

Use this mental model:

* Discussion phase: explore, critique, model alternatives.
* Decision phase: explicit approval.
* Implementation phase: execute only after approval.

The agent must not collapse these phases.

### 5. Escalation Rule

If a proposal meaningfully alters architecture, policy, or long-term constraints:

* Recommend creating or updating an ADR before implementation.
* Do not proceed until that record exists or approval is given to proceed without it.

## Policy decision completion

A planning checkbox for a policy decision is complete only when:

1. At least one artifact below is updated.
2. Every artifact whose applicability predicate is true is updated.
3. If applicability is unclear for any artifact, stop and ask for instructions before marking the checkbox complete.

Applicability predicates:

1. Update `docs/drafts/ImplementationPlan.md` if the decision affects execution plan, sequencing, or scope.
2. Update `AGENTS.md` if the decision changes contributor or agent operating policy.
3. Update `docs/ADR.md` if the decision affects architecture, invariants, or long-term constraints.
4. Update a spec in `docs/drafts/` or `docs/normative/` if behavior or requirements are added or changed.

## Implementation style

* TypeScript-first
* Modern ESM imports/exports
* Functional-first design over class-heavy OOP

## Repository structure guidance

Follow the scaffold policy in `docs/drafts/ImplementationPlan.md` for module boundaries and naming.

## Normative source of truth

* Use `docs/normative/ForestTerrainGeneration.md` for terrain-generation behavior requirements.
* Treat informative appendix guidance as optional unless explicitly adopted in normative policy.
* Use `docs/normative/checklist.md` for checklist authoring requirements.
* Use `docs/normative/implementation.md` for checklist execution workflow requirements.
