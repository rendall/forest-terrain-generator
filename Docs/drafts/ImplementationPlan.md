# Implementation Plan

Status: draft
Scope: implementation of the Forest Terrain Generator CLI in this repository
Last updated: 2026-02-21

## 1. Authority and Precedence

Implementation decisions follow this order:

1. `AGENTS.md` for collaboration process, approval gates, and decision behavior.
2. `docs/normative/ForestTerrainGeneration.md` for required generator behavior and data contracts.
3. `docs/normative/ADRInstructions.md` for ADR entry process.
4. This implementation plan for project-specific execution strategy.
5. `docs/ImplementationPlanChecklist.md` for execution tracking and review stops.

If any conflict is found, stop and request direction before proceeding.

## 2. Project Deliverable

The deliverable is a CLI that implements the normative forest terrain generation specification.

The CLI produces runtime artifacts:

1. A single output file for standard generation/derivation output.
2. An output directory for multi-artifact modes (for example, debug outputs).

Generated artifacts are products of the CLI; the CLI itself is the project deliverable.

## 3. CLI Contract (v1)

### 3.1 Commands

The CLI exposes three commands aligned with normative Section 2.1:

1. `generate` - generate base maps from seed/params and run full derivation.
2. `derive` - consume authored maps (and required inputs) and run derivation.
3. `debug` - run generation/derivation and emit debug artifacts.

### 3.2 Input Contract

Required conformance inputs align with normative Sections 2.1 and 2.2:

1. `seed`
2. `width`
3. `height`
4. `params`
5. Optional authored base maps (`H`, `R`, `V`) where allowed by mode.

Configuration precedence follows normative Section 2.1:

1. Explicit CLI arguments.
2. Parameter file values.
3. Built-in defaults.

Seed parsing/storage/validation decision (Phase 1):

1. Treat `seed` as a strict base-10 unsigned integer token representing normative `uint64`.
2. Accept range `0` to `18446744073709551615` only.
3. Parse and store `seed` internally as `bigint`.
4. Reject non-decimal or non-integer forms (for example signs, floats, scientific notation, hex).

Configuration merge semantics decision (Phase 1):

1. Apply precedence in this order: CLI arguments override params file values, which override built-in defaults.
2. Merge plain objects recursively (deep merge).
3. Arrays are replaced as whole values by the higher-precedence source (no concatenation/union behavior).
4. Scalar values are replaced by the higher-precedence source.
5. Explicit falsy values (`0`, `false`, and empty string) are treated as provided overrides.
6. `undefined` is treated as not provided.

Unknown-input policy decision (Phase 1):

1. Unknown CLI flags are hard validation errors (exit `2`).
2. Unknown params-file keys are hard validation errors (exit `2`).
3. Error messages MUST be precise and actionable, explicitly identifying the unknown key/flag and where it was found.
4. Error messages SHOULD include close valid alternatives when available (for example nearest valid key/flag names).

Params-file format decision (Phase 1):

1. v1 supports JSON params files only.
2. YAML (`.yml`/`.yaml`) is not supported in v1.
3. If a non-JSON params format is provided, fail with validation error (exit `2`) and a precise message indicating supported format.
4. Error messaging SHOULD explicitly recommend converting the file to JSON.

### 3.3 Output Contract

1. `generate` and `derive` write the terrain envelope JSON to `--output-file`.
2. `debug` writes debug artifacts to `--output-dir`.
3. `debug` may additionally emit the envelope JSON when configured, but debug artifacts always target `--output-dir`.
4. Output envelope structure conforms to normative Section 14.
5. Existing output targets fail by default; `--force` is required to overwrite an existing file target or replace an existing directory target.

### 3.4 Exit Codes

Adopt normative Section 2.1 recommended exit codes:

1. `0` success
2. `2` invalid input
3. `3` dimension mismatch/incompatible map shapes
4. `4` file I/O error
5. `5` internal generation/derivation failure

### 3.5 Help and Empty-Command Behavior

The following invocations are equivalent:

1. `help`
2. `--help`
3. `-h`
4. No command

Behavior requirements:

1. Print the same top-level help/usage output.
2. Perform no generation or derivation work.
3. Exit with code `0`.

Error behavior remains separate:

1. Unknown command prints an error and top-level help, then exits `2`.
2. Known command with invalid/missing required arguments prints command-specific help/error and exits `2`.

### 3.6 CLI Stream Behavior

1. Help and version output are written to `stdout` and exit `0`.
2. Errors are written to `stderr` and exit non-zero.
3. Human-readable status/progress messages are written to `stderr`.
4. Terrain payload output is file-based via `--output-file`; it is not emitted to `stdout` by default.

### 3.7 Package Metadata Baseline

Phase 0 package metadata baseline for `package.json`:

1. `name`
2. `version`
3. `private` (true unless intentionally publishing)
4. `type` set to `module`
5. `engines.node` set to `>=22 <23`
6. `bin` entry for the CLI command
7. scripts: `build`, `typecheck`, `lint`, `test`, `check`

### 3.8 Initial Dependency Set and Versioning Policy

Phase 0 dependency decisions:

1. Runtime dependency: `commander`.
2. Core dev dependencies: `typescript`, `@types/node`, `vitest`, `tsx`.
3. Additional dependencies are added only when implementation needs are concrete.

Versioning policy:

1. Initialize from latest stable versions at adoption time.
2. Pin exact dependency versions in `package.json` (`x.y.z`, no floating ranges).
3. Commit lockfile and use `npm ci` in CI for reproducible installs.
4. Update dependencies intentionally (not continuously), with focus on stability and deterministic behavior.

TypeScript toolchain policy:

1. The project requires local `typescript` via `devDependencies`.
2. Global TypeScript installations are optional personal convenience and are not part of project requirements.
3. Project scripts and CI must run against the local dependency version.

### 3.9 Tooling Baseline (Lean)

Adopt the lean tooling baseline:

1. TypeScript as the typecheck/compiler tool with strict mode enabled.
2. `@biomejs/biome` as the lint/format tool.
3. `vitest` as the test runner.

TypeScript baseline:

1. `strict: true`
2. `module: "NodeNext"`
3. `moduleResolution: "NodeNext"`
4. `target: "ES2022"`
5. `noEmit: true` for typecheck runs

Workflow baseline:

1. Prefer project-local scripts and `npm run` over global tooling.
2. Keep lint/test/typecheck runnable via standard scripts (`lint`, `test`, `typecheck`, `check`).

## 4. Architecture Contract

The implementation uses TypeScript, ESM, and functional-first design.

Target module boundaries:

1. `src/domain` for core types and invariants.
2. `src/pipeline` for pure derivation phases.
3. `src/lib` for deterministic math/grid/common helpers.
4. `src/io` for filesystem and serialization boundaries.
5. `src/cli` for command parsing and command execution wiring.
6. `test/unit`, `test/integration`, `test/golden` for verification layers.

Design rules:

1. Pipeline code is pure and deterministic.
2. Side effects occur only at IO and CLI boundaries.
3. Global mutable state is not allowed.

## 5. Determinism and Numeric Rules

The implementation enforces deterministic behavior from the normative spec.

Key requirements:

1. Deterministic neighbor and traversal ordering (normative Section 1.7).
2. Deterministic tie-break behavior using defined epsilon/tie rules.
3. No runtime randomness outside seed-derived deterministic functions.
4. Stable fixed-seed behavior within this implementation profile.

## 6. Data Contracts and Validation

1. Validate CLI inputs before pipeline execution.
2. Validate authored base-map dimensions before derivation (normative Section 1.1).
3. Fail fast on invalid schema/type/range conditions.
4. Always emit a versioned envelope with `meta.specVersion` for standard output.
5. Debug outputs are supplementary and do not replace envelope contract compliance.

## 7. Execution Phases

### Phase 0 - Alignment and Scaffold

Goals:

1. Lock command surface and output path semantics.
2. Set repository scaffold, tsconfig, lint/test baseline.
3. Establish deterministic helper primitives and shared types.
4. Decide initial dependencies and define dependency policy (selection criteria, pinning/update approach, and license/security expectations).
5. Confirm AGENTS alignment for approval gates and change process.
6. Define data-contract baseline (input schema, output envelope versioning, and error code contract) before feature implementation begins.
7. Define CLI stream behavior policy (`stdout`/`stderr`) for help, errors, and status output.
8. Confirm reproducibility minimums (Node version and lockfile policy).
9. Confirm minimal `package.json` metadata baseline for scaffolding.
10. Run `npm init` using the approved `package.json` baseline.
11. Set lightweight phase definition of done (tests pass plus review gate approval).
12. Confirm documentation baseline paths for implementation artifacts.

Done criteria:

1. CLI skeleton commands compile and run.
2. Validation stubs and error taxonomy exist.
3. Major dependency choices and dependency policy are documented in `docs/ADR.md`.
4. Data-contract baseline and CLI stream behavior policy are documented.
5. Reproducibility minimums and minimal `package.json` baseline are documented.
6. `npm init` has been run and `package.json` reflects the approved baseline.
7. Lightweight phase definition of done and documentation baseline are recorded.
8. Review gate approval recorded.

### Phase 1 - Foundations and Contracts

Goals:

1. Implement input parsing, parameter merge precedence, and contract validation.
2. Implement output envelope builder skeleton and serialization boundary.

Done criteria:

1. Contract tests for precedence and required fields pass.
2. Exit code behavior is covered by integration tests.
3. Review gate approval recorded.

### Phase 2 - Topography

Goals:

1. Implement base map generation/authored override flow.
2. Implement slope/aspect/landform derivations.

Done criteria:

1. Fixed-seed regression tests for topography pass.
2. Determinism ordering and tie-break tests pass.
3. Review gate approval recorded.

### Phase 3 - Hydrology

Goals:

1. Implement flow direction, accumulation, normalization.
2. Implement lakes, streams, moisture, and water class.

Done criteria:

1. Hydrology fixed-seed regressions pass.
2. Section 1.7 traversal-order requirements are verified in tests.
3. Review gate approval recorded.

### Phase 4 - Ecology and Grounding

Goals:

1. Implement biome classification and vegetation attributes/species.
2. Implement ground and roughness outputs.

Done criteria:

1. Categorical output regressions pass.
2. Float-output epsilon-based checks pass.
3. Review gate approval recorded.

### Phase 5 - Navigation and Trails

Goals:

1. Implement movement cost, passability, followable flags.
2. Implement deterministic trail seed selection and routing.

Done criteria:

1. Deterministic route-order and tie-break tests pass.
2. Navigation payload validation passes.
3. Review gate approval recorded.

### Phase 6 - Output, Debug, Hardening

Goals:

1. Finalize envelope writer and file output behavior.
2. Implement debug artifact emission layout.
3. Harden CLI UX, diagnostics, and test coverage.

Done criteria:

1. CLI integration tests cover `generate`, `derive`, `debug`.
2. Output path behavior is validated for file vs directory modes.
3. Fixed-seed end-to-end golden tests pass.
4. Final review approval recorded.

## 8. Testing and Quality Gates

Minimum required test classes:

1. Unit tests for deterministic primitives and helpers.
2. Integration tests for CLI command behavior, exit codes, and IO contracts.
3. Golden/fixed-seed regressions aligned with normative Section 16.

Each phase closes only when tests for that phase are passing and reviewed.

## 9. ADR Trigger Policy

Create or update ADR entries when decisions materially affect:

1. Architecture boundaries.
2. Determinism guarantees.
3. CLI contract surface.
4. Long-term constraints or non-goals.
5. Dependency policy or major dependency choices.

Follow `docs/normative/ADRInstructions.md` for entry format and ordering.

## 10. Policy Decision Completion (Aligned to AGENTS)

A policy decision checkbox is complete only when:

1. At least one applicable artifact is updated.
2. Every applicable artifact is updated.
3. If applicability is unclear, stop and ask for instruction before marking complete.

Applicability predicates:

1. Update this file when execution strategy or implementation policy changes.
2. Update `AGENTS.md` when contributor/agent operating policy changes.
3. Update `docs/ADR.md` when architecture or long-term constraints change.
4. Update specs under `docs/drafts/` or `docs/normative/` when behavior requirements change.
