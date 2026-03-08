# Wilderness Terrain Generator

The **Wilderness Terrain Generator** produces coherent, grounded descriptions of wilderness locations. Its goal is to generate terrain that can be described naturally and consistently, using deterministic models of landscape structure.

The system builds a structured model of terrain from a seed, grid size, and parameter set. It derives elevation, slopes, basins, ridges, hydrology, biome patterns, vegetation structure, and other environmental signals for each tile in a generated region. These layers act as authoritative “truth” about the landscape.

From that model, the generator produces natural-language descriptions that reflect the terrain’s topology, hydrology, and surrounding context.

The result is a versioned JSON dataset in which each tile represents a coherent location within the wilderness environment. Because the generation process is deterministic, the same seed always produces the same terrain and the same location descriptions, allowing downstream systems to rely on stable spatial structure.

## Terrain Truth Layers

The Wilderness Terrain Generator builds several structural layers that together describe a landscape.  
These layers exist to support coherent wilderness location descriptions.

**Basin hydrology**  
Models drainage systems and water surfaces. Basin topology determines where water collects, how basins connect, and how surface water depth relates to terrain elevation.

**Peak and ridge topology**  
Models the complementary system of hilltops, ridgelines, and crest structures. This layer describes the high points and ridge systems of the terrain independently of hydrology.

**Tile terrain metrics**  
Each tile records local physical properties such as elevation, slope, vegetation density, roughness, and visibility. These describe the immediate ground conditions at that location.

**Description facts**  
A normalization layer converts terrain truth into structured “location facts.” These facts feed the description engine, which produces deterministic wilderness location descriptions for each tile.

Together, these layers provide a consistent model of terrain that can be used to generate natural-language descriptions, navigation cues, and other spatial interpretations of the landscape.

```bash
node --import tsx src/cli/main.ts generate --params params.json --seed 42 --width 32 --height 32 --output-file wilderness.json
```

## CLI Summary

Commands:

- `generate`: Generate terrain and write envelope JSON to `--output-file`.
- `derive`: Derive terrain from authored maps (requires `--map-h`) and write envelope JSON to `--output-file`.
- `debug`: Emit debug artifacts to `--output-dir` from either generation inputs or an existing envelope `--input-file`; optionally also write envelope JSON to `--debug-output-file`.
- `describe` (separate CLI): Read an existing envelope from `--input-file`, write a copied envelope to `--output-file`, and attach a `description` field to each tile.
- `see`: Render a grayscale topography image from an existing envelope (`topography.h` by default) to `--output-file` (PGM).

## Other CLIs

The `describe` command intentionally remains a separate CLI (`src/cli/describe.ts`) in the current phase.

Long-term developer/debug CLIs:

- `hydrology-inspector`: Inspect hydrology maps via stats and visualization outputs (`fa`, `fd`, `fa-normalized`, `carry-over`, `hydrology`) from an envelope/debug dir.
- `map`: Render terrain envelope layers as PGM maps for debugging.
- `stream`: Trace stream routing paths from a source tile.
- `los`: Check line-of-sight visibility between two tile coordinates.
- `assign-regions`: Attach deterministic biome region IDs to an existing envelope.

Example:

```bash
node --import tsx src/cli/hydrology-inspector.ts --input-json wilderness.json --debug-dir out --viz all --stats --force
```

Canonical flags:

- `--params <path>`
- `--input-file <path>` (debug/describe; terrain envelope JSON source)
- `--map-h <path>`, `--map-r <path>`, `--map-v <path>`
- `--output-file <path>` (generate/derive only)
- `--output-dir <path>` (debug only)
- `--debug-output-file <path>` (debug optional)
- `--force`
- `--include-structured` (describe only; adds `descriptionStructured` with `text` and sentence slots)
- `--strict` (describe only; disables phrase fallbacks and fails per-tile when any selected phrase slot has no candidates)
- `--layer <h|r|v|landforms>` (see only; defaults to `h`)
- `--landforms` / `--landscape` (see only; shortcut to render landform classes)

Path resolution:

- Relative paths passed directly on CLI are resolved from the current working directory.
- Relative paths inside a params file are resolved from that params file's directory.

Mode/output validation highlights:

- In `debug`, using `--output-file` is rejected with the hint: `You might mean --debug-output-file.`
- In `generate` and `derive`, envelope tiles include computed `hydrology` alongside `topography`.
- In `debug`, `--input-file` cannot be combined with generation inputs (`--seed`, `--width`, `--height`, `--map-h`, `--map-r`, `--map-v`).
- In `debug --input-file`, replay recompute param precedence is:
  `defaults < envelope paramOverrides < --params <file>`.
- In `debug --input-file`, replay recompute derives topographic structure + hydrology from tile `topography.h`; envelope `features`, tile `featureIds`, and tile `hydrology` are ignored as replay inputs.
- In `debug --input-file`, `--debug-output-file` writes the recomputed replay envelope (recomputed `features`, tile memberships, tile hydrology, and effective `paramOverrides` delta).
- In `debug --input-file` with `--params <file>`, CLI emits a replay warning to `stderr` noting active override precedence.
- Replay-grid validation for both `debug --input-file` and hydrology-inspector recompute includes an allocation cap guard; pathological coordinates that imply oversized replay grids fail fast with input-validation errors before map allocation.
- In `hydrology-inspector` recompute mode, effective hydrology params follow `defaults < envelope paramOverrides < explicit --sink-mode` (sink-mode override only), and recompute uses the full effective hydrology param block (for parity with debug replay hydrology behavior).
- In `hydrology-inspector` recompute mode, tile geometry must be a dense rectangular grid with finite tile `topography.h`; sparse coverage, duplicate coordinates, or missing/invalid `topography.h` fail fast with input-validation errors.
- Existing output files/directories fail by default and require `--force` to overwrite/replace.

```bash
node --import tsx src/cli/main.ts debug --input-file wilderness.json --output-dir outdir
```

Render topography as grayscale image (`h:0` black, `h:1` white):

```bash
node --import tsx src/cli/main.ts see --input-file out.json --output-file h.pgm
```

Render landform classes as uniform grayscale:

```bash
node --import tsx src/cli/main.ts see --input-file out.json --output-file landforms.pgm --landforms
```

Landform grayscale mapping (derived from tile feature IDs):

- basin-only (`activeFeatureIds`/`featureIds` contains `b_*` but not `p_*`) -> `64`
- peak-only (`activeFeatureIds`/`featureIds` contains `p_*` but not `b_*`) -> `224`
- neither basin nor peak -> `128`
- both basin and peak -> `160`

## Authored Map From PNG

Convert a grayscale image into authored-map JSON compatible with `--map-h`:

```bash
bash scripts/png-to-authored-map.sh --input input.png --output map-h.json --expect-size 64x64
```

The script writes JSON with the required schema:
`{ "width": number, "height": number, "data": number[] }`
where `data` is row-major and normalized to `[0,1]`.

## Noise

- `octaves` is how many layers of noise are stacked. Low values create broad, simple terrain; higher values add smaller details on top.
- `baseFrequency` is an indication of how much detail or variety the output has. Low values for 1 or 2 major features, higher values for many features.
- `lacunarity` is a measure of "smoothness" or blurriness. Low values for smooth hills, high values for a more pixelated, "stepped" look.
- `persistence` controls how strongly each smaller octave contributes. Low values keep terrain smoother and dominated by large shapes; high values make fine detail more prominent.

All three noise maps (`heightNoise`, `roughnessNoise`, `vegVarianceNoise`) also support *normalization*, which is a post-processing remap that stretches map values into a fuller, more useful range (usually `[0,1]`) after noise is generated:

- `normalize.enabled` turns post-generation remapping on/off.
  - `normalize.mode` chooses remap strategy (`minmax` or `quantile`).
    - `minmax` stretches current map min/max to `[0,1]`.
    - `quantile` stretches between `lowerQ` and `upperQ` (more robust against outliers).
      - `normalize.lowerQ` and `normalize.upperQ` set quantile bounds when mode is `quantile` (for example `0.02` and `0.98`).

## Noise Maps

- `heightNoise` controls `topography.h` (elevation). `0` is lowest (black in grayscale), `1` is highest (white).
- `roughnessNoise` controls `topography.r` (terrain roughness signal). Low values are smoother ground; high values are rougher, more broken ground.
- `vegVarianceNoise` controls `topography.v` (vegetation variance signal). It is a stable variation map used to create patchiness instead of uniform vegetation everywhere.

## Envelope Param Overrides

Generated/derived envelopes may include top-level `paramOverrides` with only non-default parameter values. This is used for replay/debug context (especially `debug --input-file` structure+hydrology recompute).

## Topography Structure

`topography.structure` controls structural basin/peak labeling:

- `enabled` turns structure derivation on/off.
- `connectivity` chooses neighborhood mode (currently `dir8`).
- `hEps` groups near-equal heights in sweep passes.
- `persistenceMin` is the minimum persistence to mark `basinLike`/`ridgeLike`.
- `unresolvedPolicy` controls unresolved spill handling (`nan` or `max_h`).

## Hydrology Lake Fill

`hydrology.lakeFill` controls basin fill classification before overflow-guided routing:

- `wetnessScale` is the global fill calibration factor (default `1.0`).
  - higher values fill/overflow more basins
  - lower values leave more basins as sinks

Inflow accounting uses strict-local `FD/FA` as a fixed basis, then applies basin accounting:

- `externalInflow`: sum of boundary FD crossings into basin tile set
- `totalInflow`: `externalInflow + child overflowExcess`
- `spillCapacity`: `sum(max(0, mergeH - h(tile)))`
- `fillRatio`: `(wetnessScale * totalInflow) / spillCapacity`
- basin role:
  - `sink`
  - `overflow_carrier` (routes via `childSpillFromTileId -> parentContactTileId`)
  - `terminal_lake` (filled root/no parent spill edge)

Debug hydrology outputs (`debug/hydrology.json`) include:

- `lakeAccounting.basins` (per-basin accounting + role)
- per-tile hydrology fields:
  - `fd`, `fa`, `faN`, `isStream`
  - `lakeMask`, `waterClass`, `lakeBasinId`
  - `waterSurfaceH` (present on wet/lake tiles)
  - `waterDepth` (present when `waterSurfaceH` is present)

## Wetness Sweep Workflow

Run a replay sweep over `hydrology.lakeFill.wetnessScale` (`k`) and collect basin/lake summary metrics:

```bash
bash scripts/sweep-wetness.sh --seed 1187 --width 128 --height 128 --force
```

By default, outputs are written under `<project-root>/out/wetness-sweep`.

Or replay from an existing envelope:

```bash
bash scripts/sweep-wetness.sh --base-envelope runs/base/terrain.json --k-values "0.03 0.1 0.3 1.0" --force
```

Outputs:

- per-k debug artifacts: `<runs-dir>/k-<k>/debug/*`
- per-k replay envelope: `<runs-dir>/k-<k>/replay.json`
- summary table: `<runs-dir>/summary.tsv`

`summary.tsv` columns:

- `k`, `basinTotal`, `sink`, `overflowCarrier`, `terminalLake`
- `fillZero`, `fillPartial`, `fillFull`
- `lakeTiles`, `streamTiles`, `fillFractionMean`

## Feature Trees

Generated envelopes now include top-level structural feature trees:

- `features.basins`
- `features.peaks`

Each feature node includes:

- `id` (`b_#####` or `p_#####`)
- `kind` (`leaf` or `composite`)
- `parentId`
- `childIds`
- `waterSurfaceH` (basins only; present when basin-level water surface is available)
- `birthH`
- `mergeH` (`null` when unresolved in-map)
- `persistence`
- `minH`
- `maxH`
- `size`
- `bbox`

Tile membership:

- each tile includes `featureIds` (leaf basin + leaf peak IDs)
- each tile includes `activeFeatureIds` (composite IDs selected by persistence cut)

Storage rules:

- leaf nodes include `tileIds`
- composite nodes do not include `tileIds`
