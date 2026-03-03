# Tile Data Shape Implementation Checklist

Status: v1-draft
Source discussion: `docs/Tile-Data-Shape-Discussion.md`

- [ ] [contract] `TDS-01` Declare `v2` as a breaking tile/envelope contract in docs and wire output version marker to `meta.specVersion = "forest-terrain-v2"` for v2 outputs.
- [ ] [hydrology] `TDS-02` Make `tile.hydrology` required on every tile in v2 outputs (no optional hydrology object in emitted tiles).
- [ ] [hydrology] `TDS-03` Replace `tile.hydrology.isStream` with `tile.hydrology.hasStream?: true` and remove `isStream` from v2 tile payloads.
- [ ] [hydrology] `TDS-04` Emit `tile.hydrology.waterDepth: number` on every tile in v2 (default `0` when no local water influence).
- [ ] [hydrology] `TDS-05` Emit `tile.hydrology.basinId: string | null` on every tile in v2 alongside `waterDepth`.
- [ ] [hydrology] `TDS-06` Add stream-direction fields for stream tiles in v2: `inStreamDir?: StreamDir[]`, `outStreamDir?: StreamDir`, with `StreamDir = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW"`.
- [ ] [hydrology] `TDS-07` Enforce direction-field presence rules: omit `inStreamDir`/`outStreamDir` when `hasStream` is absent; allow missing `inStreamDir` at headwaters and missing `outStreamDir` at terminal sinks/outlets (depends on `TDS-03`, `TDS-06`).
- [ ] [hydrology] `TDS-08` Remove v1 lake abstraction fields from v2 tile hydrology payload: `lakeMask`, `lakeSurfaceH`, `lakeDepth`, `lakeBasinId`, `waterClass`.
- [ ] [validation] `TDS-09` Add v2 hydrology validation contract for ingest/debug source selection: `fd in {0..7,255}`, `fa >= 0`, finite `faN`, `hasStream` only when `true`, finite `waterDepth`, `basinId` string-or-null, valid `StreamDir` values in direction fields (depends on `TDS-03` to `TDS-08`).
- [ ] [debug] `TDS-10` Implement hydrology source mode selection (`auto | envelope | recompute`) in debug/hydrology-inspector request handling.
- [ ] [debug] `TDS-11` Implement `auto` mode behavior: use envelope hydrology only when all tiles pass v2 hydrology validation, otherwise recompute (depends on `TDS-09`, `TDS-10`).
- [ ] [debug] `TDS-12` Implement `envelope` mode behavior: fail fast when envelope hydrology is missing or invalid (depends on `TDS-09`, `TDS-10`).
- [ ] [debug] `TDS-13` Implement `recompute` mode behavior: always recompute hydrology maps from topology + params (depends on `TDS-10`).
- [ ] [debug] `TDS-14` Emit hydrology provenance in debug outputs: `hydrologyMapsSource`, `hydrologySourceMode`, and recompute context (`sinkMode`, key hydrology params such as `lakeFill.wetnessScale`) (depends on `TDS-10` to `TDS-13`).
- [ ] [io] `TDS-15` Persist top-level `paramOverrides` in generated envelopes as non-default parameter deltas only.
- [ ] [io] `TDS-16` Serialize `paramOverrides` after `tiles` in top-level output order for v2 envelopes (depends on `TDS-15`).
- [ ] [debug] `TDS-17` When recomputing from `--input-file`, load envelope `paramOverrides` into recompute context before hydrology derivation (depends on `TDS-15`).
- [ ] [topography] `TDS-18` Remove tile-level `featureIds` from v2 tile payloads.
- [ ] [topography] `TDS-19` Remove tile-level `activeFeatureIds` from v2 tile payloads.
- [ ] [topography] `TDS-20` Remove low-value tile structure fields from v2 payloads: `topography.structure.basinLike`, `ridgeLike`, `basinPersistence`, `peakPersistence`.
- [ ] [topography] `TDS-21` Remove tile-level `topography.elevationMeters` from v2 payloads.
- [ ] [metadata] `TDS-22` Add `meta.seed` as a canonical generation seed token (`string`) when envelope originates from seeded generation.
- [ ] [metadata] `TDS-23` Add `meta.elevation` block with `h0`, `h1`, `zMinMeters`, `zMaxMeters` and derive `zMinMeters/zMaxMeters` from realized map heights.
- [ ] [docs] `TDS-24` Document `topography.h` as canonical tile elevation scalar and `elevationMeters` as derived-from-metadata value (depends on `TDS-21`, `TDS-23`).
- [ ] [governance] `TDS-25` Decide and document replacement for tile->feature lookup after removing `featureIds`/`activeFeatureIds` (`index artifact`, `query CLI`, or `none`) before v2 contract freeze (depends on `TDS-18`, `TDS-19`).
- [ ] [governance] `TDS-26` Defer CLI-vs-`paramOverrides` precedence expansion to `docs/Parameter-Override-Precedence-Discussion.md`; do not expand CLI override behavior in this checklist scope.
- [ ] [governance] `TDS-27` At v2 shape lock, pin contract marker to `2.0.0` and record marker-field naming decision (`meta.specVersion` only vs additional contract-version field).

## Behavior Slices

### Slice A
- Goal: Establish v2 hydrology tile contract semantics with explicit stream and water-depth fields.
- Items: `TDS-02`, `TDS-03`, `TDS-04`, `TDS-05`, `TDS-06`, `TDS-07`, `TDS-08`, `TDS-09`
- Type: behavior

### Slice B
- Goal: Make debug hydrology sourcing deterministic and provenance-visible.
- Items: `TDS-10`, `TDS-11`, `TDS-12`, `TDS-13`, `TDS-14`, `TDS-17`
- Type: behavior

### Slice C
- Goal: Persist generation-context deltas in envelopes for reproducible replay.
- Items: `TDS-15`, `TDS-16`, `TDS-26`
- Type: behavior

### Slice D
- Goal: Remove redundant/low-signal tile payload fields and keep only canonical signals.
- Items: `TDS-18`, `TDS-19`, `TDS-20`, `TDS-21`
- Type: behavior

### Slice E
- Goal: Move elevation frame-of-reference and seed provenance into metadata.
- Items: `TDS-22`, `TDS-23`, `TDS-24`
- Type: behavior

### Slice F
- Goal: Close contract-governance decisions required to freeze v2 shape.
- Items: `TDS-01`, `TDS-25`, `TDS-27`
- Type: mechanical
