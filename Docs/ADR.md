# Architecture Decision Record

This document is a living ledger of significant technical decisions made within this project. Each entry captures the context in which a decision was made, the options considered, the decision itself, and its consequences. The purpose is not to justify past choices defensively, but to preserve intent and reasoning so future contributors can understand why the system is shaped the way it is. Over time, this file forms a chronological record of trade-offs, constraints, and design direction, providing continuity as the codebase and team evolve.

## Adopt Initial CLI Dependency and Versioning Policy

**Timestamp:** 2026-02-21 09:05 (UTC)

### Decision
Adopt the initial dependency set and versioning policy for the CLI:

- Runtime dependency: `commander`.
- Dev dependencies: `typescript`, `@types/node`, `vitest`, `tsx`.
- Initialize from latest stable versions at adoption time, then pin exact versions in `package.json`.
- Commit lockfile and use `npm ci` in CI.
- Require local project TypeScript; global TypeScript is optional convenience only and not part of project requirements.

### Rationale
This keeps the dependency footprint minimal while preserving deterministic and reproducible development/CI behavior. Exact version pinning and lockfile usage reduce drift and avoid accidental changes caused by floating ranges or machine-specific global toolchains.

### Alternatives Considered
- Floating semver ranges (for example `^x.y.z`) – rejected due to update drift and reduced reproducibility.
- Requiring global TypeScript for contributors – rejected because global tooling is not captured by project metadata and can cause version mismatch/confusion.
- Larger initial dependency set – rejected to keep early implementation lean and add libraries only when needed.

### References
- PR: None
- Commit: Pending
- File(s): docs/drafts/ImplementationPlan.md
- Related ADRs: None

Normative instructions for adding entries are defined in /docs/normative/ADRInstructions.md.
