# Water-Depth Surface Contract — Implementation Checklist

Scope: apply the approved water-surface/depth emission contract and root-fill safeguard without regressing existing hydrology behavior.

## Atomic Checklist Items

- [x] [hydrology] Enforce strict child-connect gating in `src/pipeline/derive-lake-accounting.ts` so parent effective inflow starts only after direct children are beyond connect.
- [x] [hydrology] Add an ordinary-root impossible-state guard in `src/pipeline/derive-lake-accounting.ts` that throws when root spill capacity is effectively zero and positive inflow still exists.
- [x] [output] Update `src/io/write-outputs.ts` to emit `waterSurfaceH` only for wet tiles and omit it for dry tiles.
- [x] [output] Update `src/io/write-outputs.ts` to emit `waterDepth` only when water surface is present/positive.
- [x] [output] Update replay-envelope hydrology serialization in `src/app/run-generator.ts` to match the same conditional `waterSurfaceH`/`waterDepth` contract.
- [x] [test] Add a root impossible-fill invariant test in `test/unit/lake-accounting.test.mjs`.
- [x] [test] Add a dry-tile omission contract test in `test/integration/hydrology-debug-artifacts.test.mjs`.
- [x] [test] Update replay hydrology contract assertions in `test/integration/cli-command-wiring.test.mjs` to validate conditional `waterSurfaceH`/`waterDepth`.
- [x] [docs] Update hydrology output field documentation in `README.md` to list `waterDepth` and conditional emission semantics.
- [x] [docs] Align `docs/normative/water-depth-model.md` root error wording with the implemented impossible-root-fill guard.

Dependencies:

- Item 2 depends on item 1.
- Items 3–5 depend on items 1–2.
- Items 6–8 depend on items 1–5.
- Items 9–10 depend on items 1–8.

## Behavior Slices

### Slice A — Basin accounting invariants

- Goal: enforce child-connect gating and ordinary-root impossible-state detection in accounting.
- Items: 1, 2
- Type: behavior

### Slice B — Output contract alignment

- Goal: serialize `waterSurfaceH` and `waterDepth` only when hydrologically present.
- Items: 3, 4, 5
- Type: behavior

### Slice C — Contract protection and documentation

- Goal: lock behavior with focused tests and align written contract with implementation.
- Items: 6, 7, 8, 9, 10
- Type: mechanical
