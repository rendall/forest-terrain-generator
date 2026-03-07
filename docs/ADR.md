# Architecture Decision Record

This document is a living ledger of significant technical decisions made within this project. Each entry captures the context in which a decision was made, the options considered, the decision itself, and its consequences. The purpose is not to justify past choices defensively, but to preserve intent and reasoning so future contributors can understand why the system is shaped the way it is. Over time, this file forms a chronological record of trade-offs, constraints, and design direction, providing continuity as the codebase and team evolve.

## Hydrology Public Schema Gate (Phase D)

**Timestamp:** 2026-03-02 08:09 (UTC)

### Decision

Public hydrology schema exposure is approved only behind an explicit Phase D contract step.

Until that step is executed:

* `generate`/`derive` keep the current envelope tile contract unchanged.
* Hydrology internals (`fd`, `fa`, `faN`, `stream-mask`) are emitted through debug artifacts and inspector surfaces only.

When Phase D is executed:

* Public hydrology additions must be additive and versioned.
* Migration policy is forward-safe:
  * older envelopes without new hydrology fields remain valid inputs;
  * inspector/generator must recompute hydrology maps when fields are absent.

### Rationale

Hydrology pipeline behavior is still being tuned. Exposing unstable fields in the public envelope contract would lock implementation details too early and create avoidable migration burden.

### Alternatives Considered

* Expose hydrology fields immediately in all envelope outputs.
* Keep hydrology entirely internal with no debug/inspector visibility.

### References

* Plan: `docs/drafts/Streamflow-Pipeline-Integration-Plan.md`
* Checklist: `docs/drafts/Streamflow-Pipeline-Integration-ImplementationChecklist.md`

## Burn Governance: Hard Reset

**Timestamp:** 2026-03-01 00:00 (UTC)

### Decision

Effective immediately, all prior governance is void.

* All pre-2026-03-01 governance text, process rules, ratification requirements, and decision gates are non-binding.
* All prior ADRs are historical context only.
* Only code in `main` and ADRs merged after this timestamp are authoritative.

### Rationale

Governance accretion has become an obstacle to coherent work. Process now constrains progress more than it protects quality. A clean break is required to restore velocity, clarity, and ownership.

### Operating Rules During Reset

* Decisions are made by new ADRs.
* Merge authority is final.
* Tests and determinism requirements remain binding where promised.
* No compatibility obligation exists unless explicitly stated in a new ADR.

### Consequences

* Some prior guarantees may be dropped.
* Some behavior may change without migration paths.
* Governance will be rebuilt incrementally and only where it demonstrably improves outcomes.

### Supersedes

All governance and decision authority prior to 2026-03-01 00:00 (UTC).
