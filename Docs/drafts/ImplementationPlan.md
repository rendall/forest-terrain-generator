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
7. `null` is treated as an explicitly provided value and is validated against schema/type rules (invalid `null` values fail with validation error `2`).

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

Path-resolution decision (Phase 1):

1. Relative paths provided via explicit CLI arguments are resolved relative to the current working directory (CWD).
2. Relative paths found inside a params file are resolved relative to that params file's directory.
3. Absolute paths are used as-is.
4. CLI help and project docs MUST explicitly state these path-resolution rules.

CLI flag-name decision (Phase 1):

1. Params-file flag: `--params <path>`.
2. Authored-map flags: `--map-h <path>`, `--map-r <path>`, `--map-v <path>`.
3. Output flags: `--output-file <path>`, `--output-dir <path>`, `--debug-output-file <path>`.
4. Overwrite flag: `--force`.
5. CLI help/docs MUST use these canonical names consistently.

Mode-specific input/output decision (Phase 1):

1. `generate` requires `seed`, `width`, `height`, and `params`.
2. `generate` allows authored maps `H`, `R`, and `V` as optional overrides.
3. `generate` requires `--output-file`.
4. `derive` requires `seed`, `width`, `height`, `params`, and authored `H`.
5. `derive` allows authored `R` and `V` as optional inputs.
6. `derive` requires `--output-file` and fails fast if required authored inputs are missing.
7. `debug` requires `seed`, `width`, `height`, and `params`.
8. `debug` allows authored maps consistent with the selected generation/derivation path.
9. `debug` requires `--output-dir`.
10. `debug` optionally accepts `--debug-output-file` to also emit terrain JSON output during debug runs.
11. `generate`, `derive`, and `debug` use one shared internal derivation pipeline with command-level validation/wiring differences only.

Output-argument validation decision (Phase 1):

1. `generate` and `derive` require `--output-file` and reject `--output-dir` and `--debug-output-file`.
2. `debug` requires `--output-dir` and rejects `--output-file`.
3. `debug` accepts optional `--debug-output-file`.
4. Missing required mode-specific output arguments are validation errors (exit `2`).
5. Existing output targets fail by default.
6. `--force` overrides existing-target checks and allows overwrite/replace behavior.
7. If `--output-file` is used with `debug`, the error message MUST include a corrective hint: `You might mean --debug-output-file.`

Defaults-source and Appendix A alignment decision (Phase 1):

1. The CLI includes built-in default params in code.
2. Built-in defaults align to Appendix A recommended defaults for v1.
3. A flagged params file is optional and overrides built-in defaults using the configured merge semantics.
4. Explicit CLI arguments override params file values.
5. Effective precedence remains: `CLI > file > built-in defaults`.
6. Any future divergence from Appendix A defaults MUST be explicitly documented.

Validation/error taxonomy decision (Phase 1):

1. `0`: success.
2. `2`: invalid input/usage/validation errors.
3. `3`: dimension/shape compatibility errors for authored maps and grid sizing.
4. `4`: file I/O errors.
5. `5`: internal generation/derivation failures.
6. Malformed JSON params are classified as invalid input (`2`), not file I/O (`4`).
7. Exit-code mapping is performed by normalized error category at the CLI boundary, not by raw thrown exception type.

Duplicate-flag behavior decision (Phase 1):

1. Duplicate CLI flags are validation errors (exit `2`).
2. The CLI does not apply last-value-wins behavior for duplicate flags.
3. Error messages MUST identify the duplicated flag and advise providing it only once.

### 3.3 Output Contract

1. `generate` and `derive` write the terrain envelope JSON to `--output-file`.
2. `debug` writes debug artifacts to `--output-dir`.
3. `debug` may additionally write terrain envelope JSON to `--debug-output-file`.
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
4. Terrain payload output is file-based via `--output-file` (`generate`/`derive`) or `--debug-output-file` (`debug`); it is not emitted to `stdout` by default.

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

Locked decisions:

1. v1 base-map generation uses an in-repo deterministic 2D Perlin implementation.
2. v1 does not depend on an external noise-generation library for base-map generation.
3. Perlin behavior is fixed in code for v1 (gradient/permutation strategy, fade/interpolation function, and output normalization/clamp behavior are implementation-defined and tested, not user-selectable).
4. v1 noise tuning defaults come from Appendix A, and tuning overrides are provided through `--params` (`CLI > file > defaults`).
5. Topography uses row-major struct-of-arrays in memory with index contract `i = y * width + x`.
6. `H`, `R`, `V`, `SlopeMag`, and `AspectDeg` are stored as `Float32Array`; `Landform` is stored as `Uint8Array` with fixed enum-code mapping.
7. All phase-2 maps share one `GridShape` (`width`, `height`) contract and must have equal linear length `width * height`.
8. Authored base maps (`--map-h`, `--map-r`, `--map-v`) use JSON-only v1 format: `{ "width": number, "height": number, "data": number[] }` with row-major data ordering.
9. Generated base-map values are clamped to `[0,1]` after normalization; v1 does not emit warnings for clamp events.
10. Authored map `data` length must equal `width * height`, all values must be finite and within `[0,1]`, and implementations must not resample/interpolate authored maps.
11. Authored map schema/type/range errors map to exit `2`; authored map shape/dimension mismatches map to exit `3`; errors must identify map input and failing key/index.
12. Slope/aspect boundary handling follows clamped-coordinate sampling from normative Section 5.1 with no separate edge/corner algorithm branches.
13. Landform threshold comparisons follow strict operators to avoid boundary drift: `SlopeMag < flatSlopeThreshold`; neighbor-high when `H[n] > center + eps`; neighbor-low when `H[n] < center - eps`; otherwise neutral.
14. Phase-2 regression testing uses a balanced hybrid strategy: committed/versioned golden snapshots for seeds `1`, `42`, `123456789`, and `18446744073709551615` at dimensions `16x16` and `64x64`, plus targeted fixtures for boundary and threshold behavior (`1xN`, `Nx1`, and threshold-near cases).
15. Float assertions in topography regressions use epsilon-based comparisons (default `1e-6`) for derived float maps.
16. v1 Perlin uses the Improved Perlin (2002) variant with fixed fade function `6t^5 - 15t^4 + 10t^3`, fixed linear interpolation, and fixed 2D gradient/dot-product behavior.
17. v1 Perlin uses a deterministic 256-entry permutation table expanded to 512 entries; seed mapping into permutation initialization is fixed by a separate Phase-2 decision.
18. Per-octave Perlin noise outputs are treated as `[-1,1]` inputs to the normative multi-octave composition step.
19. Per-octave permutation initialization is canonical: `seed_octave = subSeed(seed,mapId,octaveIndex)`; SplitMix64 state starts at `seed_octave`; `perm[0..255]` is produced by Fisher-Yates with `j = rand % (i+1)`; table is expanded to 512 by repetition.
20. `Landform` enum-code mapping for `Uint8Array` storage is fixed as: `0=flat`, `1=slope`, `2=ridge`, `3=valley`, `4=basin`.
21. `AspectDeg` uses a deterministic flat-tile sentinel: when `Hx == 0` and `Hy == 0`, set `AspectDeg = 0`; otherwise compute by formula and normalize to `[0,360)`.
22. v1 keeps the normative tile-resolution model (`1 base-map cell = 1 location`); any future change to this model requires an ADR and normative-spec update before implementation.

Done criteria:

1. Fixed-seed regression tests for topography pass.
2. Determinism ordering and tie-break tests pass.
3. Review gate approval recorded.

### Phase 3 - Hydrology

Goals:

1. Implement flow direction, accumulation, normalization.
2. Implement lakes, streams, moisture, and water class.

Locked decisions:

1. Hydrology map storage uses typed row-major arrays with explicit contracts: `FD` as `Uint8Array`, `FA` as `Uint32Array`, `FA_N` as `Float32Array`, `LakeMask` as `Uint8Array`, `isStream` as `Uint8Array`, `distWater` as `Uint32Array`, `Moisture` as `Float32Array`, and `WaterClass` as `Uint8Array`.
2. Internal flow-accumulation indegree storage uses `Uint8Array` (max 8 upstream contributors in D8).
3. `FD` storage is canonical `Dir8` numeric encoding (`0..7`) with `NONE=255`.
4. Hydrology neighbor traversal and tie-candidate enumeration use one shared canonical `Dir8` order helper: `E,SE,S,SW,W,NW,N,NE`.
5. Section 6.1 tie-break hashing uses exact `uint64` semantics with `BigInt` operations and wraparound, following normative `tieBreakHash64(seed,x,y)` constants/steps verbatim.
6. For tied downhill candidates, list `T` is constructed in canonical `Dir8` order and selection uses `i = tieBreakHash64(seed,x,y) mod |T|`.
7. Flow accumulation uses deterministic Kahn-style indegree reduction with FIFO queue semantics; zero-indegree tiles are enqueued in canonical row-major order and queue mechanics are implemented with array-plus-head-index (no unstable container ordering).
8. `FA` accumulation uses `Uint32Array` with explicit overflow checks on `FA[u] += FA[t]`; overflow is treated as fail-fast error rather than silent wraparound.
9. `FA_N` normalization follows Section 6.3 exactly: if `FAmax == FAmin`, all `FA_N` values are `0`; otherwise apply the normative logarithmic formula and clamp result to `[0,1]`.
10. No extra normalization epsilon/fudge factors are introduced beyond explicit spec thresholds.
11. Hydrology threshold operators are fixed to normative comparisons: lake (`SlopeMag < lakeFlatSlopeThreshold` and `FA_N >= lakeAccumThreshold`), stream (`FA_N >= streamAccumThreshold` and `SlopeMag >= streamMinSlopeThreshold`), marsh (`Moisture >= marshMoistureThreshold` and `SlopeMag < marshSlopeThreshold`).
12. Threshold comparisons use shared helper predicates for consistency, but helpers must preserve exact operator semantics (no hidden epsilon offsets).
13. No-water fallback is explicit: if no water tile exists, set `distWater[x,y] = hydrology.waterProxMaxDist` for all tiles before moisture calculations.
14. No-stream fallback is explicit for downstream proximity consumers: if no stream tile exists, set `distStream[x,y] = gameTrails.streamProxMaxDist` for all tiles.
15. Proximity-derived wetness/score terms consume capped fallback distances directly (no special-case branching after fallback assignment).

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
