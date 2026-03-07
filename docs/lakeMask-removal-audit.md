## Scope & method

I read the repository-level instructions and the water-depth model, then searched for `lakeMask` usages with:

- `cat AGENTS.md && cat docs/water-depth-model.md`
- `rg -n "lakeMask|lake mask|lake_mask|lake-mask" .`
- `rg -n "lakeMask" src test scripts README.md docs -g '!**/*.json'`
- targeted `nl -ba ... | sed -n ...` on each matching source/test/script file.

Per the model, `waterDepth` is the continuous source for tile water state and can be positive/zero/negative; `waterSurfaceH` is basin-level truth; basin membership alone must not imply standing water. `lakeMask` is binary and therefore not the primary hydrologic variable for semantics-preserving decisions.【F:docs/water-depth-model.md†L53-L77】【F:docs/water-depth-model.md†L127-L131】【F:docs/water-depth-model.md†L157-L181】

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

6. **`scripts/sweep-wetness.sh`**  
   Counts lake tiles as `tile.hydrology.lakeMask === true`.【F:scripts/sweep-wetness.sh†L208-L223】

7. **`test/integration/hydrology-debug-artifacts.test.mjs`**  
   Explicitly depends on `lakeMask === false` while `waterSurfaceH` exists (subsurface/negative depth behavior).【F:test/integration/hydrology-debug-artifacts.test.mjs†L192-L218】

8. **`test/integration/cli-command-wiring.test.mjs`**  
   Requires `lakeMask` to exist and be boolean in generated/replay payload schema checks.【F:test/integration/cli-command-wiring.test.mjs†L277-L284】【F:test/integration/cli-command-wiring.test.mjs†L564-L571】

9. **`test/unit/read-envelope.test.mjs`**  
   Fixture includes `hydrology.lakeMask` in valid tile shape.【F:test/unit/read-envelope.test.mjs†L20-L29】

10. **`test/unit/derive-hydrology.test.mjs`**  
    Asserts tile can have `waterSurfaceH` with `lakeMask===0` (depth non-positive case).【F:test/unit/derive-hydrology.test.mjs†L221-L224】

11. **`test/unit/lake-determinism.test.mjs`**  
    Asserts deterministic equality of `maps.lakeMask` across runs.【F:test/unit/lake-determinism.test.mjs†L78-L80】

---

## 2–4) Assumption audit + recommended replacement field

| File | Current assumption encoded by `lakeMask` usage | Should this instead derive from `waterDepth`? | Preferred consumer field(s) |
|---|---|---|---|
| `src/io/write-outputs.ts` | Tile payload carries binary “lake tile” bit independent of continuous depth output. | **Yes**, for hydrology semantics. Keep legacy field only as compatibility shim derived from `waterDepth > 0`. | **Primary:** `waterDepth`; **plus:** `waterSurfaceH`, `lakeBasinId`; use `waterClass` for categorical labeling. |
| `src/app/run-generator.ts` | Same as above for main envelope output. | **Yes** (same rationale). | **Primary:** `waterDepth`; **plus:** `waterSurfaceH`, `lakeBasinId`; `waterClass` for class. |
| `src/app/run-hydrology-inspector.ts` (artifact/envelope ingest) | Inspector expects `lakeMask` may be present in prior artifacts/envelopes. | **Partially**: ingestion can remain tolerant, but internal semantics should prefer recompute from `waterDepth`/`waterSurfaceH` when available. | Ingest fallback: `lakeMask`; analysis/render/stats: **`waterDepth` + `waterSurfaceH`**, optionally `waterClass` for class overlays. |
| `src/app/run-hydrology-inspector.ts` (stats gate) | “Lake tile count/depth stats should only include `lakeMask==1` tiles.” | **Yes**. This is exactly binary gating that can drift from continuous model intent. | For “standing water tiles”: `waterDepth > 0`; for “water-governed tiles”: `lakeBasinId != null` or `waterSurfaceH` present; for category counts: `waterClass`. |
| `scripts/sweep-wetness.sh` | Sweep metric “lakeTiles” is binary mask count. | **Yes**, if goal is hydrology-consistent wetness tracking. | Prefer `waterDepth > 0` (standing water area) and optionally a second metric from `waterClass==lake`. |
| Tests asserting schema presence (`cli-command-wiring`, `read-envelope`) | `lakeMask` is part of required/expected payload contract. | **Eventually yes**, but this is contract migration work (not semantics itself). | Replace/augment with assertions around `waterDepth`/`waterSurfaceH` and `lakeBasinId`; keep `waterClass` assertion for classification contract. |
| Tests asserting semantic nuance (`hydrology-debug-artifacts`, `derive-hydrology`) | `lakeMask` can be false while basin-governed water surface/depth exists. | These tests already support the **waterDepth-first** model; keep intent, de-emphasize mask dependency. | Assert directly on `waterDepth` sign and `waterSurfaceH` presence under `lakeBasinId`, optionally `waterClass`. |
| `src/pipeline/derive-hydrology.ts` | `lakeMask` is derived as `depth > 0` (positive standing water only). | Derivation is already from depth logic; removal path is to avoid downstream dependence on this redundant projection. | Downstream should consume `waterDepth`; keep `waterClass` for explicit category. |
| `src/domain/hydrology.ts` | Storage-level contract includes `lakeMask` array. | N/A (structural type). | Migration target: remove array after consumers switch to `waterDepth`/`waterSurfaceH`/`lakeBasinId`/`waterClass`. |

---

## Safe removal plan (no semantic drift)

1. **Define equivalence invariant before removal:** legacy `lakeMask` semantics == `(waterDepth > 0)` wherever both exist. (This matches current producer logic.)【F:src/pipeline/derive-hydrology.ts†L455-L463】【F:docs/water-depth-model.md†L65-L77】  
2. **Switch consumers first, field removal last:**  
   - Inspector stats/sweep metrics to `waterDepth`/`waterClass` gates.  
   - Output/read paths keep backward-compatible read/write temporarily.  
3. **Migrate tests from field-presence to behavior:** assert standing water via `waterDepth > 0`, governed tiles via `waterSurfaceH`/`lakeBasinId`.  
4. **Only after parity is proven, drop `lakeMask` from maps/types/output contracts.**

---

## What Remains False

- `lakeMask` is still a live runtime/output contract in generator and write paths, so safe removal is **not yet true** today.【F:src/app/run-generator.ts†L221-L231】【F:src/io/write-outputs.ts†L106-L122】  
- Inspector and sweep metrics still count lakes by `lakeMask` rather than directly by `waterDepth`/`waterClass`.【F:src/app/run-hydrology-inspector.ts†L849-L857】【F:scripts/sweep-wetness.sh†L208-L223】  
- Multiple tests still require `lakeMask` schema presence, so removal would currently break contract tests before semantic migration is complete.【F:test/integration/cli-command-wiring.test.mjs†L277-L284】【F:test/integration/cli-command-wiring.test.mjs†L564-L571】  

No code was modified.
