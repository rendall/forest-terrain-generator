# Structure Grab Scalar Implementation Checklist

- [x] [topography] `SG-01` Add `grab: number` to `TopographicStructureConfig` and `TopographicStructureParams` in `src/pipeline/derive-topographic-structure.ts`, and include config validation that enforces `0 <= grab <= 1`.
- [x] [params] `SG-02` Add `topography.structure.grab` default in `src/lib/default-params.ts` with the adopted default value (`0.35` unless changed by decision).
- [x] [params] `SG-03` Extend `validateTopographyStructureParams` in `src/io/read-params.ts` to accept `params.topography.structure.grab` as a numeric range `[0,1]`.
- [x] [topography] `SG-04` Add a helper in `src/pipeline/derive-topographic-structure.ts` that computes a persistence cutoff from `grab` using finite persistence values and percentile mapping `cutoff = lerp(P20, P80, grab)`.
- [x] [topography] `SG-05` Add a narrow-spread fallback in the cutoff helper (for example when percentile spread is near zero) so classification remains stable and deterministic.
- [x] [topography] `SG-06` Update basin classification in `deriveBasinStructure` to set `basinLike` from the `grab`-derived cutoff instead of directly comparing to `persistenceMin`, while keeping existing `basinPersistence` and `basinDepthLike` outputs unchanged.
- [x] [topography] `SG-07` Update peak classification in `derivePeakStructure` to set `ridgeLike` from the `grab`-derived cutoff instead of directly comparing to `persistenceMin`, while keeping existing `peakPersistence` and `peakRiseLike` outputs unchanged.
- [x] [topography] `SG-08` Ensure `deriveTopographicStructure` passes the adopted `grab` value through basin/peak derivation and preserves current `enabled=false` sentinel behavior.
- [x] [docs] `SG-09` Update `docs/drafts/Structure-Grab-Scalar-Discussion.md` with final adopted naming/defaults and note that `grab` is the single user-facing coarseness control.
- [x] [docs] `SG-10` Update `README.md` parameter documentation for `topography.structure` to explain `grab` semantics (`0` less grabby, `1` more grabby) and expected visual effect.

## Behavior Slices

### Slice 1
Goal: establish one-scalar params contract for structure coarseness.
Items: `SG-01`, `SG-02`, `SG-03`.
Type: `mechanical`.

### Slice 2
Goal: drive basin/peak class assignment from a single `grab`-derived persistence cut level.
Items: `SG-04`, `SG-05`, `SG-06`, `SG-07`, `SG-08`.
Type: `behavior`.

### Slice 3
Goal: make the adopted one-scalar model understandable and discoverable in project docs.
Items: `SG-09`, `SG-10`.
Type: `mechanical`.
