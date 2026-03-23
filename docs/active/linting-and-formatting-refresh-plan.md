# Linting And Formatting Refresh Plan

## Goal

Define an approved implementation plan for making linting and formatting reliable, deterministic, and low-noise across authored code in this repository without changing terrain-generation behavior, CLI behavior, or determinism.

## Plain-Language Intent

When this plan is implemented, contributors should be able to run a small set of repo scripts and get a trustworthy answer about style and lint health. Those scripts should check authored files only, avoid generated and fixture noise, apply one explicit formatting policy, and leave runtime behavior unchanged. The result should be a repo where formatting is automatic, lint output is reviewable, and mechanical cleanup is clearly separated from any behavior-preserving code refactors needed to satisfy lint rules.

## In Scope

- Keep Biome as the primary linter and formatter for JS, TS, MJS, JSON, and JSONC surfaces already present in the repo.
- Add a checked-in Biome config that defines:
  - in-scope file paths
  - excluded generated/example/fixture paths
  - formatting policy
  - any rule configuration needed to make the lint surface intentional
- Add explicit repo scripts for check-only and write modes:
  - `format`
  - `format:check`
  - `lint`
  - `lint:fix`
- Add a checked-in editor policy file if needed to align editor defaults with repo formatting behavior.
- Narrow lint and format scope to authored files such as `src`, `test`, `scripts`, and selected root config files.
- Exclude generated or high-noise paths such as `dist`, `test/fixtures`, `docs/example`, `outdir`, and `raw`.
- Apply one mechanical formatting pass to in-scope files.
- Apply behavior-preserving source cleanups required to make the scoped Biome lint pass meaningful and green.
- Verify that typechecking and tests still pass after the cleanup.

## Out of Scope

- Changing generator logic, hydrology behavior, terrain outputs, CLI contracts, or determinism semantics.
- Replacing Biome with ESLint, Prettier, Biome-plus-Prettier, or another primary formatter stack.
- Reformatting archived/example/fixture/generated artifacts that are excluded by the new scope.
- Broad documentation governance work beyond formatting any explicitly in-scope root config files.
- Introducing markdownlint execution in this pass.
- Introducing `shfmt` or `shellcheck` in this pass.

## Acceptance Criteria

- Running `npm run lint` checks only the approved authored-code surface and does not report diagnostics from excluded paths like `dist` or large example/fixture JSON files.
- Running `npm run format:check` reports formatting status for the same in-scope surface used by the formatting pass.
- Running `npm run format` twice produces no additional file changes on the second run.
- The repo has one explicit checked-in formatting policy, including the chosen indentation style, rather than relying on tool defaults.
- In-scope source files, tests, scripts, and selected root config files are reformatted to the approved policy.
- Any remaining source-level lint failures discovered after the mechanical format pass are fixed with behavior-preserving code changes.
- After the full pass, `npm run lint`, `npm run format:check`, `npm run typecheck`, and `npm run test` all pass.

## Implementation Guardrails

### Binding Invariants

1. On a clean checkout, `npm run lint` inspects only approved authored files and excludes generated, fixture, and example artifact paths.
2. For any in-scope file set, running the repo formatting command twice is idempotent: the second run produces no further changes.
3. Lint- and format-driven cleanup in this plan does not change observable generator or CLI behavior; existing typecheck and test validations still pass after the cleanup.
4. Contributors can run distinct check-only and write-mode repo scripts without manually supplying file paths.

### Validation Strategy

- Add or update repo scripts and config first, then prove scope correctness by running `npm run lint` and confirming excluded paths do not appear in diagnostics.
- Run `npm run format`, then rerun `npm run format:check` to prove idempotence.
- Run `npm run typecheck` and `npm run test` after the cleanup to prove behavior remains unchanged.
- When source lint failures require manual code edits, prefer targeted validation for the touched area before broader repo validation.

Traceability:

- Invariant 1 -> `npm run lint` scoped clean run -> lint script and Biome config -> trustworthy authored-code diagnostics
- Invariant 2 -> `npm run format` then `npm run format:check` -> formatter script and Biome config -> stable repeated formatting result
- Invariant 3 -> `npm run typecheck` and `npm run test` after cleanup -> touched source files -> unchanged runtime and test behavior
- Invariant 4 -> script invocation checks via `package.json` -> repo scripts -> contributors can use standard check/write commands without custom paths

### Hardest Missing Step

The hardest missing step is separating purely mechanical formatting churn from real source-level lint debt without weakening the lint surface or accidentally changing behavior. This is difficult because the current repo mixes generated-path noise, broad formatting drift, and genuine code warnings in the same output. This step is proven solved when the lint scope is narrowed first, the mechanical format/import pass is isolated, and the remaining diagnostics form a short, intentional list of behavior-preserving code fixes that can be validated without test changes.

## Open Questions / Deferments

- Defer markdownlint execution to a separate docs-governance pass. This plan does not add a markdownlint dependency or CI step.
- Defer shell-specific tooling such as `shfmt` and `shellcheck` to a separate shell-tooling pass.
- Choose tabs as the repo indentation policy for this pass to minimize churn and align with the dominant style already present in `src` and much of `test`.

## What Remains False

- There is not yet an approved implementation result for the linting and formatting refresh.
- `npm run lint` still targets `.` and still includes generated/example/fixture noise today.
- The repo still lacks explicit check-only/write-mode formatting scripts.
- The repo still lacks a checked-in Biome policy defining scope and exclusions.
- Current formatting remains mixed across `src`, `test`, and `scripts`.
- The existing `.markdownlint.jsonc` remains present without an active markdownlint workflow, and shell scripts remain outside the proposed tooling pass.

## Conformance QC

- Intent clarity issues: none
- Missing required sections: none
- Ambiguities/assumptions to resolve: markdownlint and shell tooling are explicitly deferred to keep this pass bounded
- Guardrail gaps: none, assuming checklist authoring preserves the scope-first sequencing and post-cleanup behavior validation
- Traceability readiness: ready; each invariant has a named validation path and observable result
- Pass/Fail: Pass - ready for checklist authoring
