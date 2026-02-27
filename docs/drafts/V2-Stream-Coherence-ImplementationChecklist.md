# V2 Stream Coherence - Implementation Checklist

Primary references:

1. `docs/drafts/V2-Stream-Coherence-ImplementationPlan.md` (Section 14, adopted slate)
2. `docs/normative/ForestTerrainGeneration.md` (Section 17 addendum)
3. `docs/ADR.md` (stream-coherence ADR entry)

Checklist constraint:

1. This checklist excludes testing steps by design; testing is handled by implementation workflow policy.

## Scope Guard

- [x] [scope] `SC-01` Keep stream-coherence changes scoped to hydrology, params, navigation passability policy, app wiring, and debug metrics.
- [x] [scope] `SC-02` Do not modify `src/pipeline/description.ts` in this track.
- [x] [scope] `SC-03` Keep stream-direction representation sourced from existing outputs (`fd`, `isStream`, `waterClass`) with no new stream-direction field.

## Data Contract and Params

- [ ] [types] `DC-01` Add `pool` to `WATER_CLASS_CODE` in `src/domain/hydrology.ts`.
- [ ] [types] `DC-02` Extend `WaterClassCode` in `src/domain/hydrology.ts` to include the new `pool` code (depends on `DC-01`).
- [ ] [types] `DC-03` Add `poolMask: Uint8Array` to `HydrologyMapsSoA` in `src/domain/hydrology.ts` (depends on `DC-01`).
- [ ] [types] `DC-04` Initialize `poolMask` in `createHydrologyMaps` in `src/domain/hydrology.ts` (depends on `DC-03`).
- [ ] [params] `DC-05` Replace `hydrology.streamAccumThreshold` and `hydrology.streamMinSlopeThreshold` defaults with `hydrology.streamThresholds.sourceAccumMin`, `channelAccumMin`, and `minSlope` in `src/lib/default-params.ts`.
- [ ] [params] `DC-06` Add `hydrology.streamThresholds.maxGapFillSteps` default with disabled baseline (`0`) in `src/lib/default-params.ts` (depends on `DC-05`).
- [ ] [params] `DC-07` Add `hydrology.streamHeadwaterBoost` defaults in `src/lib/default-params.ts` with `enabled: false` and explicit threshold/cap keys.
- [ ] [params] `DC-08` Extend `PARAMS_VALIDATION_SCHEMA` in `src/io/read-params.ts` to accept `hydrology.streamThresholds.*` (depends on `DC-05`).
- [ ] [params] `DC-09` Extend `PARAMS_VALIDATION_SCHEMA` in `src/io/read-params.ts` to accept `hydrology.streamHeadwaterBoost.*` (depends on `DC-07`).
- [ ] [params] `DC-10` Add `normalizeLegacyHydrologyAliases` in `src/io/read-params.ts` to map legacy `hydrology.streamAccumThreshold` into `hydrology.streamThresholds.sourceAccumMin` when nested key is absent (depends on `DC-08`).
- [ ] [params] `DC-11` Add `normalizeLegacyHydrologyAliases` mapping for legacy `hydrology.streamMinSlopeThreshold` into `hydrology.streamThresholds.minSlope` when nested key is absent (depends on `DC-08`).
- [ ] [params] `DC-12` Apply `normalizeLegacyHydrologyAliases` to parsed params before unknown-key validation in `readParamsFile` in `src/io/read-params.ts` (depends on `DC-10` and `DC-11`).
- [ ] [app] `DC-13` Add `buildHydrologyParams` helper in `src/app/run-generator.ts` that assembles v2 hydrology params (`streamThresholds`, `streamHeadwaterBoost`, `streamProxMaxDist`, and existing hydrology keys).
- [ ] [app] `DC-14` Replace inline hydrology-params object creation in `runGenerator` in `src/app/run-generator.ts` with `buildHydrologyParams` output (depends on `DC-13`).

## Hydrology Topology Core

- [ ] [hydrology] `HY-01` Replace `StreamMaskParams` with `StreamThresholdParams` in `src/pipeline/hydrology.ts`.
- [ ] [hydrology] `HY-02` Add `StreamHeadwaterBoostParams` interface in `src/pipeline/hydrology.ts` for optional headwater-source enrichment (depends on `HY-01`).
- [ ] [hydrology] `HY-03` Update `HydrologyParams` in `src/pipeline/hydrology.ts` to include `streamThresholds: StreamThresholdParams` (depends on `HY-01`).
- [ ] [hydrology] `HY-04` Update `HydrologyParams` in `src/pipeline/hydrology.ts` to include `streamHeadwaterBoost: StreamHeadwaterBoostParams` (depends on `HY-02`).
- [ ] [hydrology] `HY-05` Add `deriveDownstreamIndexMap(shape, fd)` in `src/pipeline/hydrology.ts` returning `Int32Array` with `-1` for `DIR8_NONE`.
- [ ] [hydrology] `HY-06` Add `deriveBaseStreamSources` in `src/pipeline/hydrology.ts` using `lakeMask`, `faN`, `slopeMag`, and `streamThresholds.sourceAccumMin/minSlope` gates (depends on `HY-03`).
- [ ] [hydrology] `HY-07` Add `applyHeadwaterBoostSources` in `src/pipeline/hydrology.ts` that adds deterministic extra sources when `streamHeadwaterBoost.enabled` is true (depends on `HY-02` and `HY-06`).
- [ ] [hydrology] `HY-08` Add `deriveStreamTopology` in `src/pipeline/hydrology.ts` that traces each source along downstream links and returns `{ isStream, poolMask }` (depends on `HY-05`, `HY-06`, and `HY-07`).
- [ ] [hydrology] `HY-09` In `deriveStreamTopology` in `src/pipeline/hydrology.ts`, mark all traversed path tiles as `isStream=1` to enforce continuous channels (depends on `HY-08`).
- [ ] [hydrology] `HY-10` In `deriveStreamTopology` in `src/pipeline/hydrology.ts`, mark eligible terminal sinks as `poolMask=1` under adopted S1 semantics (depends on `HY-08`).
- [ ] [hydrology] `HY-11` Add `applyOptionalStreamCleanup` in `src/pipeline/hydrology.ts` controlled by `streamThresholds.maxGapFillSteps` and disabled when value is `0` (depends on `HY-03` and `HY-08`).
- [ ] [hydrology] `HY-12` Add `validateStreamContinuity` in `src/pipeline/hydrology.ts` that fail-fast checks every `isStream` tile has downstream continuation to `isStream|lakeMask|poolMask` (depends on `HY-08` and `HY-10`).
- [ ] [hydrology] `HY-13` Update `deriveHydrology` in `src/pipeline/hydrology.ts` to call `deriveDownstreamIndexMap` once and reuse it for stream topology logic (depends on `HY-05`).
- [ ] [hydrology] `HY-14` Update `deriveHydrology` in `src/pipeline/hydrology.ts` to call `deriveBaseStreamSources` and `applyHeadwaterBoostSources` before topology tracing (depends on `HY-06`, `HY-07`, and `HY-13`).
- [ ] [hydrology] `HY-15` Update `deriveHydrology` in `src/pipeline/hydrology.ts` to call `deriveStreamTopology` and assign both `maps.isStream` and `maps.poolMask` (depends on `HY-08` and `HY-14`).
- [ ] [hydrology] `HY-16` Update `deriveHydrology` in `src/pipeline/hydrology.ts` to run `applyOptionalStreamCleanup` after topology derivation (depends on `HY-11` and `HY-15`).
- [ ] [hydrology] `HY-17` Update `deriveHydrology` in `src/pipeline/hydrology.ts` to run `validateStreamContinuity` after final stream masks are computed (depends on `HY-12` and `HY-16`).

## Water Proximity, WaterClass, and Passability Integration

- [ ] [hydrology] `WC-01` Update `deriveDistWater` signature in `src/pipeline/hydrology.ts` to accept `poolMask` (depends on `DC-03`).
- [ ] [hydrology] `WC-02` Add `poolMask` length validation in `deriveDistWater` in `src/pipeline/hydrology.ts` (depends on `WC-01`).
- [ ] [hydrology] `WC-03` Include `poolMask` as a distance source in `deriveDistWater` in `src/pipeline/hydrology.ts` (depends on `WC-01`).
- [ ] [hydrology] `WC-04` Update `classifyWaterClass` signature in `src/pipeline/hydrology.ts` to accept `poolMask` (depends on `DC-03`).
- [ ] [hydrology] `WC-05` Add `poolMask` length validation in `classifyWaterClass` in `src/pipeline/hydrology.ts` (depends on `WC-04`).
- [ ] [hydrology] `WC-06` Add `pool` precedence branch in `classifyWaterClass` in `src/pipeline/hydrology.ts` between `stream` and `marsh` (`lake -> stream -> pool -> marsh -> none`) (depends on `WC-04` and `DC-01`).
- [ ] [hydrology] `WC-07` Update `deriveHydrology` in `src/pipeline/hydrology.ts` to pass `maps.poolMask` into `deriveDistWater` (depends on `WC-01` and `HY-15`).
- [ ] [hydrology] `WC-08` Update `deriveHydrology` in `src/pipeline/hydrology.ts` to pass `maps.poolMask` into `classifyWaterClass` (depends on `WC-04` and `HY-15`).
- [ ] [app] `WC-09` Add `pool` mapping to `WATER_CLASS_NAME_BY_CODE` in `src/app/run-generator.ts` so tile payloads can emit `"waterClass": "pool"` (depends on `DC-01`).
- [ ] [navigation] `WC-10` Keep lake-only blocking behavior in `deriveDirectionalPassability` in `src/pipeline/navigation.ts` and add a short comment that `pool` is intentionally non-blocking by default.

## Stream Coherence Metrics and Debug Manifest

- [ ] [hydrology] `MT-01` Add `StreamCoherenceMetrics` interface in `src/pipeline/hydrology.ts` for: continuation violations, component count, singleton count, largest component size, stream tile share, and no-stream fallback flag.
- [ ] [hydrology] `MT-02` Add `deriveStreamCoherenceMetrics` in `src/pipeline/hydrology.ts` that computes required metrics from `shape`, `fd`, `isStream`, `lakeMask`, and `poolMask` (depends on `MT-01` and `HY-15`).
- [ ] [app] `MT-03` Compute stream coherence metrics in `runGenerator` in `src/app/run-generator.ts` after hydrology derivation using `deriveStreamCoherenceMetrics` (depends on `MT-02`).
- [ ] [io] `MT-04` Add optional `streamCoherence` parameter to `writeModeOutputs` in `src/io/write-outputs.ts` (depends on `MT-03`).
- [ ] [io] `MT-05` Add optional `streamCoherence` parameter to `writeDebugOutputs` in `src/io/write-outputs.ts` (depends on `MT-04`).
- [ ] [io] `MT-06` Add optional `streamCoherence` parameter to `writeDebugArtifacts` in `src/io/write-outputs.ts` (depends on `MT-05`).
- [ ] [io] `MT-07` Add `streamCoherence` object to `debug-manifest.json` payload in `writeDebugArtifacts` in `src/io/write-outputs.ts` when metrics are provided (depends on `MT-06`).
- [ ] [app] `MT-08` Pass stream coherence metrics from `runGenerator` into `writeModeOutputs` in `src/app/run-generator.ts` for debug-mode publication (depends on `MT-04` and `MT-03`).

## Behavior Slices

- `S1` Goal: enforce scope boundaries and direction-source contract.
  - Items: `SC-01`, `SC-02`, `SC-03`
  - Type: mechanical

- `S2` Goal: extend data contract and parameter surface for v2 stream coherence and backward compatibility.
  - Items: `DC-01`, `DC-02`, `DC-03`, `DC-04`, `DC-05`, `DC-06`, `DC-07`, `DC-08`, `DC-09`, `DC-10`, `DC-11`, `DC-12`, `DC-13`, `DC-14`
  - Type: behavior

- `S3` Goal: replace threshold-only stream marking with deterministic path-aware topology generation.
  - Items: `HY-01`, `HY-02`, `HY-03`, `HY-04`, `HY-05`, `HY-06`, `HY-07`, `HY-08`, `HY-09`, `HY-10`
  - Type: behavior

- `S4` Goal: integrate optional cleanup and hard continuity validation into hydrology orchestration.
  - Items: `HY-11`, `HY-12`, `HY-13`, `HY-14`, `HY-15`, `HY-16`, `HY-17`
  - Type: behavior

- `S5` Goal: propagate `pool` through water-proximity, water-class precedence, payload mapping, and passability policy.
  - Items: `WC-01`, `WC-02`, `WC-03`, `WC-04`, `WC-05`, `WC-06`, `WC-07`, `WC-08`, `WC-09`, `WC-10`
  - Type: behavior

- `S6` Goal: publish stream-coherence metrics in app and debug-output pipeline.
  - Items: `MT-01`, `MT-02`, `MT-03`, `MT-04`, `MT-05`, `MT-06`, `MT-07`, `MT-08`
  - Type: behavior
