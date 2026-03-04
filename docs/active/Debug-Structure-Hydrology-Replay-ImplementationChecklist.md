# Debug Structure + Hydrology Replay Implementation Checklist

Status: proposed  
Scope: expand `debug --input-file` replay from hydrology-only to structure+hydrology recompute using precedence-aware params.

- [ ] [app] `DSHR-APP-01` Build replay params for `debug --input-file` in [`src/app/run-generator.ts`](/mnt/c/workspace/projects/forest-terrain-generator/src/app/run-generator.ts) with precedence `defaults -> envelope.paramOverrides -> --params <file>`.
- [ ] [app] `DSHR-APP-04` When `debug --input-file` is used with `--params <file>`, emit exactly one warning per command invocation to `stderr` (for example `console.warn`) that replay overrides are active, and include the precedence chain `defaults -> envelope.paramOverrides -> --params <file>`.
- [ ] [input] `DSHR-INP-03` Validate and normalize envelope `paramOverrides` before replay merge using a defaults-derived params contract (from [`APPENDIX_A_DEFAULTS` in src/lib/default-params.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/lib/default-params.ts)); do not hard-couple replay validation to separate static schema key lists; fail fast on unknown or invalid override keys/values.
- [ ] [app] `DSHR-APP-02` In `debug --input-file` path, derive topographic structure from envelope `topography.h` using replay params via [`deriveTopographicStructure` in src/pipeline/derive-topographic-structure.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/pipeline/derive-topographic-structure.ts), and ignore envelope `features`, tile `featureIds`, and envelope tile `hydrology` fields as recompute inputs.
- [ ] [app] `DSHR-APP-03` Feed recomputed structure outputs (`basinFeatures`, `tileFeatureIds`) into [`deriveHydrology` in src/pipeline/derive-hydrology.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/pipeline/derive-hydrology.ts) in the same `debug --input-file` flow. Depends on `DSHR-APP-02`.
- [ ] [input] `DSHR-INP-01` In `debug --input-file` replay recompute mode, fail fast with input validation error when any tile has invalid topography shape for recompute (`topography` missing/non-object, `topography.h` missing, or non-finite `topography.h`), and include tile index/coordinate plus reason in the error message (do not coerce to `0`).
- [ ] [input] `DSHR-INP-02` In `debug --input-file` replay recompute mode, fail fast when input tiles do not form a dense rectangular grid (holes/duplicates/out-of-range coordinates), and include expected vs observed tile coverage details in the error message.
- [ ] [input] `DSHR-INP-04` Introduce a reusable tile validation helper module (for example [`src/lib/validate-replay-tiles.ts`](/mnt/c/workspace/projects/forest-terrain-generator/src/lib/validate-replay-tiles.ts)) that validates dense-grid shape plus required `topography.h`, and use it in replay flow so the same checks can be reused by other tools.
- [ ] [io] `DSHR-IO-01` Wire recomputed structure debug payload into [`writeModeOutputs` call in src/app/run-generator.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/app/run-generator.ts) for `debug --input-file`, so `topography.json` reflects replayed structure fields. Depends on `DSHR-APP-02`.
- [ ] [contract] `DSHR-CON-01` Define and implement `--debug-output-file` behavior for replay mode in [`src/app/run-generator.ts`](/mnt/c/workspace/projects/forest-terrain-generator/src/app/run-generator.ts): when replay recompute is active, emit recomputed `features` and tile feature memberships (not envelope-carried structure memberships). Depends on `DSHR-APP-02`.
- [ ] [contract] `DSHR-CON-02` Recompute and emit top-level `paramOverrides` delta from effective replay params in replay output envelope (not stale carried delta). Depends on `DSHR-APP-01`.
- [ ] [contract] `DSHR-CON-03` In replay mode, emit recomputed tile `hydrology` fields in `--debug-output-file` (not envelope-carried tile hydrology). Depends on `DSHR-APP-03`.
- [ ] [docs] `DSHR-DOC-01` Update replay semantics and precedence documentation in [`README.md`](/mnt/c/workspace/projects/forest-terrain-generator/README.md), including that envelope `features`, tile `featureIds`, and envelope tile `hydrology` fields are ignored as recompute inputs in `debug --input-file`, and that replay `--debug-output-file` carries recomputed structure/hydrology outputs.
- [ ] [deferred] `DSHR-DEF-01` (deferred phase) Refine warning emission so `DSHR-APP-04` only fires when params-file inputs materially override replay-effective values.

## Behavior Slices

### Slice A

- Goal: Establish deterministic replay parameter resolution for `debug --input-file`.
- Items: `DSHR-APP-01`, `DSHR-APP-04`, `DSHR-INP-03`
- Type: behavior

### Slice B

- Goal: Recompute topology structure and hydrology as a coherent pair from envelope `topography.h`, independent of envelope-carried feature memberships.
- Items: `DSHR-APP-02`, `DSHR-APP-03`, `DSHR-INP-01`, `DSHR-INP-02`, `DSHR-INP-04`
- Type: behavior

### Slice C

- Goal: Ensure replay outputs reflect recomputed structure/hydrology contract and effective replay params.
- Items: `DSHR-IO-01`, `DSHR-CON-01`, `DSHR-CON-02`, `DSHR-CON-03`
- Type: behavior

### Slice D

- Goal: Keep user-facing docs aligned with replay behavior and precedence.
- Items: `DSHR-DOC-01`
- Type: mechanical

### Slice E

- Goal: Track explicitly deferred warning-precision refinement outside current scope.
- Items: `DSHR-DEF-01`
- Type: mechanical
