# Linting And Formatting Refresh Implementation Checklist

Archived note: this checklist is retained as the historical implementation record for the lint/format refresh proposal.

Source plan: `docs/archive/linting-and-formatting-refresh-plan.md`

- [x] `LFR-CONF-01` [tooling] Add `biome.json` at repo root to define the approved authored-code scope, excluded generated/example/fixture paths, and the explicit formatting policy for `src`, `test`, `scripts`, `package.json`, and `tsconfig.json`.
  - Trace:
    - "Add a checked-in Biome config that defines: in-scope file paths, excluded generated/example/fixture paths, formatting policy" (`In Scope`)
    - "Running `npm run lint` checks only the approved authored-code surface and does not report diagnostics from excluded paths like `dist` or large example/fixture JSON files." (`Acceptance Criteria`)
    - "On a clean checkout, `npm run lint` inspects only approved authored files and excludes generated, fixture, and example artifact paths." (`Binding Invariants`)
  - Validation: `biome.json`; `npx biome check src scripts test/unit test/integration package.json tsconfig.json biome.json`

- [x] `LFR-SCR-01` [tooling] Update the `scripts` block in `package.json` to add explicit `format`, `format:check`, `lint`, and `lint:fix` commands that operate on the same approved in-scope surface.
  - Depends on: `LFR-CONF-01`.
  - Trace:
    - "Add explicit repo scripts for check-only and write modes: `format`, `format:check`, `lint`, `lint:fix`" (`In Scope`)
    - "Contributors can run distinct check-only and write-mode repo scripts without manually supplying file paths." (`Binding Invariants`)
  - Validation: `package.json`; `npm run lint`; `npm run format:check`

- [x] `LFR-EDT-01` [tooling] Add `.editorconfig` only if needed to align editor defaults with the approved indentation and newline policy already defined for in-scope files.
  - Depends on: `LFR-CONF-01`.
  - Trace:
    - "Add a checked-in editor policy file if needed to align editor defaults with repo formatting behavior." (`In Scope`)
    - "The repo has one explicit checked-in formatting policy, including the chosen indentation style, rather than relying on tool defaults." (`Acceptance Criteria`)
  - Validation: `.editorconfig` when added; editor policy matches `biome.json`

- [ ] `LFR-VAL-01` [validation] Prove the new lint scope by running `npm run lint` and confirming excluded paths such as `dist`, `test/fixtures`, `docs/example`, `outdir`, and `raw` do not appear in diagnostics.
  - Depends on: `LFR-SCR-01`.
  - Trace:
    - "Exclude generated or high-noise paths such as `dist`, `test/fixtures`, `docs/example`, `outdir`, and `raw`." (`In Scope`)
    - "Running `npm run lint` checks only the approved authored-code surface" (`Acceptance Criteria`)
    - "Add or update repo scripts and config first, then prove scope correctness by running `npm run lint` and confirming excluded paths do not appear in diagnostics." (`Validation Strategy`)
  - Validation: `npm run lint`

- [ ] `LFR-FMT-01` [mechanical] Run one mechanical Biome formatting pass across the approved in-scope authored files and selected root config files without touching excluded generated/example/fixture artifacts.
  - Depends on: `LFR-VAL-01`.
  - Trace:
    - "Apply one mechanical formatting pass to in-scope files." (`In Scope`)
    - "In-scope source files, tests, scripts, and selected root config files are reformatted to the approved policy." (`Acceptance Criteria`)
  - Validation: `npm run format`

- [ ] `LFR-FMT-02` [validation] Prove formatting idempotence by rerunning the check-only formatter immediately after the mechanical formatting pass and confirming there are no further formatting changes required.
  - Depends on: `LFR-FMT-01`.
  - Trace:
    - "Running `npm run format` twice produces no additional file changes on the second run." (`Acceptance Criteria`)
    - "For any in-scope file set, running the repo formatting command twice is idempotent" (`Binding Invariants`)
    - "Run `npm run format`, then rerun `npm run format:check` to prove idempotence." (`Validation Strategy`)
  - Validation: `npm run format:check`

- [ ] `LFR-LINT-01` [mechanical] Apply Biome safe fixes and import organization across the approved in-scope authored files using the write-mode lint command, keeping this pass limited to automated lint cleanup.
  - Depends on: `LFR-FMT-02`.
  - Trace:
    - "Apply behavior-preserving source cleanups required to make the scoped Biome lint pass meaningful and green." (`In Scope`)
    - "The result should be a repo where formatting is automatic, lint output is reviewable" (`Plain-Language Intent`)
  - Validation: `npm run lint:fix`

- [ ] `LFR-SRC-01` [src] Resolve remaining manual Biome diagnostics in `src/**` with behavior-preserving code edits, including current hotspots such as `src/app/run-describe.ts`, `src/io/read-envelope.ts`, `src/pipeline/derive-topographic-structure.ts`, `src/lib/validate-replay-tiles.ts`, and related in-scope source files still reported after `LFR-LINT-01`.
  - Depends on: `LFR-LINT-01`.
  - Trace:
    - "Any remaining source-level lint failures discovered after the mechanical format pass are fixed with behavior-preserving code changes." (`Acceptance Criteria`)
    - "Lint- and format-driven cleanup in this plan does not change observable generator or CLI behavior" (`Binding Invariants`)
  - Validation: `npm run lint`; targeted existing tests for touched source when needed

- [ ] `LFR-TST-01` [test] Resolve remaining manual Biome diagnostics in `test/unit/**` and `test/integration/**` with behavior-preserving test-file cleanup only, without changing test intent or expanding scope.
  - Depends on: `LFR-LINT-01`.
  - Trace:
    - "Apply behavior-preserving source cleanups required to make the scoped Biome lint pass meaningful and green." (`In Scope`)
    - "Lint- and format-driven cleanup in this plan does not change observable generator or CLI behavior; existing typecheck and test validations still pass after the cleanup." (`Binding Invariants`)
  - Validation: `npm run lint`; `npm run test`

- [ ] `LFR-SCR-02` [scripts] Resolve remaining manual Biome diagnostics in `scripts/*.mjs` while preserving current script behavior and keeping shell-script tooling out of scope for this pass.
  - Depends on: `LFR-LINT-01`.
  - Trace:
    - "Narrow lint and format scope to authored files such as `src`, `test`, `scripts`, and selected root config files." (`In Scope`)
    - "Defer shell-specific tooling such as `shfmt` and `shellcheck` to a separate shell-tooling pass." (`Open Questions / Deferments`)
  - Validation: `npm run lint`

- [ ] `LFR-VAL-02` [validation] Run the full post-cleanup validation set and confirm `npm run lint`, `npm run format:check`, `npm run typecheck`, and `npm run test` all pass on the final in-scope surface.
  - Depends on: `LFR-SRC-01`, `LFR-TST-01`, `LFR-SCR-02`.
  - Trace:
    - "After the full pass, `npm run lint`, `npm run format:check`, `npm run typecheck`, and `npm run test` all pass." (`Acceptance Criteria`)
    - "Run `npm run typecheck` and `npm run test` after the cleanup to prove behavior remains unchanged." (`Validation Strategy`)
  - Validation: `npm run lint`; `npm run format:check`; `npm run typecheck`; `npm run test`

## Behavior Slices

### Slice A

- Goal: Define one explicit lint/format policy and expose it through standard repo scripts with the correct authored-file scope.
- Items: `LFR-CONF-01`, `LFR-SCR-01`, `LFR-EDT-01`, `LFR-VAL-01`
- Type: mechanical

### Slice B

- Goal: Apply the approved formatting policy mechanically and prove the formatter is stable on repeated runs.
- Items: `LFR-FMT-01`, `LFR-FMT-02`
- Type: mechanical

### Slice C

- Goal: Eliminate remaining scoped Biome diagnostics across source, tests, and scripts without changing observable behavior, then prove the repo is green.
- Items: `LFR-LINT-01`, `LFR-SRC-01`, `LFR-TST-01`, `LFR-SCR-02`, `LFR-VAL-02`
- Type: mechanical

## Conformance QC

- Missing from plan: none
- Extra beyond plan: none; markdownlint and shell-specific tooling remain explicitly deferred
- Atomicity fixes needed: none
- Validation mapping gaps: none; scope proof, formatter idempotence, and final repo validation are all explicit
- Traceability readiness: ready; scope-sensitive and behavior-preserving items include direct plan quotes
- Pass/Fail: Pass - ready for implementation
