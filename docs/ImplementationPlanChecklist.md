# Forest Terrain Generator - Implementation Checklist

This checklist is the execution companion to `docs/drafts/ImplementationPlan.md`.

Rules:

1. Follow precedence in `AGENTS.md` and the normative specification.
2. Treat each phase as closed only when its done criteria are satisfied.
3. Stop at each review gate and request explicit approval before continuing.

## Phase 0 - Alignment and Scaffold

- [x] Confirm project deliverable statement is present and consistent in `README.md` and `AGENTS.md`.
- [x] Confirm `AGENTS.md` alignment for approval gates and change process.
- [x] Confirm CLI command surface (`generate`, `derive`, `debug`) and output semantics (`--output-file` vs `--output-dir`).
- [x] Confirm overwrite policy: existing outputs fail by default; `--force` allows overwrite/replace.
- [x] Confirm help/empty-command equivalence: `help`, `--help`, `-h`, and no command all print top-level help and exit `0`.
- [x] Confirm CLI stream behavior policy (`stdout` for help/version, `stderr` for errors/status).
- [x] Decide initial dependency set and versioning approach for runtime and test tooling.
- [x] Define dependency policy (selection criteria, update cadence, pinning strategy, and license/security expectations).
- [x] Document major dependency choices and dependency policy in `docs/ADR.md`.
- [x] Approve repository scaffold and module boundaries (`domain`, `pipeline`, `lib`, `io`, `cli`).
- [x] Establish tooling baseline (TypeScript strict + NodeNext, Biome lint/format, Vitest test runner).
- [x] Define determinism policy baseline (seed handling, tie-break conventions, float/epsilon rules) and matching utility/test coverage expectations.
- [x] Define data-contract baseline (input schema, output envelope versioning, and error code contract) before Phase 1 implementation.
- [x] Confirm reproducibility minimums (Node version and lockfile policy).
- [x] Confirm minimal `package.json` baseline (`name`, `version`, `private`, `type`, `engines.node`, `bin`, scripts).
- [x] Run `npm init` using the approved `package.json` baseline.
- [x] Set lightweight phase definition of done (tests pass plus review gate approval).
- [x] Confirm documentation baseline paths (normative spec, ADR log, implementation plan/checklist).
- [x] Review gate: explicit approval to proceed to Phase 1.

## Phase 1 - Foundations and Contracts

### Phase 1 Decisions

- [x] Decide `seed` parsing/storage/validation for normative `uint64` input.
- [x] Decide config merge semantics for `CLI > file > defaults` (deep merge rules, array behavior, and scalar override behavior).
- [x] Decide unknown-input policy (unknown CLI flags and unknown params-file keys).
- [x] Decide params-file format support (for example JSON-only vs additional formats).
- [x] Decide path-resolution rules for file inputs (CWD-relative vs params-file-relative).
- [x] Decide mode-specific required/allowed inputs for `generate`, `derive`, and `debug`.
- [x] Decide output-argument validation by mode (`--output-file`, `--output-dir`, and optional `--debug-output-file` requirements).
- [x] Decide defaults-source policy and Appendix A alignment.
- [x] Decide validation/error taxonomy mapping to exit codes (`2`, `3`, `4`, `5`).
- [x] Decide duplicate-flag behavior (last value wins vs hard error).
- [x] Review the Phase 1 implementation checklist for further or unresolved ambiguity and confirm none remains before starting Phase 1 implementation.

### Phase 1 Implementation

- [x] Implement CLI input parsing and config precedence (CLI > file > defaults).
- [x] Implement input schema and validation errors.
- [x] Implement canonical CLI flags (`--params`, `--map-h`, `--map-r`, `--map-v`, `--output-file`, `--output-dir`, `--debug-output-file`, `--force`).
- [x] Implement params-file JSON-only enforcement and malformed-JSON classification as exit `2`.
- [x] Implement path-resolution behavior (CLI relative paths from CWD; params-file relative paths from params-file directory).
- [x] Implement mode/output validation details, including rejecting `--output-file` in `debug` with hint: `You might mean --debug-output-file.`
- [x] Implement duplicate-flag hard errors and unknown-input diagnostics with precise key/flag reporting and close-match suggestions when available.
- [x] Implement envelope skeleton builder and serializer boundary.
- [x] Implement exit code mapping for validation/shape/IO/internal failures.
- [x] Add integration tests for help behavior (`help`, `--help`, `-h`, no command) and command-error behavior (unknown/invalid -> exit `2`).
- [x] Add integration tests for stream behavior (`stdout` for help/version, `stderr` for errors/status).
- [x] Add integration tests for overwrite policy (existing outputs fail without `--force`, succeed with `--force`).
- [x] Add integration tests for command wiring and contract failures.
- [x] Update CLI help/docs to reflect canonical flag names, path-resolution rules, and debug output semantics.
- [ ] Review gate: explicit approval to proceed to Phase 2.

## Phase 2 - Topography

### Phase 2 Decisions

- [x] Decide deterministic v1 noise-function implementation choice for base-map generation (v1 uses in-repo deterministic 2D Perlin).
- [x] Decide Perlin implementation details (in-repo deterministic implementation; fixed gradient/permutation/fade/interpolation/normalization behavior; Appendix A defaults with noise tuning overrides via `--params`).
- [x] Decide in-memory grid representation and indexing contract for `H`, `R`, `V`, `SlopeMag`, `AspectDeg`, and `Landform` (row-major struct-of-arrays; `i = y * width + x`; `Float32Array` for numeric maps; `Uint8Array` for `Landform` enum codes; shared `GridShape` for all maps).
- [x] Decide authored-map file shape/format contract and parsing/validation behavior for `--map-h`, `--map-r`, and `--map-v` (JSON object: `{ "width": number, "height": number, "data": number[] }`; row-major `data`; length must equal `width * height`; finite values in `[0,1]`; no resampling/interpolation; schema/type/range errors -> exit `2`; shape/dimension mismatches -> exit `3`; diagnostics include map flag/file and failing key/index).
- [x] Decide range/clamping policy for base maps after generation and for authored-map validation (generated maps are clamped to `[0,1]` after normalization without warnings; authored maps remain strict and fail validation on out-of-range values with exit `2`).
- [x] Decide exact boundary-sampling implementation for slope/aspect clamping at map edges (clamped-coordinate sampling per spec 5.1: `xL=max(0,x-1)`, `xR=min(width-1,x+1)`, `yU=max(0,y-1)`, `yD=min(height-1,y+1)`; `Hx=H[xR,y]-H[xL,y]`; `Hy=H[x,yD]-H[x,yU]`; no special edge/corner branches).
- [x] Decide comparison conventions for landform thresholds (`eps`, `flatSlopeThreshold`) to prevent equality-edge drift (strict comparisons: `SlopeMag < flatSlopeThreshold` for flat branch; neighbor-high if `H[n] > center + eps`; neighbor-low if `H[n] < center - eps`; otherwise neutral/ignored).
- [x] Decide topography regression-test strategy (hybrid: committed/versioned golden snapshots for a fixed deterministic seed set, plus float epsilon assertions and targeted boundary/threshold fixtures).
- [x] Confirm v1 keeps the normative tile-resolution model (`1 base-map cell = 1 location`); defer any resolution-model change to a future ADR.
- [x] Decide exact Perlin constants and algorithm details to lock for implementation (Improved Perlin 2002 variant; fixed fade `6t^5 - 15t^4 + 10t^3`; fixed `lerp(a,b,t)`; fixed 2D gradient-set/dot-product logic; fixed 256-entry permutation expanded to 512; per-octave noise output normalized to `[-1,1]`).
- [x] Decide canonical seed-to-Perlin initialization mapping from `uint64`/`subSeed` values (use normative `subSeed(seed,mapId,octaveIndex)`; initialize SplitMix64 state with that `uint64`; build `perm[0..255]` via seeded Fisher-Yates using `j = rand % (i+1)`; expand to 512 by repetition).
- [x] Decide fixed `Landform` enum-code mapping for `Uint8Array` storage (Option 1/spec-order mapping: `0=flat`, `1=slope`, `2=ridge`, `3=valley`, `4=basin`).
- [x] Decide `AspectDeg` behavior for zero-slope/flat tiles (if `Hx == 0` and `Hy == 0`, set `AspectDeg = 0` as deterministic sentinel; otherwise use formula output normalized to `[0,360)`).
- [x] Decide Phase 2 golden snapshot scope details (balanced scope: fixed seeds `1`, `42`, `123456789`, `18446744073709551615`; grid sizes `16x16` and `64x64`; committed/versioned artifacts `H`, `R`, `V`, `SlopeMag`, `AspectDeg`, `Landform`; plus targeted boundary fixtures including `1xN`, `Nx1`, and threshold-near cases).
- [x] Review the Phase 2 implementation checklist for further or unresolved ambiguity and confirm none remains before starting Phase 2 implementation.

### Phase 2 Implementation

- [x] Implement Phase 2 typed-array map model and shared `GridShape` contract (row-major SoA for `H`, `R`, `V`, `SlopeMag`, `AspectDeg`, `Landform`).
- [x] Implement Improved Perlin (2002) primitives and deterministic permutation initialization (`subSeed` + SplitMix64 + Fisher-Yates).
- [x] Implement multi-octave base-map generation for `H`, `R`, and `V` using Appendix A parameters and generation-time `[0,1]` clamp policy.
- [x] Implement authored-map JSON parsing/validation for `--map-h`, `--map-r`, `--map-v` with strict `[0,1]` value checks, no resampling/interpolation, and exit-code mapping (`2`/`3`) per policy.
- [x] Implement authored-map override flow (`H`, `R`, `V`) with deterministic precedence and shape compatibility checks.
- [x] Implement slope magnitude and aspect derivation with clamped boundary sampling and `AspectDeg=0` sentinel for `Hx==0 && Hy==0`.
- [x] Implement landform classification with strict threshold comparisons and fixed enum mapping (`0=flat`, `1=slope`, `2=ridge`, `3=valley`, `4=basin`).
- [x] Add deterministic tests for ordering and tie-break behavior used by this phase.
- [x] Add fixed-seed hybrid topography regression tests using committed/versioned golden snapshots (balanced scope seeds/sizes/artifacts) plus targeted boundary/threshold fixtures.
- [ ] Review gate: explicit approval to proceed to Phase 3.

## Phase 3 - Hydrology

### Phase 3 Decisions

- [x] Decide hydrology in-memory map model and numeric types (`FD`, `FA`, `FA_N`, `LakeMask`, `isStream`, `distWater`, `Moisture`, `WaterClass`) (`FD`: `Uint8Array`; `FA`: `Uint32Array`; `FA_N`: `Float32Array`; `LakeMask`: `Uint8Array`; `isStream`: `Uint8Array`; `distWater`: `Uint32Array`; `Moisture`: `Float32Array`; `WaterClass`: `Uint8Array`; internal `InDeg`: `Uint8Array`).
- [x] Decide canonical `FD` storage contract (`Dir8` encoding and `NONE=255`) and neighbor-iteration helper contract for hydrology passes (`FD` uses `Dir8` numeric encoding `0..7`, `NONE=255`; hydrology traversal/enumeration uses one shared canonical neighbor-order helper: `E,SE,S,SW,W,NW,N,NE`).
- [x] Decide exact hash/tie-break implementation details for Section 6.1 flow-direction tie resolution (bit-width, hash function inputs, and modulo/indexing behavior) (spec-accurate `uint64` math via `BigInt`; `tieBreakHash64(seed,x,y)` exactly as normative formula; tied-candidate list `T` kept in canonical `Dir8` order; selection index `i = hash % |T|`).
- [x] Decide flow-accumulation numeric limits/overflow policy and deterministic topological queue implementation details (Kahn-style indegree reduction with FIFO queue; initial enqueue in row-major order; queue implemented as array+head-index; `FA` stored as `Uint32Array`; overflow-protection checks required on accumulation adds with fail-fast error if exceeded).
- [x] Decide `FA_N` normalization behavior for degenerate cases (`FAmax == FAmin`) and clamp/epsilon conventions (if `FAmax == FAmin`, set all `FA_N=0` exactly; otherwise apply normative log formula and `clamp01`; no additional hidden epsilon adjustments).
- [x] Decide lake/stream/moisture/water-class threshold comparison conventions (strict vs inclusive per threshold) and shared comparator helpers (use spec operators exactly: lake `SlopeMag < lakeFlatSlopeThreshold` and `FA_N >= lakeAccumThreshold`; stream `FA_N >= streamAccumThreshold` and `SlopeMag >= streamMinSlopeThreshold`; marsh `Moisture >= marshMoistureThreshold` and `SlopeMag < marshSlopeThreshold`; no hidden epsilon comparator offsets).
- [x] Decide explicit no-water and no-stream fallback handling details for proximity maps (`distWater`, `distStream`) and downstream moisture behavior (no-water: set all `distWater = hydrology.waterProxMaxDist`; no-stream: set all `distStream = gameTrails.streamProxMaxDist`; downstream wetness/proximity terms use these capped values deterministically).
- [x] Decide hydrology regression-test scope (balanced scope: seeds `1`, `42`, `123456789`, `18446744073709551615`; sizes `16x16` and `64x64`; committed/versioned golden artifacts `FD`, `FA`, `FA_N`, `LakeMask`, `isStream`, `distWater`, `Moisture`, `WaterClass`; targeted fixtures for tie-heavy flow, no-water fallback, threshold-edge behavior, water-class precedence, and `FD` acyclic invariant).
- [x] Decide hydrology module surface contract (single facade module `src/pipeline/hydrology.ts` with stable named exports for Phase 3 hydrology entrypoints).
- [x] Decide hydrology fail-fast error policy (hydrology fail-fast conditions map to exit code `5` and error messages MUST clearly describe what failed and why, including stage/context and relevant values where available).
- [x] Run a Phase 3 decision sanity check on targeted fixtures (tie-heavy flow, no-water/no-stream cases, and threshold-edge cases) and confirm behavior is not pathological before starting implementation (`FD` acyclic; valid `FD` domain; no `NaN`/`Infinity`; `FA>=1`; `FA_N` in `[0,1]`; water-class precedence holds; no-water/no-stream fallbacks applied as decided).
- [x] Review the Phase 3 implementation checklist for further or unresolved ambiguity and confirm none remains before starting Phase 3 implementation.

### Phase 3 Implementation

- [x] Implement Phase 3 typed-array hydrology map model with row-major storage contracts (`FD`, `FA`, `FA_N`, `LakeMask`, `isStream`, `distWater`, `Moisture`, `WaterClass`, and internal `InDeg`).
- [x] Implement flow direction with deterministic tie-break logic (`Dir8` + `NONE=255`, canonical neighbor order, and exact `tieBreakHash64` behavior).
- [x] Implement flow accumulation with deterministic Kahn/FIFO processing, overflow-protected `FA` updates, and spec-accurate `FA_N` normalization.
- [x] Implement lakes, streams, moisture, and water-class derivations with exact threshold operators and precedence rules.
- [x] Implement explicit no-water/no-stream fallback behavior for proximity maps and downstream moisture/proximity terms.
- [x] Implement single hydrology facade module `src/pipeline/hydrology.ts` with stable named exports used by tests and orchestration.
- [x] Implement hydrology fail-fast diagnostics policy (internal failure / exit `5`) with clear stage/invariant/reason messaging and relevant context values.
- [x] Add fixed-seed hydrology golden regressions for balanced scope seeds/sizes/artifacts.
- [x] Add targeted hydrology sanity fixtures (tie-heavy flow, no-water fallback, no-stream fallback, threshold-edge behavior, water-class precedence, `FD` domain, `FA_N` degenerate case, and `FD` acyclic invariant) and resolve red tests to green.
- [x] Verify traversal-order conformance to normative Section 1.7.
- [ ] Review gate: explicit approval to proceed to Phase 4.

## Phase 4 - Ecology and Grounding

### Phase 4 Decisions

- [x] Decide Phase 4 in-memory map model and enum/storage contracts (`Biome`, `SoilType`, `TreeDensity`, `CanopyCover`, `Obstruction`, `SurfaceFlags`, `FeatureFlags`) and serialization mapping into the output envelope.
- [x] Decide deterministic rule tables for under-specified Ground/Roughness derivations (explicit `SoilType` mapping and explicit threshold rules for each `SurfaceFlags`/`FeatureFlags` member).
- [x] Decide threshold-operator and boundary conventions for all Phase 4 classifiers/formulas (`>=` vs `>`, `<` vs `<=`, and float-comparison precision policy).
- [x] Decide deterministic ordering and shape contracts for list outputs (`dominant`, `surfaceFlags`, `featureFlags`) including ordering guarantees for multi-flag tiles.
- [ ] Decide Phase 4 regression scope and assertions (fixed seeds/sizes, golden artifacts, targeted fixtures, and float epsilon policy).
- [ ] Decide whether Phase 4 rule concretization requires ADR and/or draft-spec updates before implementation, and record required artifacts.
- [ ] Review the Phase 4 implementation checklist for further or unresolved ambiguity and confirm none remains before starting Phase 4 implementation.

### Phase 4 Implementation

- [ ] Implement biome assignment and vegetation attributes.
- [ ] Implement dominant species derivation.
- [ ] Implement ground and roughness feature derivations.
- [ ] Add regression tests for categorical and float outputs.
- [ ] Review gate: explicit approval to proceed to Phase 5.

## Phase 5 - Navigation and Trails

- [ ] Implement movement cost and directional passability.
- [ ] Implement followable flags.
- [ ] Implement deterministic trail seed selection and least-cost routing.
- [ ] Add deterministic tests for route ordering and tie-break behavior.
- [ ] Validate navigation payload shape and invariants.
- [ ] Review gate: explicit approval to proceed to Phase 6.

## Phase 6 - Output, Debug, and Hardening

- [ ] Finalize output envelope emission to `--output-file`.
- [ ] Implement debug artifact emission to `--output-dir`.
- [ ] Add CLI integration tests for `generate`, `derive`, and `debug` modes.
- [ ] Add end-to-end fixed-seed golden tests.
- [ ] Validate error messages and exit-code behavior.
- [ ] Final review gate: explicit approval to mark implementation complete.

## Cross-Cutting Policy Checks

- [ ] Policy decision updates are applied to all applicable artifacts (`docs/drafts/ImplementationPlan.md`, `AGENTS.md`, `docs/ADR.md`, and relevant spec docs).
- [ ] If applicability is unclear for any policy update, work is paused and instructions are requested before marking complete.
