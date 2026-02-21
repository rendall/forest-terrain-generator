# AGENTS.md

Scope: entire repository

This file defines collaboration and implementation expectations for contributors and agents.

## Collaboration policy

- Work collaboratively: propose options before large structural changes.
- Keep changes incremental and easy to review.
- Record implementation-policy decisions in `Docs/Normative/ImplementationPolicy.md`.

## Policy decision completion

A planning checkbox for a policy decision is complete only when the decision is:

1. Documented in `Docs/Normative/ImplementationPolicy.md`
2. Reflected here in `AGENTS.md`
3. Enforced by tooling/config or an explicit verification command where feasible

## Implementation style

- TypeScript-first
- Modern ESM imports/exports
- Functional-first design over class-heavy OOP

## Repository structure guidance

Follow the scaffold policy in `Docs/Normative/ImplementationPolicy.md` for module boundaries and naming.

## Normative source of truth

- Use `docs/ForestTerrainGeneration.md` for terrain-generation behavior requirements.
- Treat informative appendix guidance as optional unless explicitly adopted in normative policy.
