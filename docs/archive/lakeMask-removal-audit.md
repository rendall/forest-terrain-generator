## Scope & method

I read the repository-level instructions and the water-depth model, then searched for `lakeMask` usages with:

- `cat AGENTS.md && cat docs/normative/water-depth-model.md`
- `rg -n "lakeMask|lake mask|lake_mask|lake-mask" .`
- `rg -n "lakeMask" src test scripts README.md docs -g '!**/*.json'`
- targeted `nl -ba ... | sed -n ...` on each matching source/test/script file.

Per the model, `waterDepth` is the continuous source for tile water state and can be positive/zero/negative; `waterSurfaceH` is basin-level truth; basin membership alone must not imply standing water. `lakeMask` is binary and therefore not the primary hydrologic variable for semantics-preserving decisions.【F:docs/normative/water-depth-model.md†L53-L77】【F:docs/normative/water-depth-model.md†L127-L131】【F:docs/normative/water-depth-model.md†L157-L181】

---

## 1) Every file reading (or structurally depending on) `lakeMask`

### Runtime code

1. **`src/io/write-outputs.ts`**  
   Reads `hydrologyMaps.lakeMask[index]` and emits `hydrology.lakeMask` in tile output.【F:src/io/write-outputs.ts†L106-L122】

2. **`src/app/run-generator.ts`**  
   Reads `hydrology.maps.lakeMask[index]` and emits `lakeMask` in CLI envelope tile hydrology payload.【F:src/app/run-generator.ts†L221-L231】

3. **`src/app/run-hydrology-inspector.ts`**  
   - Reads `hydrology?.lakeMask` from `hydrology.json` artifacts and stores into `maps.lakeMask`.【F:src/app/run-hydrology-inspector.ts†L421-L430】
   - Reads `hydrology?.lakeMask` from envelope tiles and stores into `maps.lakeMask`.【F:src/app/run-hydrology-inspector.ts†L617-L637】
   - Uses `maps.lakeMask` for lake tile count and depth stats accumulation gate.【F:src/app/run-hydrology-inspector.ts†L835-L857】

4. **`src/pipeline/derive-hydrology.ts`** *(depends/writes; not a read site, but central to semantics)*  
   Sets `maps.lakeMask[i]=1` iff `depth > 0` (where depth derives from lake accounting).【F:src/pipeline/derive-hydrology.ts†L455-L463】

5. **`src/domain/hydrology.ts`** *(structural dependency)*  
   Defines `lakeMask` as part of `HydrologyMapsSoA` and allocates storage for it.【F:src/domain/hydrology.ts†L29-L37】【F:src/domain/hydrology.ts†L44-L51】

### Tooling / scripts / tests (still depend on field presence or semantics)

6. **`test/integration/hydrology-debug-artifacts.test.mjs`**  
   Explicitly depends on `lakeMask === false` while `waterSurfaceH` exists (subsurface/negative depth behavior).【F:test/integration/hydrology-debug-artifacts.test.mjs†L192-L218】

7. **`test/integration/cli-command-wiring.test.mjs`**  
   Requires `lakeMask` to exist and be boolean in generated/replay payload schema checks.【F:test/integration/cli-command-wiring.test.mjs†L277-L284】【F:test/integration/cli-command-wiring.test.mjs†L564-L571】

8. **`test/unit/read-envelope.test.mjs`**  
   Fixture includes `hydrology.lakeMask` in valid tile shape.【F:test/unit/read-envelope.test.mjs†L20-L29】

9. **`test/unit/derive-hydrology.test.mjs`**  
    Asserts tile can have `waterSurfaceH` with `lakeMask===0` (depth non-positive case).【F:test/unit/derive-hydrology.test.mjs†L221-L224】

10. **`test/unit/lake-determinism.test.mjs`**  
    Asserts deterministic equality of `maps.lakeMask` across runs.【F:test/unit/lake-determinism.test.mjs†L78-L80】

---

## 2–4) Assumption audit + recommended replacement field

| File | Current assumption encoded by `lakeMask` usage | Should this instead derive from `waterDepth`? | Preferred consumer field(s) |
|---|---|---|---|
| `src/io/write-outputs.ts` | Tile payload carries binary “lake tile” bit independent of continuous depth output. | **Yes**, for hydrology semantics. Keep legacy field only as compatibility shim derived from `waterDepth > 0`. | **Primary:** `waterDepth`; **plus:** `waterSurfaceH`, `lakeBasinId`; use `waterClass` for categorical labeling. |
| `src/app/run-generator.ts` | Same as above for main envelope output. | **Yes** (same rationale). | **Primary:** `waterDepth`; **plus:** `waterSurfaceH`, `lakeBasinId`; `waterClass` for class. |
| `src/app/run-hydrology-inspector.ts` (artifact/envelope ingest) | Inspector expects `lakeMask` may be present in prior artifacts/envelopes. | **Partially**: ingestion can remain tolerant, but internal semantics should prefer recompute from `waterDepth`/`waterSurfaceH` when available. | Ingest fallback: `lakeMask`; analysis/render/stats: **`waterDepth` + `waterSurfaceH`**, optionally `waterClass` for class overlays. |
| `src/app/run-hydrology-inspector.ts` (stats gate) | “Lake tile count/depth stats should only include `lakeMask==1` tiles.” | **Yes**. This is exactly binary gating that can drift from continuous model intent. | For “standing water tiles”: `waterDepth > 0`; for “water-governed tiles”: `lakeBasinId != null` or `waterSurfaceH` present; for category counts: `waterClass`. |
| Tests asserting schema presence (`cli-command-wiring`, `read-envelope`) | `lakeMask` is part of required/expected payload contract. | **Eventually yes**, but this is contract migration work (not semantics itself). | Replace/augment with assertions around `waterDepth`/`waterSurfaceH` and `lakeBasinId`; keep `waterClass` assertion for classification contract. |
| Tests asserting semantic nuance (`hydrology-debug-artifacts`, `derive-hydrology`) | `lakeMask` can be false while basin-governed water surface/depth exists. | These tests already support the **waterDepth-first** model; keep intent, de-emphasize mask dependency. | Assert directly on `waterDepth` sign and `waterSurfaceH` presence under `lakeBasinId`, optionally `waterClass`. |
| `src/pipeline/derive-hydrology.ts` | `lakeMask` is derived as `depth > 0` (positive standing water only). | Derivation is already from depth logic; removal path is to avoid downstream dependence on this redundant projection. | Downstream should consume `waterDepth`; keep `waterClass` for explicit category. |
| `src/domain/hydrology.ts` | Storage-level contract includes `lakeMask` array. | N/A (structural type). | Migration target: remove array after consumers switch to `waterDepth`/`waterSurfaceH`/`lakeBasinId`/`waterClass`. |

---

## Safe removal plan (no semantic drift)

1. **Define equivalence invariant before removal:** legacy `lakeMask` semantics == `(waterDepth > 0)` wherever both exist. (This matches current producer logic.)【F:src/pipeline/derive-hydrology.ts†L455-L463】【F:docs/normative/water-depth-model.md†L65-L77】  
2. **Switch consumers first, field removal last:**  
   - Inspector stats to `waterDepth`/`waterClass` gates.  
   - Output/read paths keep backward-compatible read/write temporarily.  
3. **Migrate tests from field-presence to behavior:** assert standing water via `waterDepth > 0`, governed tiles via `waterSurfaceH`/`lakeBasinId`.  
4. **Only after parity is proven, drop `lakeMask` from maps/types/output contracts.**

---

## What Remains False

- `lakeMask` is still a live runtime/output contract in generator and write paths, so safe removal is **not yet true** today.【F:src/app/run-generator.ts†L221-L231】【F:src/io/write-outputs.ts†L106-L122】  
- Inspector metrics still count lakes by `lakeMask` rather than directly by `waterDepth`/`waterClass`.【F:src/app/run-hydrology-inspector.ts†L849-L857】  
- Multiple tests still require `lakeMask` schema presence, so removal would currently break contract tests before semantic migration is complete.【F:test/integration/cli-command-wiring.test.mjs†L277-L284】【F:test/integration/cli-command-wiring.test.mjs†L564-L571】  

No code was modified.

<PREVIOUS_PR_TITLE>
Hydrology inspector: derive standing-water stats from waterDepth/waterSurface and add lakeMask removal audit
</PREVIOUS_PR_TITLE>

<PREVIOUS_PR_DESCRIPTION>
### Motivation

- Move downstream logic away from the binary `lakeMask` projection toward the continuous `waterDepth`/`waterSurfaceH` and categorical `waterClass` signals to avoid semantic drift. 
- Provide a repository-level audit documenting every consumer of `lakeMask` and a safe removal plan. 
- Surface new hydrology diagnostics (standing-water, governed, subsurface influence, and `waterClass` counts) in the inspector to enable migration and validation.

### Description

- Added `docs/lakeMask-removal-audit.md` with a repository-wide usage audit and a safe removal plan for `lakeMask`.
- Extended `src/app/run-hydrology-inspector.ts` to track `tileWaterDepth`, `tileHasWaterDepth`, and `tileHasWaterSurface`, to read `waterDepth`/`waterSurfaceH` from envelopes and debug artifacts, and to populate these when hydrology is recomputed from `deriveHydrology`.
- Introduced `resolveTileWaterDepth` to compute depth from either explicit `waterDepth` or `waterSurfaceH - h`, and refactored `computeStats` to count `standingSurfaceWaterTileCount`, `waterGovernedTileCount`, `subsurfaceInfluenceTileCount`, and `waterClassCounts` instead of relying on `maps.lakeMask`.
- Updated integration tests in `test/integration/hydrology-inspector-cli-wiring.test.mjs` to assert the new stats and the authoritative behavior of `waterDepth` over `lakeMask`, and applied minor test formatting/import tidy-ups.

### Testing

- Ran the hydrology-inspector integration test suite (`vitest` integration tests) which includes `test/integration/hydrology-inspector-cli-wiring.test.mjs`, and the modified tests passed. 
- Recomputed-path tests that exercise `deriveHydrology` and inspector recompute logic were executed and passed, validating `tileWaterDepth` derivation and the new stats aggregation. 
- No other automated tests were changed; existing unit/integration suites covering hydrology reading and recompute continued to pass after the changes.
</PREVIOUS_PR_DESCRIPTION>
