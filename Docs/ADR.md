# Architecture Decision Record

This document is a living ledger of significant technical decisions made within this project. Each entry captures the context in which a decision was made, the options considered, the decision itself, and its consequences. The purpose is not to justify past choices defensively, but to preserve intent and reasoning so future contributors can understand why the system is shaped the way it is. Over time, this file forms a chronological record of trade-offs, constraints, and design direction, providing continuity as the codebase and team evolve.

## Define v1 Debug Artifact Output Contract

**Timestamp:** 2026-02-21 20:36 (UTC)

### Decision
For v1 `debug` mode, adopt a minimal stable output-directory contract.

- Emit `debug-manifest.json` at the output-directory root.
- Emit fixed required debug artifacts at the output-directory root: `topography.json`, `hydrology.json`, `ecology.json`, and `navigation.json`.
- `debug-manifest.json` includes deterministic metadata fields: `mode`, `specVersion`, `width`, `height`, `tileCount`, and `artifacts`.

### Rationale
A fixed, minimal artifact set provides predictable downstream tooling integration and straightforward regression testing without introducing optional/variable debug schemas in v1.

### Alternatives Considered
- Rich debug contract with timings/counters/optional artifact variants – rejected for v1 to keep scope and schema surface small.
- Raw internal-array dump contract – rejected because it is harder for downstream consumers to treat as stable and increases churn risk.

### References
- PR: None
- Commit: Pending
- File(s): Docs/drafts/ImplementationPlan.md
- Related ADRs: Emit `navigation.gameTrailId` in Standard Tile Payload (v1)

## Emit `navigation.gameTrailId` in Standard Tile Payload (v1)

**Timestamp:** 2026-02-21 19:15 (UTC)

### Decision
For v1, the standard tile payload includes `navigation.gameTrailId` as an optional integer field.

- Emit `navigation.gameTrailId` when a tile has a generated trail id.
- Omit `navigation.gameTrailId` when no trail id exists.
- Assign IDs incrementally in route-generation order.
- On overlapping routes, keep existing tile id assignment (first-writer-wins).

### Rationale
Including `navigation.gameTrailId` in the standard envelope gives downstream gameplay and tooling immediate trail attribution without requiring debug-mode artifacts. This keeps v1 payloads useful in-game while staying compact and deterministic.

### Alternatives Considered
- Debug-only `GameTrailId` – rejected because in-game consumers would lose direct trail-id access in standard output.
- Standard `trailManifest` (`routeId -> ordered tile list`) – rejected for v1 due to higher payload/schema complexity; deferred until route-level fidelity is required.

### References
- PR: None
- Commit: Pending
- File(s): docs/normative/ForestTerrainGeneration.md
- Related ADRs: None

## Adopt JSON-Only Params File Format for v1

**Timestamp:** 2026-02-21 09:35 (UTC)

### Decision
For v1, params files are JSON-only.

- Supported params file format: JSON.
- Unsupported in v1: YAML (`.yml` / `.yaml`) and other non-JSON formats.
- Non-JSON params inputs are validation errors (exit `2`) with explicit guidance to provide/convert JSON.

### Rationale
JSON-only keeps the input contract strict and predictable, reduces parser/dependency surface area, and simplifies validation/error handling for a lean v1 CLI. This aligns with deterministic behavior goals and avoids YAML-specific parsing/coercion ambiguities.

### Alternatives Considered
- YAML-only params files – rejected due to parser complexity and higher ambiguity risk in type coercion/interpretation.
- Supporting both JSON and YAML – rejected for v1 because it increases implementation and testing overhead without clear functional benefit at this stage.

### References
- PR: None
- Commit: Pending
- File(s): docs/drafts/ImplementationPlan.md
- Related ADRs: Adopt Initial CLI Dependency and Versioning Policy

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
