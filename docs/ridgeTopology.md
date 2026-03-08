# Ridge / Hilltop Typology Audit

Scope: current repository state on 2026-03-08.

Method note:
- `Code evidence` means directly traceable to current code/docs.
- `Inference` means interpretation where names/intent are not explicitly codified.

## 1. Intended conceptual model

### 1.1 What the model appears to represent
- `Code evidence`: The structure system is designed as dual trees for basins and peaks (`features.basins`, `features.peaks`) with non-collapsing identities and parent/child merges (`docs/archive/NonCollapsing-Structure-Identity-Discussion.md`, `README.md`, `src/pipeline/derive-topographic-structure.ts`).
- `Inference`: For ridge semantics, the peak-side tree is intended to encode hill systems at multiple scales: local maxima (hilltops) and merged crest/ridge systems.

### 1.2 Nodes/features in the intended ridge model
- `Code evidence`: Feature node contract includes `id`, `kind` (`leaf|composite`), `parentId`, `childIds`, `birthH`, `mergeH`, `persistence`, `size`, `bbox`, optional `tileIds` (`src/domain/topographic-features.ts`).
- `Inference`: A `leaf` peak node corresponds to a local hilltop/maximum; a `composite` peak node corresponds to a higher-order merged ridge/hill complex.

### 1.3 What counts as ridge / crest / hilltop / peak
- `Code evidence`: Peak derivation is descending-height DSU with saddle merge recording (`derivePeakStructure`, `unionPeakRoots`, `buildPeakFeatureTree`).
- `Code evidence`: Peak leaf tile membership is trimmed to tiles above first merge saddle (`trimLeafNodesAtFirstMerge` with `isBasin=false`).
- `Inference`: In current semantics, “hilltop/crest core” is best approximated by peak leaf `tileIds`; “ridge-like” is a persistence-threshold classifier, not a direct topological object.

### 1.4 Parallel to basins or loosely analogous?
- `Code evidence`: Both sides share a tree schema and sweep/merge mechanics.
- `Code evidence`: Basin side has explicit spill/contact edge fields and downstream hydrology consumers; peak side does not.
- `Inference`: The model is structurally parallel in representation goals, but operationally only loosely analogous in current implementation.

### 1.5 Topological vs heuristic vs rendering-oriented
- Topological (`Code evidence`): `features.peaks` parent/child graph, leaf/composite IDs, `birthH/mergeH`.
- Heuristic (`Code evidence`): `ridgeLike` threshold on per-tile `peakPersistence` (`persistence >= persistenceMin`).
- Rendering-oriented (`Code evidence`): `see --landforms` classifies by presence of `b_*`/`p_*` IDs, with legacy fallback to `topography.structure` booleans.

## 2. Current implementation path

| File | Function(s) | Role | Inputs | Outputs | Type |
|---|---|---|---|---|---|
| `src/pipeline/derive-topographic-structure.ts` | `derivePeakStructure` | Core peak/ridge construction (descending sweep, merges, tile metrics) | `shape`, `h`, structure config | `peakMaxIdx/H`, `peakSaddleH`, `peakPersistence`, `peakRiseLike`, `ridgeLike`, peak feature/tile IDs | Core structure logic |
| `src/pipeline/derive-topographic-structure.ts` | `buildPeakFeatureTree` | Builds non-collapsing peak tree from merge events | peak labels, max heights, merge events, `hEps` | `nodes` + per-tile peak leaf IDs | Core structure logic |
| `src/pipeline/derive-topographic-structure.ts` | `unionPeakRoots`, `higherMaximumWins` | DSU winner/loser selection and saddle assignment | active roots, level, `hEps` | merged root + merge events | Core structure logic |
| `src/pipeline/derive-topographic-structure.ts` | `trimLeafNodesAtFirstMerge` | Restricts peak leaf tile sets to above first saddle | peak nodes, `h`, `hEps` | trimmed peak leaf `tileIds` | Core structure logic |
| `src/pipeline/derive-topographic-structure.ts` | `collectActiveCompositeIdsByTile` | Persistence-cut active composite selection | leaf IDs per tile, nodes, `persistenceMin` | `tileActiveFeatureIds` | Derived classification |
| `src/pipeline/derive-topographic-structure.ts` | `assignMergeToChild` | Shared merge/persistence setter for basin+peak nodes | node, merge level | node merge/persistence/spill fields | Core helper (shared) |
| `src/pipeline/derive-topographic-structure.ts` | `deriveTopographicStructure` | Combines basin + peak outputs into tile memberships | `shape`, `h`, params | final structure maps + feature IDs | Core orchestration |
| `src/pipeline/derive-topographic-structure.ts` | `buildBasinFeatureTree` | Basin-tree builder with trim/recompute path | basin labels + merge events | basin nodes + leaf membership | Stale/unused in current call graph |
| `src/domain/topography.ts` | `createTopographicStructureMaps` | Allocates structure arrays and feature-id containers | `shape` | initialized SoA maps | Core data model |
| `src/domain/topographic-features.ts` | `TopographicFeatureNode` type | Shared feature schema (basins+peaks) | n/a | node contract | Core schema |
| `src/io/read-params.ts` + `src/lib/default-params.ts` | `validateTopographyStructureParams`, defaults | Governs persistence threshold and sweep settings | params file/defaults | validated config | Core config |
| `src/app/run-generator.ts` | `runGenerator`, `buildReplayEnvelope` | Executes structure derivation and emits memberships/features | terrain `h`, params, optional replay envelope | envelope `features.peaks`, tile `featureIds`/`activeFeatureIds` | Output logic |
| `src/io/write-outputs.ts` | `buildTopographyDebugTiles`, `resolveTopographyFeatures` | Emits debug topography artifact with features and tile IDs | envelope + optional structure debug payload | `debug/topography.json` | Output logic |
| `src/app/run-see.ts` | `runSee` (landforms branch) | Classifies ridge/basin landform pixels from IDs/legacy fields | tile `activeFeatureIds`/`featureIds`/`topography.structure` | grayscale classes (64/128/160/224) | Consumer classification |
| `src/app/run-map.ts` | `runMap` (`structure-leaves`) | Renders basin/peak leaf presence map | `features.basins/peaks`, tile `featureIds` | binary-ish structure leaf visualization | Consumer logic |
| `src/app/run-describe.ts` + `src/pipeline/description.ts` | `buildTileSignals`, text rules | Narrative uses `topography.landform` + `navigation.followable` token `ridge` | envelope tile topography/navigation | text mentioning ridge/crest | Consumer logic (ambiguous source) |

## 3. Ridge source-of-truth candidates

| Candidate | Origin trace | Classification | Notes |
|---|---|---|---|
| `features.peaks[]` graph (`id`, `parentId`, `childIds`, `birthH`, `mergeH`) | `derivePeakStructure -> buildPeakFeatureTree` | Plausible source of truth | Best current topological structure artifact for hills/peak systems. |
| Peak leaf `tileIds` | `buildPeakFeatureTree -> trimLeafNodesAtFirstMerge` | Plausible source of truth | Represents crest/hilltop cores; intentionally sparse subset of map tiles. |
| Tile `featureIds` with `p_*` | `deriveTopographicStructure` from peak leaf membership | Derived convenience field | Fast tile lookup; lossy projection of full topology. |
| Tile `activeFeatureIds` with `p_*` | `collectActiveCompositeIdsByTile` from node persistence | Ambiguous (currently ineffective) | Intended persistence-cut composites; currently empty for peaks under default params. |
| `ridgeLike` (Uint8Array) | `derivePeakStructure`: `peakPersistence >= persistenceMin` | Derived convenience field | Heuristic threshold map; not externally emitted in normal outputs. |
| `peakMaxIdx/H`, `peakSaddleH`, `peakPersistence`, `peakRiseLike` arrays | `derivePeakStructure` | Ambiguous | Analytic metrics; internal, not contract-level source in envelope tiles. |
| `features.peaks[].persistence` | `assignMergeToChild` shared formula | Ambiguous / drifted | Computed as `max(0, mergeH - birthH)`; for peaks this collapses to `0` in current outputs. |
| `tile.topography.structure.ridgeLike` (legacy) | Old envelope shape, optional fallback in `runSee` | Stale / legacy | No longer emitted by generator/debug normal paths; may persist in replayed legacy files. |

Convenience-classifier backward traces (explicit):
- `runSee ridgeLike`:
  - `activeFeatureIds` path -> `collectActiveCompositeIdsByTile` -> parent node `persistence`.
  - `featureIds` path -> peak leaf IDs from `buildPeakFeatureTree` output.
  - fallback path -> legacy `topography.structure.ridgeLike` from input envelope.

## 4. Drift analysis

### 4.1 Where implementation is faithful
- `Code evidence`: Non-collapsing peak tree exists and is emitted (`features.peaks`, parent/child IDs).
- `Code evidence`: Deterministic ID/tie behavior exists (`makeFeatureId`, sorted IDs, deterministic sweep order).
- `Code evidence`: Peak leaves are saddle-trimmed, producing crest/hilltop cores.

### 4.2 Where implementation has drifted
- `Code evidence`: Basin and peak sides are no longer symmetric in node tile semantics.
  - Basins: every node (including composites) carries `tileIds`; tile IDs partition full map.
  - Peaks: only leaf nodes carry `tileIds`; composites do not.
- `Code evidence`: `buildBasinFeatureTree` exists but is unused; basin derivation follows a separate path (`deriveBasinStructure`).
- `Code evidence`: Shared `assignMergeToChild` persistence formula (`mergeH - birthH`) yields zero peak node persistence in practice (observed in current `forest.json`: all numeric peak node `persistence` values are `0`).
- `Code evidence`: README/storage contract says composite nodes do not include `tileIds`, but basin composites in current outputs do.

### 4.3 Where ridge semantics are replaced by weaker heuristics
- `Code evidence`: `ridgeLike` is thresholded per-tile persistence, not direct graph topology.
- `Code evidence`: `see --landforms` uses prefix checks on ID arrays (`startsWith("p_")`) instead of graph traversal/topology.
- `Code evidence`: `activeFeatureIds` currently fails to carry peak IDs under default params, so ridge rendering via active IDs can collapse.

### 4.4 Where consumers rely on stale output shape
- `Code evidence`: `runSee` still supports legacy `topography.structure` fallback (`structure?.ridgeLike`).
- `Code evidence`: Debug replay preserves arbitrary source `topography` fields via spread in `buildReplayEnvelope`, so stale `topography.structure` can survive recompute outputs.
- `Code evidence`: Legacy fixtures still carry `topography.structure` fields even though generator tests assert omission for current outputs.

Observed discrepancy snapshot from current workspace `forest.json` (`Code evidence`):
- Internal `ridgeLike` true tiles (recomputed): `289`
- Tiles with peak `featureIds` (`p_*`): `121`
- Tiles with peak `activeFeatureIds` (`p_*`): `0`
- Consequence: `see --landforms` active-first logic produces no ridge class on this envelope.

## 5. Relationship to basin construction

### 5.1 What is analogous
- `Code evidence`: Both use height sweeps + DSU merges + parent/child feature trees.
- `Code evidence`: Both expose `birthH`, `mergeH`, and `persistence` fields in shared node schema.
- `Inference`: Peak hierarchy is the closest structural analog to basin containment/hierarchy.

### 5.2 What is analogous to spill/connect structure, if anything
- `Code evidence`: Peaks have saddle merge levels (`mergeH`) but no explicit spill/contact edge routing fields in derivation logic.
- `Inference`: Saddle merge level is only a weak analog to basin spill level; there is no ridge-side routing/contact edge model.

### 5.3 What is not analogous (because ridge is non-hydrologic)
- `Code evidence`: No peak-side water retention, fill ratio, overflow excess, water-surface ownership, or downstream flow routing exists.
- `Code evidence`: Hydrology consumes only basin features/memberships (`deriveHydrology` filters `b_*`, uses `basinFeatures`).

### 5.4 Any hydrology-style assumptions imported into ridge logic
- `Code evidence`: Shared persistence formula in `assignMergeToChild` is basin-oriented (`mergeH - birthH`) and collapses peak-node persistence.
- `Code evidence`: Shared feature schema carries hydrology-oriented optional fields (`waterSurfaceH`, spill/contact fields) on peak nodes even though they are non-semantic for ridges.

## 6. Consumer impact

| Consumer | Ridge/hilltop signal used | Classification |
|---|---|---|
| `see --landforms` (`src/app/run-see.ts`) | `activeFeatureIds` first, then `featureIds`, then legacy `topography.structure` | Derived convenience; legacy fallback present; ambiguous authority |
| `map --layer structure-leaves` (`src/app/run-map.ts`) | `features.peaks` leaf nodes + tile `featureIds` fallback | True topology signal (leaf-level), with convenience fallback |
| Generator/debug envelope emission (`src/app/run-generator.ts`, `src/io/write-outputs.ts`) | Emits `features.peaks`, `featureIds`, `activeFeatureIds` | Producer of topology + convenience projections |
| Description/narrative (`src/app/run-describe.ts`, `src/pipeline/description.ts`) | Uses `topography.landform` and `navigation.followable` token `ridge` | Ambiguous; not wired to current ridge topology derivation |
| Hydrology/stream tooling (`derive-hydrology`, `run-stream`, `run-hydrology-inspector`) | Basin IDs/features only (`b_*`) | Basin-based proxy; not a ridge consumer |
| `scripts/visualize-debug.mjs` | Does not read ridge/peak feature topology | No ridge signal consumption |

Biome-related status (`Code evidence`): no in-repo biome derivation currently consumes peak/ridge topology directly; narrative uses provided biome labels but ridge semantics come from `topography.landform`/`followable` inputs.

## 7. Current risks

- No single externally authoritative ridge signal.
  - `Code evidence`: ridge-relevant info is split across `features.peaks`, `featureIds`, `activeFeatureIds`, internal `ridgeLike`, and legacy fallback fields.
- Rendered ridge visibility can silently collapse.
  - `Code evidence`: peak `activeFeatureIds` are empty under defaults in observed outputs; active-first landform rendering then emits no ridges.
- Basin/peak parallelism has drifted in data semantics.
  - `Code evidence`: basin composites carry own `tileIds` and full-map partition behavior; peak composites do not.
- Contract/docs mismatch increases consumer misinterpretation risk.
  - `Code evidence`: README storage rule (composite no `tileIds`) conflicts with current basin outputs.
- Legacy field fallback can resurrect stale semantics.
  - `Code evidence`: `runSee` fallback to `topography.structure` plus replay topography field passthrough.
- Shared basin-oriented helper can distort ridge metrics.
  - `Code evidence`: peak node persistence collapse via shared merge formula.

## 8. What remains ambiguous

- Whether peak node `persistence` is intended to be positive prominence-like (`birthH - mergeH`) or intentionally non-positive/unused.
- Whether `activeFeatureIds` is intended as the primary landform/ridge render signal in normal envelopes.
- Whether basin composite `tileIds` partition semantics are intentional hydrology support or accidental divergence from documented structure contract.
- Whether ridge semantics should be leaf-core only (current peak `tileIds`) or also include broader composite ridge systems in tile outputs.
- Whether replay outputs should preserve non-core `topography.*` fields (including legacy structure booleans) when recomputing structure.
- Whether `topography.landform`/`navigation.followable` are expected to be derived from current topology in this codebase or sourced externally.
