# Architecture Decision Record

This document is a living ledger of significant technical decisions made within this project. Each entry captures the context in which a decision was made, the options considered, the decision itself, and its consequences. The purpose is not to justify past choices defensively, but to preserve intent and reasoning so future contributors can understand why the system is shaped the way it is. Over time, this file forms a chronological record of trade-offs, constraints, and design direction, providing continuity as the codebase and team evolve.

## Adopt v2 Lake-Coherence Decision Slate (L-01..L-11)

**Timestamp:** 2026-02-27 00:00 (UTC)

### Decision

Adopt the full lake-coherence slate recorded in `docs/drafts/V2-Lake-Coherence-ImplementationPlan.md` Section 14 without modification.

Adopted lake contract direction:

- Lake coherence runs as a deterministic post-pass over seeded/grown lake mask.
- Micro-lake policy is parameterized with `microLakeMode=merge|remove|leave` and `microLakeMaxSize`.
- Component bridging is enabled by default and bounded by explicit distance controls.
- Legacy `lakeGrowSteps`/`lakeGrowHeightDelta` remain available and run upstream of lake-coherence post-pass.
- Boundary realism is a hard invariant in v2 defaults.
- `lakeCoherence.enabled=false` is a global kill switch for lake-coherence post-pass behavior (including boundary repair/validation).
- First-wave boundary repair mode is `trim_first`; `fill_first` is deferred.
- `boundaryEps=0.0005` is the default normalized-height tolerance.
- Total lake-share handling is metric-only in first wave (no hard blocking guardrail).
- Emit `hydrology.lakeSurfaceH` as per-component water-surface elevation on lake tiles.
- Do not emit stored `lakeDepthH`; depth is derived as `lakeSurfaceH - topography.h`.

### Rationale

Observed lake behavior was fragmented and often violated intuitive boundary expectations. The adopted slate establishes deterministic component-level coherence and explicit local boundary realism while preserving conservative defaults and tunable controls.

### Alternatives Considered

- Keep `lakeGrowSteps` tuning as primary mechanism - rejected because it repeatedly traded under-coherence against overgrowth.
- Enforce only soft boundary guidance - rejected because expectation mismatch remained high for perched lake edges.
- Add full time-step flood simulation in this track - rejected as out of scope for first-wave repair.

### References

- PR: None
- Commit: Pending
- File(s): docs/drafts/V2-Lake-Coherence-ImplementationPlan.md, docs/drafts/V2-Simulation-Repair-ProposedSolutions.md, docs/normative/ForestTerrainGeneration.md, docs/drafts/ImplementationPlan.md
- Related ADRs: Add Optional Component-Based Lake Growth (v1)

## Adopt v2 Stream-Coherence Decision Slate (D-01..D-12)

**Timestamp:** 2026-02-27 00:00 (UTC)

### Decision

Adopt the full stream-coherence slate recorded in `docs/drafts/V2-Stream-Coherence-ImplementationPlan.md` Section 14 without modification.

Adopted stream contract direction:

- Stream topology baseline is path-aware tracing from deterministic source candidates (not threshold-only local marking).
- Optional headwater enrichment is supported via parameterized boost, default off.
- Terminal stream sinks may be classified as `waterClass: "pool"` under valid sink gates.
- Pool semantics are non-blocking for movement/passability by default.
- Stream direction uses existing outputs (`fd`, `isStream`, `waterClass`) with no duplicate stream-direction field.
- Stream continuity is a hard invariant for stream tiles (`stream -> stream|lake|pool`).
- `fd==NONE` remains a valid non-stream terrain state.
- Deterministic cleanup remains optional and default off.
- First-wave default policy is non-adaptive across map sizes (single baseline), with adaptive scaling deferred.
- Stream params surface expands to explicit threshold and optional headwater-boost controls with strict validation.
- Stream coherence metrics are mandatory for baseline and regression comparison.
- ADR/spec synchronization is required before implementation completion.

### Rationale

Observed stream behavior in current outputs is fragmented and difficult to trace end-to-end. The adopted slate establishes a deterministic, explainable topology contract while preserving controlled tuning surfaces and avoiding duplicate direction schema. The pool sink rule balances strict continuity with practical handling of local depressions in small/noisy maps.

### Alternatives Considered

- Keep threshold-only stream marking and rely on retuning/cleanup only - rejected because it does not reliably enforce continuity.
- Add a duplicate stream-direction field - rejected because `fd` already provides directional truth and duplication creates drift risk.
- Force all sinks to drain through carve/breach rerouting - rejected for first wave due to complexity and large topology side effects.

### References

- PR: None
- Commit: Pending
- File(s): docs/drafts/V2-Stream-Coherence-ImplementationPlan.md, docs/drafts/V2-Simulation-Repair-ProposedSolutions.md, docs/normative/ForestTerrainGeneration.md, docs/drafts/ImplementationPlan.md
- Related ADRs: None

## Add Deterministic `parentRegionId` for Enclosed Regions (v1)

**Timestamp:** 2026-02-26 00:00 (UTC)

### Decision

Extend region summaries with optional parent linkage metadata:

- Add optional `regions[].parentRegionId` to enriched output.
- Parent linkage is metadata only; `biomeRegionId` and tile region assignment remain unchanged.
- Parent linkage is assigned deterministically per region using 8-way perimeter neighbors:
  - if a region touches map boundary, omit parent
  - collect distinct external neighboring region IDs around the full region perimeter
  - assign parent only when the distinct external set size is exactly `1`.
- If external set size is `0` or `>1`, omit parent.

### Rationale

Small enclosed regions (for example, 1-2 tile islands) are valid raw components but can be noisy for downstream grouping and prose. Optional parent linkage lets consumers collapse or contextualize such regions without mutating canonical component IDs.

### Alternatives Considered

- Collapse enclosed child tiles into parent region IDs during assignment — rejected because it loses raw component information and couples policy to a single consumer behavior.
- Allow parent assignment when multiple external region IDs are present via tie-break — rejected because enclosure is ambiguous and this introduces arbitrary hierarchy.
- Use 4-way perimeter instead of 8-way — rejected for v1 to align with existing 8-way component connectivity model.

### References

- PR: None
- Commit: Pending
- File(s): docs/drafts/RegionEnrichment-Proposal.md, docs/drafts/RegionEnrichment-ImplementationChecklist.md, docs/drafts/ImplementationPlan.md
- Related ADRs: Add Separate Region-Enrichment Executable and Envelope Region Index (v1)

## Add Separate Region-Enrichment Executable and Envelope Region Index (v1)

**Timestamp:** 2026-02-26 00:00 (UTC)

### Decision

Add deterministic region assignment as a companion post-process executable:

- Add `forest-terrain-assign-regions` as a separate executable entrypoint (not a `src/cli/main.ts` subcommand).
- Input/output contract: read terrain envelope via `--input-file`, write enriched terrain envelope via `--output-file`.
- Enriched output always includes top-level `regions` array (empty array allowed).
- Enriched output also includes per-tile `region.biomeRegionId`.
- Region derivation uses deterministic 8-way connected components over `ecology.biome` with:
  - row-major seed scan
  - canonical Dir8 neighbor expansion order (`E, SE, S, SW, W, NW, N, NE`)
  - first-seen component ID assignment.
- Reader behavior remains backward-compatible with pre-enrichment envelopes that omit `regions`.

### Rationale

Region assignment is useful metadata for downstream prose/tooling but should not alter core terrain generation or the `generate|derive|debug` command surface. A separate executable keeps simulator behavior stable while enabling additive enrichment workflows.

### Alternatives Considered

- Add `regions` as a new subcommand in `src/cli/main.ts` — rejected to avoid expanding/changing core simulator command behavior.
- Compute regions inside core generation pipeline — rejected because it mixes post-process metadata concerns into terrain derivation flow.
- Keep top-level `regions` optional in enriched output — rejected; a required index creates a stable downstream contract.

### References

- PR: None
- Commit: Pending
- File(s): docs/drafts/RegionEnrichment-Proposal.md, docs/drafts/RegionEnrichment-ImplementationChecklist.md, docs/drafts/ImplementationPlan.md
- Related ADRs: None

## Adopt Asymmetric Lake Passability for Recovery Safety (v1)

**Timestamp:** 2026-02-23 00:00 (UTC)

### Decision

Adjust directional passability lake handling to be asymmetric in v1:

- `non-lake -> lake` is `blocked`.
- `lake -> non-lake` is `passable`.
- `lake -> lake` is `passable` only when the origin lake tile is fully lake-enclosed (all 8 Dir8 neighbors are in-bounds lake tiles); otherwise `blocked`.
- Out-of-bounds and destination `NonPlayable` remain `blocked`.

### Rationale

Symmetric lake blocking can trap players if they are placed on a lake tile due to an upstream bug or content error. The asymmetric rule preserves normal "no entry into lake" behavior while providing deterministic recovery paths off lake tiles. The constrained `lake -> lake` exception supports fully water-enclosed interiors without opening general lake traversal.

### Alternatives Considered

- Keep symmetric lake blocking (`origin==lake OR destination==lake`) - rejected because it can hard-lock mistaken placements on lake tiles.
- Allow all `lake -> lake` movement - rejected because it broadens unintended water traversal beyond the recovery-focused scope.

### References

- PR: None
- Commit: Pending
- File(s): docs/normative/ForestTerrainGeneration.md, docs/drafts/ImplementationPlan.md
- Related ADRs: None

## Add Optional Component-Based Lake Growth (v1)

**Timestamp:** 2026-02-22 00:00 (UTC)

### Decision

Add an optional lake-growth pass inside hydrology that expands `LakeMask` before stream/moisture derivation.

- Growth is controlled by:
  - `hydrology.lakeGrowSteps` (`0` disables growth)
  - `hydrology.lakeGrowHeightDelta`
- Growth runs per connected lake component (not per seed tile).
- Component reference height is conservative: `min(H)` of the component.
- Expansion uses deterministic 4-way neighbors (`E,S,W,N`) and keeps existing slope/height eligibility constraints:
  - `SlopeMag <= lakeFlatSlopeThreshold`
  - `H <= componentRefHeight + lakeGrowHeightDelta`
- Stream/moisture/water-class are derived from the grown `LakeMask`.

### Rationale

Observed lake fragmentation produced many isolated single-tile lakes. Component-based growth provides more coherent lake bodies while preserving deterministic behavior and avoiding per-seed order bias.

### Alternatives Considered

- Per-seed growth BFS — rejected due to stronger order sensitivity and shape bias.
- 8-way growth expansion — rejected as default behavior because it is materially more aggressive and can over-merge lakes in typical parameter ranges.

### References

- PR: None
- Commit: Pending
- File(s): src/pipeline/hydrology.ts, src/lib/default-params.ts, docs/normative/ForestTerrainGeneration.md, docs/drafts/ImplementationPlan.md
- Related ADRs: Define v1 Debug Artifact Output Contract

## Allow Debug Artifact Replay from Existing Envelope Input (`--input-file`) (v1)

**Timestamp:** 2026-02-22 00:00 (UTC)

### Decision

For v1 `debug` mode, support a second input path that consumes an existing terrain envelope JSON.

- Add `--input-file <path>` to `debug`.
- In this path, `debug` reads the envelope and emits the standard debug artifact set to `--output-dir`.
- Keep existing `debug` generation/derivation behavior unchanged.
- Treat `--input-file` as mutually exclusive with generation/derivation inputs in `debug`: `--seed`, `--width`, `--height`, `--params`, `--map-h`, `--map-r`, `--map-v`.
- Keep `--input-file` invalid in `generate` and `derive`.

### Rationale

This supports post-hoc debugging and visualization of already generated terrain outputs without requiring regeneration inputs. It improves workflow efficiency while preserving existing mode semantics.

### Alternatives Considered

- Require regeneration-only debug path (no input replay) – rejected because users cannot debug historical outputs directly.
- Add a new command (`debug-from-file`) – rejected for v1 to avoid unnecessary command-surface expansion.

### References

- PR: None
- Commit: Pending
- File(s): src/cli/main.ts, src/app/run-generator.ts, src/app/validate-input.ts, src/io/read-envelope.ts, docs/drafts/ImplementationPlan.md
- Related ADRs: Define v1 Debug Artifact Output Contract

## Define Final CLI Error-Diagnostics Quality Bar (v1)

**Timestamp:** 2026-02-21 20:43 (UTC)

### Decision

For v1, non-zero CLI exits must meet a minimum diagnostics contract.

- Include error category, mode/stage context, and primary failing subject.
- Exit `2` diagnostics include offending flag/key and expected form.
- Exit `3` diagnostics include expected vs actual dimensions/shapes.
- Exit `4` diagnostics include failed operation and path.
- Exit `5` diagnostics include failing invariant/stage and relevant values.
- Include corrective hints when available and suppress raw stack traces in normal CLI output.

### Rationale

Consistent, context-rich diagnostics reduce troubleshooting time and keep CLI behavior predictable for both users and automated tests.

### Alternatives Considered

- Minimal free-form error text – rejected because it leads to inconsistent, low-actionability diagnostics.
- Structured machine-readable diagnostics only – rejected for v1 because primary CLI UX remains human-oriented.

### References

- PR: None
- Commit: Pending
- File(s): docs/drafts/ImplementationPlan.md
- Related ADRs: Lock Phase 6 CLI Integration Test Matrix

## Lock Phase 6 CLI Integration Test Matrix

**Timestamp:** 2026-02-21 20:43 (UTC)

### Decision

Lock a Phase 6 CLI integration-test matrix spanning `generate`, `derive`, and `debug`.

- `generate`: success path, invalid output-argument combinations, overwrite behavior, and unknown-input handling.
- `derive`: success path, missing required authored input failures, shape mismatch failures, and unknown-input handling.
- `debug`: success path with/without `--debug-output-file`, invalid `--output-file` rejection with corrective hint, atomic output-write behavior, and unknown-input handling.
- Matrix assertions include expected exit codes and key diagnostics for each scenario.

### Rationale

A locked matrix prevents coverage drift and ensures CLI contract behaviors stay stable as implementation hardening proceeds.

### Alternatives Considered

- Lightweight ad hoc integration tests – rejected because it can miss mode-specific regressions.
- Exhaustive combinatorial matrix – rejected for v1 due to maintenance/runtime overhead.

### References

- PR: None
- Commit: Pending
- File(s): docs/drafts/ImplementationPlan.md
- Related ADRs: Adopt Balanced End-to-End Golden Scope for Phase 6

## Adopt Balanced End-to-End Golden Scope for Phase 6

**Timestamp:** 2026-02-21 20:42 (UTC)

### Decision

For Phase 6, adopt a balanced end-to-end golden regression scope.

- Modes: `generate`, `derive`, and `debug`.
- Seeds: `1`, `42`, `123456789`, and `18446744073709551615`.
- Grid sizes: `16x16` and `64x64`.
- Assertions cover full envelope output and debug artifact presence/invariants.
- Golden updates are opt-in only via an explicit update workflow flag.

### Rationale

This scope provides high confidence in deterministic behavior across commands while keeping runtime and maintenance cost reasonable for v1.

### Alternatives Considered

- Minimal scope (single seed/size per mode) – rejected because it risks missing regressions.
- Heavy exhaustive scope (many seeds/sizes/artifacts) – rejected for v1 due to runtime/maintenance overhead.

### References

- PR: None
- Commit: Pending
- File(s): docs/drafts/ImplementationPlan.md
- Related ADRs: Use Atomic Debug Output Publication (v1)

## Use Atomic Debug Output Publication (v1)

**Timestamp:** 2026-02-21 20:38 (UTC)

### Decision

For v1 `debug` mode, adopt atomic all-or-nothing publication for `--output-dir`.

- Stage all debug artifacts in a temporary directory.
- Publish to the final output directory only after all artifact writes succeed.
- On write/publish failure, do not leave partially published debug outputs.
- Surface failures as file I/O errors (exit `4`) with actionable path/context details.

### Rationale

Atomic publication gives deterministic and trustworthy debug outputs for both users and tests. Downstream tooling can assume either a complete debug artifact set or a failed run, never a partial ambiguous state.

### Alternatives Considered

- Best-effort partial writes – rejected because partial output states are harder to reason about and increase troubleshooting ambiguity.
- Hybrid atomic/partial behavior – rejected for v1 to keep failure semantics simple and predictable.

### References

- PR: None
- Commit: Pending
- File(s): docs/drafts/ImplementationPlan.md
- Related ADRs: Define v1 Debug Artifact Output Contract

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
- File(s): docs/drafts/ImplementationPlan.md
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
