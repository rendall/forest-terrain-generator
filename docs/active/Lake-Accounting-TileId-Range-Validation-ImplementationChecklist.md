# Lake Accounting TileId Range Validation Implementation Checklist

Status: proposed  
Scope: address Copilot review feedback by preventing out-of-range basin `tileIds` from skewing lake accounting.

## Intended Solution

- Constrain basin tile membership expansion in [`collectExpandedTileSets` in src/pipeline/derive-lake-accounting.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/pipeline/derive-lake-accounting.ts) to tile IDs within `[0, shape.size)`.
- Ensure downstream lake accounting (`spillCapacity`, fill/overflow role decisions) uses only bounded tile memberships so invalid feature data cannot bias results.
- Preserve existing deterministic behavior for valid inputs while failing gracefully (ignore invalid tile IDs rather than throwing).

- [x] [input] `LATR-INP-01` Update [`collectExpandedTileSets` in src/pipeline/derive-lake-accounting.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/pipeline/derive-lake-accounting.ts) to require grid-shape context and filter basin `tileIds` to `tileId >= 0 && tileId < shape.size` during tile-set collection.
- [x] [contract] `LATR-CON-01` Ensure lake accounting computations in [`deriveLakeAccounting` in src/pipeline/derive-lake-accounting.ts](/mnt/c/workspace/projects/forest-terrain-generator/src/pipeline/derive-lake-accounting.ts) consume bounded expanded tile sets so out-of-range direct/child memberships cannot affect spill capacity or fill metrics. Depends on `LATR-INP-01`.
- [x] [contract] `LATR-CON-02` Preserve deterministic runtime handling by ignoring (not throwing on) out-of-range feature `tileIds`, while keeping all valid-tile behavior unchanged in [`src/pipeline/derive-lake-accounting.ts`](/mnt/c/workspace/projects/forest-terrain-generator/src/pipeline/derive-lake-accounting.ts). Depends on `LATR-CON-01`.

## Behavior Slices

### Slice A

- Goal: Prevent invalid basin tile memberships from influencing lake accounting outputs.
- Items: `LATR-INP-01`, `LATR-CON-01`, `LATR-CON-02`
- Type: behavior
