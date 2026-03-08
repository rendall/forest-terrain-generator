# Wilderness Terrain Generator

The **Wilderness Terrain Generator** exists to produce coherent, grounded wilderness location descriptions as its primary product. Terrain generation, hydrology, biome modeling, and feature analysis are supporting truth layers whose purpose is to feed deterministic, high-quality description and spatial orientation, rather than being ends in themselves.

The system builds a structured, machine-readable model of a wilderness landscape from a seed, grid size, and parameter set. It derives the large-scale structure of the terrain, models water behavior, assigns ecological context, and records local tile conditions. From these layers it produces deterministic location descriptions that reflect both the immediate surroundings and the broader landscape context.

The result is a versioned JSON dataset in which each tile represents a coherent location within the generated wilderness. Because the generation process is deterministic, the same seed always produces the same terrain and the same location descriptions, allowing downstream systems to rely on stable spatial structure.

## Terrain Interpretation Pipeline

The Wilderness Terrain Generator builds a landscape in stages. Each stage adds a layer of meaning that supports coherent wilderness location descriptions.

**Topology**  
The terrain is first analyzed as a topological system of basins, ridges, peaks, and connections. This identifies the fundamental structure of the landscape: valleys, hills, ridgelines, and drainage divides.

**Hydrology**  
Basin topology is used to derive water behavior. This determines drainage networks, basin water surfaces, and how water depth relates to terrain elevation.

**Biome and ecological context**  
Climate parameters and terrain conditions determine vegetation patterns and biome types across the landscape.

**Feature prominence**  
Large-scale terrain features such as valleys, lakes, ridgelines, and hilltops are analyzed to identify prominent landmarks. These support descriptions that refer to the broader environment, such as looking down toward a lake, across a valley, or toward a distant hilltop.

**Tile-level terrain facts**  
Each tile records local facts about the environment, including elevation, slope, hydrology, biome, vegetation density, roughness, visibility, and movement constraints.

**Location description generation**  
These facts are combined to produce deterministic wilderness location descriptions. The system can describe both immediate surroundings and the larger landscape context visible from that location.

```bash
node --import tsx src/cli/main.ts generate --params params.json --seed 42 --width 32 --height 32 --output-file wilderness.json
```

## CLI Summary

Commands:

- `generate`: Generate terrain truth layers and write an envelope JSON to `--output-file`.
- `derive`: Derive terrain truth layers from authored maps and write an envelope JSON to `--output-file`.
- `debug`: Emit debug artifacts from either generation inputs or an existing envelope; optionally also write a recomputed envelope JSON.
- `describe` (separate CLI): Read an existing envelope and attach deterministic wilderness location descriptions to each tile.
- `see`: Render grayscale debug views from an existing envelope.

## Other CLIs

The `describe` command intentionally remains a separate CLI (`src/cli/describe.ts`) in the current phase.

The following CLIs are long-term developer and debugging surfaces rather than the primary product:

- `hydrology-inspector`: Inspect and validate hydrology truth layers.
- `map`: Render terrain truth layers as PGM maps for debugging.
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
- In `debug --input-file`, `--debug-output-file` writes the recomputed replay envelope.
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

## Hydrology

Hydrology is one of the core terrain truth layers. Basin topology determines how water collects, connects, and produces basin-level and tile-level water state.

For the current hydrology model, output contracts, and debugging guidance, see:

- `docs/active/hydrology-handoff.md`

## Topology

The generator derives structural basin and peak/ridge topology from the terrain surface. These topological layers identify valleys, basins, hilltops, ridges, and drainage divides, and serve as upstream truth for hydrology, biome interpretation, feature prominence, and description generation.

## Noise

- `octaves` is how many layers of noise are stacked. Low values create broad, simple terrain; higher values add smaller details on top.
- `baseFrequency` indicates how much detail or variation appears in the output.
- `lacunarity` controls how rapidly detail frequency increases between octaves.
- `persistence` controls how strongly each octave contributes relative to the previous.

All noise maps also support **normalization**, which remaps generated noise values into a useful range after generation.

## Noise Maps

- `heightNoise` controls elevation (`topography.h`).
- `roughnessNoise` controls terrain roughness (`topography.r`).
- `vegVarianceNoise` controls vegetation variance (`topography.v`).

## Feature Trees

Generated envelopes include structural feature trees:

- `features.basins`
- `features.peaks`

Each feature node includes:

- `id`
- `kind`
- `parentId`
- `childIds`
- `birthH`
- `mergeH`
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
