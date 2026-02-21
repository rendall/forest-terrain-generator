# Forest Terrain Generator — Implementation Plan & Checklist

## Phase 0 — Project Setup & Collaboration Guardrails

Before implementation starts, align on:

- [ ] Repository scaffolding (folders, module boundaries, naming conventions)
- [ ] `AGENTS.md` collaboration rules (decision process, review cadence, ownership)
- [ ] Dependency policy (allowed libraries, version pinning, update policy, license checks)
- [ ] Build/test/tooling baseline (formatter, linter, test runner, CI entrypoints)
- [ ] Determinism policy (seed handling, tie-break conventions, float/epsilon rules)
- [ ] Data contracts first (input schema, output schema/envelope versioning, error codes)
- [ ] Environment & reproducibility standards (runtime versions, lockfiles, dev setup)
- [ ] Quality gates (definition of done for each phase, minimum tests per feature)
- [ ] Documentation baseline (where specs, ADRs, and implementation notes live)
- [ ] Risk register kickoff (known unknowns and how we de-risk early)

### Phase 0.1 — Repository Scaffolding Proposal (Approved Direction)

Guiding constraints captured from stakeholder preference:

- TypeScript-first implementation
- Modern ESM `import` statements
- Functional style preferred over class-heavy object-oriented design

Proposed scaffold:

```txt
src/
  index.ts
  app/
    run-generator.ts
  domain/
    types.ts
    dir8.ts
    errors.ts
  pipeline/
    phase-00-validate/
      validate-input.ts
    phase-01-base-maps/
      generate-base-maps.ts
      apply-authored-maps.ts
    phase-02-topography/
      derive-slope.ts
      derive-aspect.ts
      classify-landform.ts
    phase-03-hydrology/
      derive-flow-direction.ts
      derive-flow-accumulation.ts
      derive-moisture.ts
    phase-04-ecology/
      classify-biome.ts
      derive-vegetation.ts
    phase-05-navigation/
      derive-move-cost.ts
      derive-passability.ts
    phase-06-output/
      build-output-envelope.ts
  lib/
    grid.ts
    math.ts
    deterministic.ts
  io/
    read-params.ts
    read-authored-maps.ts
    write-output.ts
  cli/
    main.ts
test/
  unit/
  integration/
  golden/
```

Scaffolding conventions to adopt:

- [ ] File naming: `kebab-case.ts`
- [ ] Module boundaries: domain types in `domain/`, pure derivations in `pipeline/`, side effects in `io/` + `cli/`
- [ ] Design approach: pure functions and explicit state flow; avoid mutable global state
- [ ] Runtime/module format: Node ESM (`"type": "module"`) and TypeScript `NodeNext`
- [ ] Strictness baseline: TypeScript strict mode enabled from day one

## Phase 1 — Foundations & Contracts

## Phase 2 — Core Terrain Signals

## Phase 3 — Hydrology Pass

## Phase 4 — Ecology & Grounding

## Phase 5 — Navigation Semantics

## Phase 6 — Output, Validation & Hardening
