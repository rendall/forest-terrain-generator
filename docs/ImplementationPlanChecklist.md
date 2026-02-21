# Forest Terrain Generator - Implementation Checklist

This checklist is the execution companion to `docs/drafts/ImplementationPlan.md`.

Rules:

1. Follow precedence in `AGENTS.md` and the normative specification.
2. Treat each phase as closed only when its done criteria are satisfied.
3. Stop at each review gate and request explicit approval before continuing.

## Phase 0 - Alignment and Scaffold

- [x] Confirm project deliverable statement is present and consistent in `README.md` and `AGENTS.md`.
- [x] Confirm `AGENTS.md` alignment for approval gates and change process.
- [x] Confirm CLI command surface (`generate`, `derive`, `debug`) and output semantics (`--output-file` vs `--output-dir`).
- [x] Confirm overwrite policy: existing outputs fail by default; `--force` allows overwrite/replace.
- [x] Confirm help/empty-command equivalence: `help`, `--help`, `-h`, and no command all print top-level help and exit `0`.
- [x] Confirm CLI stream behavior policy (`stdout` for help/version, `stderr` for errors/status).
- [x] Decide initial dependency set and versioning approach for runtime and test tooling.
- [x] Define dependency policy (selection criteria, update cadence, pinning strategy, and license/security expectations).
- [x] Document major dependency choices and dependency policy in `docs/ADR.md`.
- [x] Approve repository scaffold and module boundaries (`domain`, `pipeline`, `lib`, `io`, `cli`).
- [x] Establish tooling baseline (TypeScript strict + NodeNext, Biome lint/format, Vitest test runner).
- [x] Define determinism policy baseline (seed handling, tie-break conventions, float/epsilon rules) and matching utility/test coverage expectations.
- [x] Define data-contract baseline (input schema, output envelope versioning, and error code contract) before Phase 1 implementation.
- [x] Confirm reproducibility minimums (Node version and lockfile policy).
- [x] Confirm minimal `package.json` baseline (`name`, `version`, `private`, `type`, `engines.node`, `bin`, scripts).
- [x] Run `npm init` using the approved `package.json` baseline.
- [x] Set lightweight phase definition of done (tests pass plus review gate approval).
- [x] Confirm documentation baseline paths (normative spec, ADR log, implementation plan/checklist).
- [ ] Review gate: explicit approval to proceed to Phase 1.

## Phase 1 - Foundations and Contracts

### Phase 1 Decisions

- [x] Decide `seed` parsing/storage/validation for normative `uint64` input.
- [x] Decide config merge semantics for `CLI > file > defaults` (deep merge rules, array behavior, and scalar override behavior).
- [x] Decide unknown-input policy (unknown CLI flags and unknown params-file keys).
- [x] Decide params-file format support (for example JSON-only vs additional formats).
- [x] Decide path-resolution rules for file inputs (CWD-relative vs params-file-relative).
- [x] Decide mode-specific required/allowed inputs for `generate`, `derive`, and `debug`.
- [x] Decide output-argument validation by mode (`--output-file` vs `--output-dir` requirements).
- [x] Decide defaults-source policy and Appendix A alignment.
- [x] Decide validation/error taxonomy mapping to exit codes (`2`, `3`, `4`, `5`).
- [x] Decide duplicate-flag behavior (last value wins vs hard error).
- [ ] Review the Phase 1 implementation checklist for further or unresolved ambiguity and confirm none remains before starting Phase 1 implementation.

### Phase 1 Implementation

- [ ] Implement CLI input parsing and config precedence (CLI > file > defaults).
- [ ] Implement input schema and validation errors.
- [ ] Implement envelope skeleton builder and serializer boundary.
- [ ] Implement exit code mapping for validation/shape/IO/internal failures.
- [ ] Add integration tests for help behavior (`help`, `--help`, `-h`, no command) and command-error behavior (unknown/invalid -> exit `2`).
- [ ] Add integration tests for stream behavior (`stdout` for help/version, `stderr` for errors/status).
- [ ] Add integration tests for overwrite policy (existing outputs fail without `--force`, succeed with `--force`).
- [ ] Add integration tests for command wiring and contract failures.
- [ ] Review gate: explicit approval to proceed to Phase 2.

## Phase 2 - Topography

- [ ] Implement base map generation and authored-map override flow.
- [ ] Implement slope magnitude, aspect, and landform classification.
- [ ] Add deterministic tests for ordering and tie-break behavior used by this phase.
- [ ] Add fixed-seed regression tests for topography outputs.
- [ ] Review gate: explicit approval to proceed to Phase 3.

## Phase 3 - Hydrology

- [ ] Implement flow direction with deterministic tie-break logic.
- [ ] Implement flow accumulation and normalization.
- [ ] Implement lakes, streams, moisture, and water class derivations.
- [ ] Add fixed-seed regression tests for hydrology outputs.
- [ ] Verify traversal-order conformance to normative Section 1.7.
- [ ] Review gate: explicit approval to proceed to Phase 4.

## Phase 4 - Ecology and Grounding

- [ ] Implement biome assignment and vegetation attributes.
- [ ] Implement dominant species derivation.
- [ ] Implement ground and roughness feature derivations.
- [ ] Add regression tests for categorical and float outputs.
- [ ] Review gate: explicit approval to proceed to Phase 5.

## Phase 5 - Navigation and Trails

- [ ] Implement movement cost and directional passability.
- [ ] Implement followable flags.
- [ ] Implement deterministic trail seed selection and least-cost routing.
- [ ] Add deterministic tests for route ordering and tie-break behavior.
- [ ] Validate navigation payload shape and invariants.
- [ ] Review gate: explicit approval to proceed to Phase 6.

## Phase 6 - Output, Debug, and Hardening

- [ ] Finalize output envelope emission to `--output-file`.
- [ ] Implement debug artifact emission to `--output-dir`.
- [ ] Add CLI integration tests for `generate`, `derive`, and `debug` modes.
- [ ] Add end-to-end fixed-seed golden tests.
- [ ] Validate error messages and exit-code behavior.
- [ ] Final review gate: explicit approval to mark implementation complete.

## Cross-Cutting Policy Checks

- [ ] Policy decision updates are applied to all applicable artifacts (`docs/drafts/ImplementationPlan.md`, `AGENTS.md`, `docs/ADR.md`, and relevant spec docs).
- [ ] If applicability is unclear for any policy update, work is paused and instructions are requested before marking complete.
