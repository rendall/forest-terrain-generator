# Implementation Policy (Normative)

Status: active
Scope: implementation work in this repository

This document defines implementation rules and decision-closure criteria for this project.
All implementation work MUST follow these policies unless explicitly superseded by higher-priority instructions.

## 1. Policy Decision Closure Rule

A policy decision checkbox in planning documents is considered complete only when all three are true:

1. **Documented**: the decision is recorded in this normative policy document.
2. **Discoverable**: the decision is reflected in `AGENTS.md` guidance for contributors/agents.
3. **Enforceable**: where feasible, the decision is backed by tooling/configuration or a verification step.

## 2. Implementation Style and Runtime Policy

The implementation MUST follow:

- Language: TypeScript-first
- Module style: modern ESM `import`/`export`
- Design style: functional-first (pure functions + explicit data flow), avoid class-heavy OOP

## 3. Repository Scaffolding Policy

Target layout (subject to iterative refinement):

- `src/domain`: core data types and invariants
- `src/pipeline`: pure derivation transforms organized by generation phase
- `src/lib`: shared deterministic/math/grid utilities
- `src/io`: external I/O boundaries (files, serialization)
- `src/cli`: command parsing and execution entrypoints
- `test/{unit,integration,golden}`: verification layers

## 4. Naming and Strictness Policy

- Files SHOULD use `kebab-case.ts`.
- TypeScript strict mode MUST be enabled when scaffolding is created.
- Runtime SHOULD use Node ESM (`"type": "module"`) with TypeScript `NodeNext` module resolution.

## 5. Normative vs Informative Source Policy

- Normative algorithmic and data-contract behavior is defined by the specification in `docs/ForestTerrainGeneration.md` (core sections).
- Informative implementation guidance (e.g., Appendix material) may be adopted selectively.
- Project implementation decisions become binding only when recorded in this normative policy and mirrored in `AGENTS.md`.

## 6. Change Control

Policy changes MUST be reviewed collaboratively and committed with a clear rationale in the commit/PR message.
