# V2 Lake Coherence - Implementation Checklist

Primary references:

1. `docs/drafts/V2-Lake-Coherence-ImplementationPlan.md` (Section 14 adopted decisions)
2. `docs/drafts/V2-Simulation-Repair-ProposedSolutions.md` (Sections 4.3 and 4.12)
3. `docs/normative/ForestTerrainGeneration.md` (lake/hydrology normative updates required before completion)

Checklist constraint:

1. This checklist excludes testing steps by design; testing is handled by implementation workflow policy.

## Scope Guard

- [x] [scope] `LK-SC-01` Keep this track scoped to lake coherence in hydrology, params, app wiring, debug metrics, and normative/ADR updates.
- [x] [scope] `LK-SC-02` Do not modify `src/pipeline/description.ts` in this track.
- [x] [scope] `LK-SC-03` Do not implement full time-step flood simulation in this track.

## Data Contract and Params

- [x] [types] `LK-DC-01` Add `lakeSurfaceH: Float32Array` to `HydrologyMapsSoA` in `src/domain/hydrology.ts`.
- [x] [types] `LK-DC-02` Initialize `lakeSurfaceH` in `createHydrologyMaps` in `src/domain/hydrology.ts` (depends on `LK-DC-01`).
- [x] [params] `LK-DC-03` Add `hydrology.lakeCoherence` defaults in `src/lib/default-params.ts` with explicit values: `enabled=true`, `microLakeMaxSize=2`, `microLakeMode=\"merge\"`, `bridgeEnabled=true`, `maxBridgeDistance=1`, `repairSingletons=true`, `enforceBoundaryRealism=true`, `boundaryEps=0.0005`, `boundaryRepairMode=\"trim_first\"`.
- [x] [params] `LK-DC-04` Keep `hydrology.lakeGrowSteps` and `hydrology.lakeGrowHeightDelta` defaults unchanged in `src/lib/default-params.ts` (`lakeGrowSteps` remains opt-in at `0`).
- [x] [params] `LK-DC-05` Extend `PARAMS_VALIDATION_SCHEMA` in `src/io/read-params.ts` to accept `hydrology.lakeCoherence.*` (depends on `LK-DC-03`).
- [x] [params] `LK-DC-06` Add strict enum/value validation for `hydrology.lakeCoherence.microLakeMode` (`merge|remove|leave`) and `hydrology.lakeCoherence.boundaryRepairMode` (`trim_first` only in first wave) in `src/io/read-params.ts` (depends on `LK-DC-05`).
- [x] [params] `LK-DC-07` Add numeric validation rules for `hydrology.lakeCoherence.microLakeMaxSize`, `maxBridgeDistance`, and `boundaryEps` in `src/io/read-params.ts` (depends on `LK-DC-05`).
- [x] [app] `LK-DC-08` Ensure `buildHydrologyParams` in `src/app/run-generator.ts` forwards `hydrology.lakeCoherence` to hydrology derive path.

## Lake Coherence Core (Micro-Lakes and Bridging)

- [x] [hydrology] `LK-LC-01` Add `LakeCoherenceParams` interface in `src/pipeline/hydrology.ts` for adopted `lakeCoherence` controls (depends on `LK-DC-03`).
- [x] [hydrology] `LK-LC-02` Extend `HydrologyParams` in `src/pipeline/hydrology.ts` to include `lakeCoherence` (depends on `LK-LC-01`).
- [x] [hydrology] `LK-LC-03` Add normalization helpers in `src/pipeline/hydrology.ts` for `lakeCoherence` values and adopted defaults (`microLakeMaxSize=2`, `bridgeEnabled=true`, `boundaryEps=0.0005`, `boundaryRepairMode=trim_first`) (depends on `LK-LC-01`).
- [x] [hydrology] `LK-LC-04` Add deterministic connected-component extraction helper for lake masks in `src/pipeline/hydrology.ts` that returns stable component ordering.
- [x] [hydrology] `LK-LC-05` Add `applyMicroLakePolicy` in `src/pipeline/hydrology.ts` that applies `microLakeMode` to components with size `<= microLakeMaxSize` (depends on `LK-LC-04`).
- [x] [hydrology] `LK-LC-06` In `applyMicroLakePolicy`, implement `merge` deterministically with stable tie-breaking when multiple merge targets are eligible (depends on `LK-LC-05`).
- [x] [hydrology] `LK-LC-07` Add `applyLakeComponentBridging` in `src/pipeline/hydrology.ts` controlled by `bridgeEnabled` and `maxBridgeDistance` (depends on `LK-LC-04`).
- [x] [hydrology] `LK-LC-08` Add `applyLakeCoherence` orchestrator in `src/pipeline/hydrology.ts` that runs micro-lake policy and bridging in deterministic order (depends on `LK-LC-05` and `LK-LC-07`).
- [x] [hydrology] `LK-LC-09` Keep total-lake-share handling metric-only (no hard blocking guardrail) in first-wave implementation.
- [x] [hydrology] `LK-LC-10` Ensure `hydrology.lakeCoherence.enabled=false` bypasses lake-coherence post-pass behavior and preserves legacy lake-mask path semantics.

## Boundary Realism and Lake Surface

- [x] [hydrology] `LK-BR-01` Add `deriveLakeBoundaryViolations` in `src/pipeline/hydrology.ts` to detect lake-boundary tiles adjacent to strictly lower non-lake neighbors beyond `boundaryEps`.
- [x] [hydrology] `LK-BR-02` Add `applyBoundaryRealismTrimFirst` in `src/pipeline/hydrology.ts` for deterministic trim-first repair behavior (depends on `LK-BR-01`).
- [x] [hydrology] `LK-BR-03` Add boundary-repair dispatch in `src/pipeline/hydrology.ts` honoring `boundaryRepairMode` with adopted default `trim_first`.
- [x] [hydrology] `LK-BR-04` Add `validateLakeBoundaryRealism` fail-fast in `src/pipeline/hydrology.ts` for the hard boundary invariant (depends on `LK-BR-01`).
- [x] [hydrology] `LK-BR-05` Add `deriveLakeSurfaceH` in `src/pipeline/hydrology.ts` that assigns a deterministic component water-surface elevation to lake tiles and sets non-lake tiles to `0` in `lakeSurfaceH` (depends on `LK-DC-01` and `LK-LC-04`).
- [x] [hydrology] `LK-BR-06` Update `deriveHydrology` in `src/pipeline/hydrology.ts` to run lake steps in adopted order: seed mask -> optional legacy growth -> coherence post-pass -> boundary repair -> boundary validation -> lakeSurfaceH assignment (depends on `LK-LC-08`, `LK-BR-02`, `LK-BR-04`, and `LK-BR-05`).
- [x] [hydrology] `LK-BR-07` Keep `lakeDepthH` out of emitted hydrology contract in this phase and document derivation expectation as `lakeSurfaceH - topography.h`.

## App Output and Debug Metrics

- [x] [hydrology] `LK-MT-01` Add `LakeCoherenceMetrics` interface in `src/pipeline/hydrology.ts` with fields: `componentCount`, `singletonCount`, `largestComponentSize`, `largestComponentShare`, `totalLakeShare`, `boundaryViolationCount`.
- [x] [hydrology] `LK-MT-02` Add `deriveLakeCoherenceMetrics` in `src/pipeline/hydrology.ts` (depends on `LK-MT-01`).
- [x] [app] `LK-MT-03` Compute lake coherence metrics in `runGenerator` in `src/app/run-generator.ts` after hydrology derivation (depends on `LK-MT-02`).
- [x] [app] `LK-MT-04` Map `lakeSurfaceH` into emitted tile hydrology payloads in `src/app/run-generator.ts` for lake tiles (depends on `LK-BR-05`).
- [x] [io] `LK-MT-05` Add optional `lakeCoherence` parameter to `writeModeOutputs` in `src/io/write-outputs.ts` (depends on `LK-MT-03`).
- [x] [io] `LK-MT-06` Add optional `lakeCoherence` parameter to `writeDebugOutputs` in `src/io/write-outputs.ts` (depends on `LK-MT-05`).
- [x] [io] `LK-MT-07` Add optional `lakeCoherence` parameter to `writeDebugArtifacts` in `src/io/write-outputs.ts` (depends on `LK-MT-06`).
- [x] [io] `LK-MT-08` Publish `lakeCoherence` metrics subset in `debug-manifest.json` from `writeDebugArtifacts` when provided (depends on `LK-MT-07`).
- [x] [app] `LK-MT-09` Pass lake coherence metrics from `runGenerator` to `writeModeOutputs` in `src/app/run-generator.ts` (depends on `LK-MT-05` and `LK-MT-03`).

## Governance and Normative Alignment

- [ ] [docs] `LK-GV-01` Add/update ADR entry documenting adopted lake decisions `L-01` through `L-11` and `lakeSurfaceH` contract.
- [ ] [docs] `LK-GV-02` Update `docs/normative/ForestTerrainGeneration.md` with lake boundary hard invariant, `lakeCoherence` params, and `lakeSurfaceH` output semantics.
- [ ] [docs] `LK-GV-03` Update `docs/drafts/ImplementationPlan.md` active policy addenda to reference the adopted lake-coherence track.

## Behavior Slices

- `S1`
  - Goal: establish scope boundaries and lake data/params contract.
  - Items: `LK-SC-01`, `LK-SC-02`, `LK-SC-03`, `LK-DC-01`, `LK-DC-02`, `LK-DC-03`, `LK-DC-04`, `LK-DC-05`, `LK-DC-06`, `LK-DC-07`, `LK-DC-08`
  - Type: behavior

- `S2`
  - Goal: implement deterministic lake coherence post-pass for micro-lakes and bridging.
  - Items: `LK-LC-01`, `LK-LC-02`, `LK-LC-03`, `LK-LC-04`, `LK-LC-05`, `LK-LC-06`, `LK-LC-07`, `LK-LC-08`, `LK-LC-09`, `LK-LC-10`
  - Type: behavior

- `S3`
  - Goal: enforce boundary realism hard invariant and compute lake surface elevation.
  - Items: `LK-BR-01`, `LK-BR-02`, `LK-BR-03`, `LK-BR-04`, `LK-BR-05`, `LK-BR-06`, `LK-BR-07`
  - Type: behavior

- `S4`
  - Goal: publish lake surface field and lake coherence metrics through app/debug outputs.
  - Items: `LK-MT-01`, `LK-MT-02`, `LK-MT-03`, `LK-MT-04`, `LK-MT-05`, `LK-MT-06`, `LK-MT-07`, `LK-MT-08`, `LK-MT-09`
  - Type: behavior

- `S5`
  - Goal: align governance artifacts and normative documents with adopted lake policy.
  - Items: `LK-GV-01`, `LK-GV-02`, `LK-GV-03`
  - Type: behavior
