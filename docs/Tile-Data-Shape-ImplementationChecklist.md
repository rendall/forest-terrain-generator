# Tile Data Shape Implementation Checklist

Status: implemented
Source discussion: `docs/Tile-Data-Shape-Discussion.md`

Execution note: `TDS-MIG-*` items are orchestration checkpoints; `TDS-*` items define the detailed contract behavior.

- [x] [migration] `TDS-MIG-01` Freeze v2 contract marker in the envelope skeleton (`meta.specVersion = "forest-terrain-v2"`). Targets: `src/app/build-envelope.ts#SPEC_VERSION`.
- [x] [migration] `TDS-MIG-02` Add v2 envelope metadata shape fields (`meta.seed`, `meta.elevation`) to the core domain contract. Targets: `src/domain/types.ts#TerrainEnvelopeMeta`.
- [x] [migration] `TDS-MIG-03` Add top-level `paramOverrides` support to envelope types and preserve deterministic serialization placement after `tiles`. Targets: `src/domain/types.ts#TerrainEnvelope`, `src/io/serialize-envelope.ts#serializeEnvelope`.
- [x] [migration] `TDS-MIG-04` Update envelope reader validation to accept v2 metadata and top-level `paramOverrides` while retaining v1 readability. Targets: `src/io/read-envelope.ts#readTerrainEnvelopeFile`, `src/io/read-envelope.ts#assertTileShape`.
- [x] [migration] `TDS-MIG-05` Switch generator emission to v2 tile payload shape (required `hydrology`, removed legacy tile fields). Targets: `src/app/run-generator.ts#runGenerator`, `src/io/write-outputs.ts#writeModeOutputs`.
- [x] [migration] `TDS-MIG-06` Migrate hydrology derivation output mapping from legacy stream/lake fields to v2 fields (`hasStream`, `waterDepth`, `basinId`). Targets: `src/pipeline/derive-hydrology.ts#deriveHydrology`, `src/pipeline/derive-lake-accounting.ts#deriveLakeAccounting`.
- [x] [migration] `TDS-MIG-07` Migrate hydrology-inspector ingestion/normalization to v2 hydrology field set with source-mode-aware validation. Targets: `src/app/run-hydrology-inspector.ts`, `src/cli/hydrology-inspector.ts`.
- [x] [migration] `TDS-MIG-08` Migrate feature-dependent consumers away from tile-level `featureIds` to feature-tree expansion fallback. Targets: `src/app/run-map.ts#runMap`, `src/app/run-stream.ts#runStream`, `src/app/run-hydrology-inspector.ts#collectExpandedBasinTileSets`.
- [x] [migration] `TDS-MIG-09` Update canonical docs/examples to v2 payload shape and source-mode semantics. Targets: `README.md`, `docs/Tile-Data-Shape-Discussion.md`, `docs/example/forest.json`.
- [x] [migration] `TDS-MIG-10` Update canonical examples/fixtures to v2 payload contract and provenance behavior. Targets: `docs/example/forest.json`, `test/fixtures/hydrology-baseline/debug-envelope.json`, `test/fixtures/hydrology-baseline/README.md`.

- [x] [contract] `TDS-01` Declare `v2` as a breaking tile/envelope contract in docs and CLI help text. Targets: `README.md`, `src/cli/main.ts`.
- [x] [hydrology] `TDS-02` Make `tile.hydrology` required on every tile in v2 outputs. Targets: `src/io/write-outputs.ts#buildHydrologyDebugTiles`, `src/app/run-generator.ts#runGenerator`.
- [x] [hydrology] `TDS-03` Replace `tile.hydrology.isStream` with `tile.hydrology.hasStream?: true` in emitted tiles and ingest logic. Targets: `src/pipeline/derive-hydrology.ts#deriveHydrology`, `src/io/write-outputs.ts#buildHydrologyDebugTiles`, `src/app/run-hydrology-inspector.ts`.
- [x] [hydrology] `TDS-04` Emit `tile.hydrology.waterDepth: number` on every tile in v2 (default `0`). Targets: `src/pipeline/derive-lake-accounting.ts#deriveLakeAccounting`, `src/io/write-outputs.ts#buildHydrologyDebugTiles`.
- [x] [hydrology] `TDS-04B` Enforce and document signed `waterDepth` semantics (`>0` submerged, `0` shoreline/no local water influence, `<0` above local basin water surface). Targets: `src/pipeline/derive-lake-accounting.ts#deriveLakeAccounting`, `docs/Tile-Data-Shape-Discussion.md`, `README.md`.
- [x] [hydrology] `TDS-05` Emit `tile.hydrology.basinId: string | null` on every tile in v2 alongside `waterDepth`. Targets: `src/pipeline/derive-lake-accounting.ts#deriveLakeAccounting`, `src/io/write-outputs.ts#buildHydrologyDebugTiles`.
- [x] [hydrology] `TDS-06` Add stream-direction fields for stream tiles in v2: `inStreamDir?: StreamDir[]`, `outStreamDir?: StreamDir`, where `StreamDir = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW"`. Targets: `src/domain/hydrology.ts`, `src/pipeline/derive-hydrology.ts#deriveHydrology`.
- [x] [hydrology] `TDS-07` Enforce direction-field presence rules: omit `inStreamDir`/`outStreamDir` when `hasStream` is absent; allow missing `inStreamDir` at headwaters and missing `outStreamDir` at terminal sinks/outlets. Targets: `src/pipeline/derive-hydrology.ts#deriveHydrology`, `src/app/run-hydrology-inspector.ts`.
- [x] [hydrology] `TDS-08` Derive `inStreamDir`/`outStreamDir` deterministically from finalized FD edges only (no heuristic side channels). Targets: `src/pipeline/derive-hydrology.ts#deriveHydrology`.
- [x] [hydrology] `TDS-09` Remove v1 lake abstraction fields from v2 tile hydrology payload: `lakeMask`, `lakeSurfaceH`, `lakeDepth`, `lakeBasinId`, `waterClass`. Targets: `src/io/write-outputs.ts#buildHydrologyDebugTiles`, `src/app/run-hydrology-inspector.ts`.
- [x] [validation] `TDS-10` Add v2 hydrology validation contract for ingest/debug source selection: `fd in {0..7,255}`, `fa >= 0`, finite `faN`, `hasStream` only when `true`, finite `waterDepth`, `basinId` string-or-null, valid `StreamDir` values. Targets: `src/app/run-hydrology-inspector.ts`, `src/io/read-envelope.ts`.
- [x] [debug] `TDS-11` Implement hydrology source mode selection (`auto | envelope | recompute`) in inspector/debug request handling, with default mode explicitly set to `auto`. Targets: `src/cli/hydrology-inspector.ts`, `src/app/run-hydrology-inspector.ts`.
- [x] [debug] `TDS-12` Implement `auto` mode: use envelope hydrology only when all tiles pass v2 hydrology validation; otherwise recompute. Targets: `src/app/run-hydrology-inspector.ts`.
- [x] [debug] `TDS-13` Implement `envelope` mode: fail fast when envelope hydrology is missing/invalid. Targets: `src/app/run-hydrology-inspector.ts`, `src/cli/hydrology-inspector.ts`.
- [x] [debug] `TDS-14` Implement `recompute` mode: always recompute hydrology maps from topology + params. Targets: `src/app/run-hydrology-inspector.ts`, `src/pipeline/derive-hydrology.ts#deriveHydrology`.
- [x] [debug] `TDS-15` Emit hydrology provenance in inspector/debug outputs: `hydrologyMapsSource`, `hydrologySourceMode`, and recompute context (`sinkMode`, `lakeFill.wetnessScale`). Targets: `src/app/run-hydrology-inspector.ts`, `src/cli/hydrology-inspector.ts`.
- [x] [io] `TDS-16` Persist top-level `paramOverrides` in generated envelopes as non-default parameter deltas only. Targets: `src/app/run-generator.ts#resolveInputs`, `src/io/write-outputs.ts#writeStandardOutput`.
- [x] [io] `TDS-17` Serialize `paramOverrides` after `tiles` in top-level output order for v2 envelopes. Targets: `src/io/serialize-envelope.ts#serializeEnvelope`.
- [x] [debug] `TDS-18` In recompute-from-`--input-file`, apply precedence exactly as `defaults -> envelope.paramOverrides -> CLI --params file -> explicit CLI parameter flags`. Targets: `src/app/run-generator.ts#resolveInputs`, `src/app/run-generator.ts#assertDebugInputFileArgs`, `src/app/run-hydrology-inspector.ts`, `src/cli/argv-validation.ts#validateArgv`.
- [x] [cli] `TDS-29` Allow `--input-file` to be combined with `--params` and explicit CLI parameter overrides for debug/inspector recompute paths; preserve clear diagnostics for disallowed combinations. Targets: `src/app/run-generator.ts#assertDebugInputFileArgs`, `src/cli/argv-validation.ts#validateArgv`, `src/cli/main.ts`, `README.md`.
- [x] [topography] `TDS-19` Remove tile-level `featureIds` from v2 payloads. Targets: `src/io/write-outputs.ts`, `src/app/run-generator.ts#runGenerator`.
- [x] [topography] `TDS-20` Remove tile-level `activeFeatureIds` from v2 payloads. Targets: `src/io/write-outputs.ts`, `src/app/run-generator.ts#runGenerator`.
- [x] [topography] `TDS-21` Remove low-value tile structure fields from v2 payloads: `topography.structure.basinLike`, `ridgeLike`, `basinPersistence`, `peakPersistence`. Targets: `src/io/write-outputs.ts`, `src/pipeline/derive-topographic-structure.ts`.
- [x] [topography] `TDS-22` Remove tile-level `topography.elevationMeters` from v2 payloads. Targets: `src/io/write-outputs.ts`, `src/app/run-generator.ts#runGenerator`.
- [x] [metadata] `TDS-23` Add `meta.seed` as canonical generation seed token (`string`) when envelope originates from seeded generation. Targets: `src/app/build-envelope.ts#buildEnvelopeSkeleton`, `src/app/run-generator.ts#resolveInputs`.
- [x] [metadata] `TDS-24` Add `meta.elevation` block with `h0`, `h1`, `zMinMeters`, `zMaxMeters`; derive `zMinMeters/zMaxMeters` from realized map heights. Targets: `src/app/run-generator.ts#buildElevationParams`, `src/io/write-outputs.ts`.
- [x] [docs] `TDS-25` Document `topography.h` as canonical scalar and `elevationMeters` as derived from `meta.elevation`. Targets: `README.md`, `docs/Tile-Data-Shape-Discussion.md`.
- [x] [governance] `TDS-26` Record v2 decision that direct tile-level feature lookup replacement is `none`; canonical lookup is feature-centric. Targets: `docs/Tile-Data-Shape-Discussion.md`, `README.md`.
- [x] [governance] `TDS-27` Record and document the authoritative precedence contract as `defaults < envelope paramOverrides < CLI --params file < explicit CLI flags`. Targets: `docs/Tile-Data-Shape-Discussion.md`, `docs/Parameter-Override-Precedence-Discussion.md`, `README.md`.
- [x] [governance] `TDS-28` Keep `meta.specVersion` as the only contract marker in this track; do not add `tileContractVersion`/`hydrologyContractVersion` fields. Targets: `src/domain/types.ts#TerrainEnvelopeMeta`, `README.md`, `docs/Tile-Data-Shape-Discussion.md`.

## Behavior Slices

### Slice M

- Goal: Perform the concrete cross-cutting migration sequence for v2 shape rollout with deterministic touchpoints.
- Items: `TDS-MIG-01`, `TDS-MIG-02`, `TDS-MIG-03`, `TDS-MIG-04`, `TDS-MIG-05`, `TDS-MIG-06`, `TDS-MIG-07`, `TDS-MIG-08`, `TDS-MIG-09`, `TDS-MIG-10`
- Type: mechanical

### Slice A

- Goal: Establish v2 hydrology tile contract semantics with explicit stream and water-depth fields.
- Items: `TDS-02`, `TDS-03`, `TDS-04`, `TDS-04B`, `TDS-05`, `TDS-06`, `TDS-07`, `TDS-08`, `TDS-09`, `TDS-10`
- Type: behavior

### Slice B

- Goal: Make debug hydrology sourcing deterministic and provenance-visible.
- Items: `TDS-11`, `TDS-12`, `TDS-13`, `TDS-14`, `TDS-15`, `TDS-18`, `TDS-29`
- Type: behavior

### Slice C

- Goal: Persist generation-context deltas in envelopes for reproducible replay.
- Items: `TDS-16`, `TDS-17`, `TDS-27`
- Type: behavior

### Slice D

- Goal: Remove redundant or low-signal tile payload fields and keep only canonical signals.
- Items: `TDS-19`, `TDS-20`, `TDS-21`, `TDS-22`
- Type: behavior

### Slice E

- Goal: Move elevation frame-of-reference and seed provenance into metadata.
- Items: `TDS-23`, `TDS-24`, `TDS-25`
- Type: behavior

### Slice F

- Goal: Close contract-governance decisions required to freeze v2 shape.
- Items: `TDS-01`, `TDS-26`, `TDS-28`
- Type: mechanical
