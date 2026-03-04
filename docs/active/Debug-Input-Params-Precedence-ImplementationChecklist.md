# Debug Input-File Params Precedence Implementation Checklist

Status: implemented  
Scope: `debug --input-file` replay param precedence (`#1` slice only)

- [x] [app] `DIP-APP-01` Remove `--params` from debug input-file exclusivity guards in [`src/app/run-generator.ts`](/mnt/c/workspace/projects/forest-terrain-generator/src/app/run-generator.ts) so replay mode accepts a params file.
- [x] [app] `DIP-APP-02` Track params-file overrides separately from merged defaults in [`resolveInputs` in src/app/run-generator.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/app/run-generator.ts) and expose them through [`ResolvedInputs` in src/domain/types.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/domain/types.ts).
- [x] [app] `DIP-APP-03` Apply replay merge order in `debug --input-file` hydrology recompute as `defaults -> envelope.paramOverrides -> --params file` in [`runGenerator` in src/app/run-generator.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/app/run-generator.ts).
- [x] [docs] `DIP-DOC-01` Update debug-mode precedence documentation in [`README.md`](/mnt/c/workspace/projects/forest-terrain-generator/README.md).

## Behavior Slices

### Slice A
- Goal: Allow `debug --input-file` to accept `--params` while preserving existing exclusions for map/generation shape flags.
- Items: `DIP-APP-01`
- Type: behavior

### Slice B
- Goal: Enforce deterministic replay precedence so envelope defaults can be overridden by explicit params-file values.
- Items: `DIP-APP-02`, `DIP-APP-03`
- Type: behavior

### Slice C
- Goal: Keep user-facing CLI docs aligned with implemented precedence semantics.
- Items: `DIP-DOC-01`
- Type: mechanical
