# Non-Collapsing Structure Identity — Implementation Checklist

- [x] [domain] `NCSI-01` Add a topographic feature schema in `src/domain/topography.ts` (or `src/domain/topographic-features.ts`) for basin/peak nodes with: `id`, `kind`, `parentId`, `childIds`, `birthH`, `mergeH`, `persistence`, `minH`, `maxH`, `size`, `bbox`, and optional `tileIds` (leaf only).
- [x] [domain] `NCSI-02` Add envelope-facing feature container types for `features.basins` and `features.peaks`, plus tile-level `featureIds: string[]` and optional `activeFeatureIds: string[]` contract notes used by generator serialization.
- [x] [topography] `NCSI-03` Add deterministic feature ID helpers in `src/pipeline/derive-topographic-structure.ts` (or a sibling helper) for basin IDs (`b_#####`) and peak IDs (`p_#####`) from stable sweep order with row-major tie-breaks.
- [x] [topography] `NCSI-04` Add deterministic ordering helpers for feature output arrays and `childIds` sorting; ensure ordering does not depend on object/map insertion order.
- [ ] [topography] `NCSI-05` Refactor basin derivation to preserve loser identity as leaf nodes and create composite parent nodes at each merge event, rather than collapsing lineage to a single winner (depends on `NCSI-01`, `NCSI-03`).
- [ ] [topography] `NCSI-06` Record basin unresolved-root semantics in node fields (`mergeH` absent/NaN and persistence handling per existing unresolved policy) without fabricating extra merge events (depends on `NCSI-05`).
- [ ] [topography] `NCSI-07` Compute and store basin aggregates per node (`size`, `bbox`, `minH`, `maxH`) and include `tileIds` only for basin leaf nodes (depends on `NCSI-05`).
- [ ] [topography] `NCSI-08` Refactor peak derivation to preserve loser identity as leaf nodes and create composite parent nodes at each saddle merge, mirroring basin non-collapsing behavior (depends on `NCSI-01`, `NCSI-03`).
- [ ] [topography] `NCSI-09` Record peak unresolved-root semantics in node fields (`mergeH` absent/NaN and persistence handling aligned to adopted policy) without synthetic merge fabrication (depends on `NCSI-08`).
- [ ] [topography] `NCSI-10` Compute and store peak aggregates per node (`size`, `bbox`, `minH`, `maxH`) and include `tileIds` only for peak leaf nodes (depends on `NCSI-08`).
- [ ] [topography] `NCSI-11` Derive per-tile `featureIds` as the combined basin+peak membership IDs for each tile; keep IDs deterministic and de-duplicated (depends on `NCSI-07`, `NCSI-10`).
- [ ] [topography] `NCSI-12` Derive optional per-tile `activeFeatureIds` from persistence-cut composite selection only (leaf inclusion is not cut-driven), using the existing persistence-cut semantics (depends on `NCSI-11`).
- [ ] [topography] `NCSI-13` Keep existing boolean compatibility outputs (`basinLike`, `ridgeLike`) derived from persistence cut while feature-tree outputs are introduced, to avoid downstream breakage in current consumers (depends on `NCSI-12`).
- [ ] [app] `NCSI-14` Update `src/app/run-generator.ts` to write tile-level `featureIds` (and adopted optional `activeFeatureIds`) into standard `out.json` tiles (depends on `NCSI-11`).
- [ ] [app] `NCSI-15` Add top-level `features` object population in generated envelope output with both basin and peak trees and deterministic ordering (depends on `NCSI-04`, `NCSI-07`, `NCSI-10`).
- [ ] [io] `NCSI-16` Update debug artifact assembly in `src/io/write-outputs.ts` so debug `topography.json` includes full feature trees and per-tile feature ID arrays in a stable serialized order (depends on `NCSI-15`).
- [ ] [docs] `NCSI-17` Update `README.md` output-schema section to document `features` tree shape, leaf-only `tileIds`, tile `featureIds`, and unresolved `mergeH` semantics.
- [ ] [docs] `NCSI-18` Update `docs/drafts/NonCollapsing-Structure-Identity-Discussion.md` to mark implementation status and confirm locked decisions are reflected in code-facing schema names.

## Behavior Slices

### Slice A
Goal: establish the feature-tree data contract and deterministic identity rules.
Items: `NCSI-01`, `NCSI-02`, `NCSI-03`, `NCSI-04`
Type: mechanical

### Slice B
Goal: implement non-collapsing basin feature-tree derivation with correct unresolved and aggregate semantics.
Items: `NCSI-05`, `NCSI-06`, `NCSI-07`
Type: behavior

### Slice C
Goal: implement non-collapsing peak feature-tree derivation with matching semantics.
Items: `NCSI-08`, `NCSI-09`, `NCSI-10`
Type: behavior

### Slice D
Goal: compute tile membership and active composite selection while preserving current boolean compatibility.
Items: `NCSI-11`, `NCSI-12`, `NCSI-13`
Type: behavior

### Slice E
Goal: expose the new feature model in standard and debug outputs.
Items: `NCSI-14`, `NCSI-15`, `NCSI-16`
Type: behavior

### Slice F
Goal: align documentation with the implemented schema and semantics.
Items: `NCSI-17`, `NCSI-18`
Type: mechanical
