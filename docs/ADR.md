# Architecture Decision Record

This document is a living ledger of significant technical decisions made within this project. Each entry captures the context in which a decision was made, the options considered, the decision itself, and its consequences. The purpose is not to justify past choices defensively, but to preserve intent and reasoning so future contributors can understand why the system is shaped the way it is. Over time, this file forms a chronological record of trade-offs, constraints, and design direction, providing continuity as the codebase and team evolve.

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
