# Forest Terrain Generator

Procedurally generate forest data.

The *Forest Terrain Generator* is a deterministic terrain synthesis engine for producing complete, machine-readable, procedurally generated forest landscapes. Given a seed, dimensions, and a parameter set defined by the normative specification, it generates a rectangular grid of tiles and derives a coherent physical model of that region: elevation, slope, landform, hydrology, moisture, biome classification, vegetation structure, ground conditions, roughness features, visibility, and movement semantics.

The output is a versioned JSON dataset whose `tiles` array contains one fully described record per coordinate. Each tile represents a physically consistent location within a forest environment, including both environmental attributes and navigation-related properties. The result is not prose or rendered content, but a structured terrain model designed to be deterministic, reproducible, and suitable for downstream systems that require spatially coherent forest data.
An optional post-processing CLI can attach deterministic prose descriptions per tile.

## Project Purpose

This repository's deliverable is a CLI that implements the forest terrain generation spec; the CLI outputs either a single file path or an output directory for multi-artifact modes (for example, debug).

## Documentation

- Specification: [docs/normative/ForestTerrainGeneration.md](docs/normative/ForestTerrainGeneration.md)
- Implementation plan & checklist: [docs/ImplementationPlanChecklist.md](docs/ImplementationPlanChecklist.md)
- Repository policy and scaffold guidance: [docs/drafts/ImplementationPlan.md](docs/drafts/ImplementationPlan.md)
- Agent collaboration policy: [AGENTS.md](AGENTS.md)

```bash
node --import tsx src/cli/main.ts generate --params params.json --output-file out.json
```

```bash
node --import tsx src/cli/describe.ts --input-file forest.json --output-file out.json
```

## Roadmap

- consider implications of adding landform `peak` to spec
- consider implications of 'flat' landform aspect being explicitly indeterminate
  - Data contract change: aspectDeg may need nullable/sentinel semantics (null, omitted, or enum).
  - Consumer impact: any downstream system assuming numeric heading must handle “no direction.”
  - Test/golden impact: snapshots and assertions must branch on slope/flatness.
  - Back-compat impact: existing outputs with numeric 0 for flats would differ from future spec behavior.
  - UX/docs impact: clarify that flat tiles have no downhill heading.

## CLI Summary

Commands:

- `generate`: Generate terrain and write envelope JSON to `--output-file`.
- `derive`: Derive terrain from authored maps (requires `--map-h`) and write envelope JSON to `--output-file`.
- `debug`: Emit debug artifacts to `--output-dir` from either generation inputs or an existing envelope `--input-file`; optionally also write envelope JSON to `--debug-output-file`.
- `describe`: Read an existing envelope from `--input-file`, write a copied envelope to `--output-file`, and attach a `description` field to each tile.

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

Path resolution:

- Relative paths passed directly on CLI are resolved from the current working directory.
- Relative paths inside a params file are resolved from that params file's directory.

Mode/output validation highlights:

- In `debug`, using `--output-file` is rejected with the hint: `You might mean --debug-output-file.`
- In `debug`, `--input-file` cannot be combined with generation inputs (`--seed`, `--width`, `--height`, `--params`, `--map-h`, `--map-r`, `--map-v`).
- Existing output files/directories fail by default and require `--force` to overwrite/replace.

Describe output contract:

- Success per tile: `description` is a string.
- Failure per tile: `description` is `null` and `descriptionDebug` is emitted.
- With `--include-structured`, successful tiles also include `descriptionStructured` (`text` + sentence list). Each sentence includes `slot`, `text`, `contributors`, and `contributorKeys`; failed tiles set `descriptionStructured` to `null`.
- Current prose composition intentionally omits `directional` and `visibility` sentence slots while those components are being redesigned.
- By default, unknown `biome`/`landform` values use generic fallback prose.
- With `--strict`, no phrase fallback is allowed: unknown taxonomy is a per-tile failure (`descriptionDebug.code = "unknown_taxonomy"`), and any other missing selected phrase slot is also a per-tile failure (`descriptionDebug.code = "phrase_library_missing"`).

## Parameters

These parameters are read from `--params <path>` and merged over built-in defaults.
Guidance below assumes all other parameters stay the same.

### `grid`

| Parameter | What it controls | Raise it | Lower it |
| --- | --- | --- | --- |
| `grid.playableInset` | Non-playable border thickness around the map edge. | Larger blocked border, smaller playable area, fewer trail seeds/routes. | More playable area up to map edges. |

### `heightNoise`

| Parameter | What it controls | Raise it | Lower it |
| --- | --- | --- | --- |
| `heightNoise.octaves` | Number of Perlin octaves used for elevation (`H`). | More fine detail and higher compute cost. | Smoother broad shapes, lower compute cost. |
| `heightNoise.baseFrequency` | Starting spatial frequency for elevation noise. | Smaller, tighter terrain features. | Larger, broader hills/valleys. |
| `heightNoise.lacunarity` | Frequency multiplier per octave for elevation. | Faster shift to high-frequency detail. | Slower shift; gentler multiscale detail. |
| `heightNoise.persistence` | Amplitude retained per octave for elevation. | Stronger high-frequency contribution (rougher relief). | Weaker high-frequency contribution (smoother relief). |

### `roughnessNoise`

| Parameter | What it controls | Raise it | Lower it |
| --- | --- | --- | --- |
| `roughnessNoise.octaves` | Number of octaves for roughness map (`R`). | Richer obstruction texture, more compute cost. | Simpler roughness field. |
| `roughnessNoise.baseFrequency` | Starting frequency for roughness map. | Smaller-scale rough patches. | Larger-scale rough regions. |
| `roughnessNoise.lacunarity` | Frequency multiplier per roughness octave. | More high-frequency roughness variation. | Smoother roughness transitions. |
| `roughnessNoise.persistence` | Amplitude retained per roughness octave. | Stronger fine roughness variation. | Weaker fine variation. |

### `vegVarianceNoise`

| Parameter | What it controls | Raise it | Lower it |
| --- | --- | --- | --- |
| `vegVarianceNoise.octaves` | Number of octaves for vegetation-variance map (`V`). | More detailed biome/vegetation perturbation pattern. | Broader, smoother perturbation regions. |
| `vegVarianceNoise.baseFrequency` | Starting frequency for `V`. | Smaller vegetation patches. | Larger vegetation patches. |
| `vegVarianceNoise.lacunarity` | Frequency multiplier per `V` octave. | More fine patch boundaries. | Smoother boundaries. |
| `vegVarianceNoise.persistence` | Amplitude retained per `V` octave. | Stronger fine-scale patch variation. | More muted fine-scale variation. |
| `vegVarianceNoise.strength` | Strength of `V` perturbation on moisture during biome classification. | More biome mixing/patchiness around thresholds. | More biome stability from raw moisture alone. |

### `landform`

| Parameter | What it controls | Raise it | Lower it |
| --- | --- | --- | --- |
| `landform.eps` | Height-difference tolerance when comparing neighbors. | Fewer neighbors counted as higher/lower (less sensitive to tiny deltas). | More sensitivity to small elevation differences. |
| `landform.flatSlopeThreshold` | Slope cutoff for entering flat-landform branch. | More tiles treated as flat-ish for landform classification. | Fewer tiles treated as flat-ish. |

### `hydrology`

| Parameter | What it controls | Raise it | Lower it |
| --- | --- | --- | --- |
| `hydrology.minDropThreshold` | Minimum downhill drop needed to set flow direction. | More pits/`FD=NONE`, less connected drainage. | More tiles get a downhill flow direction. |
| `hydrology.tieEps` | Epsilon for “equal drop” ties and Dijkstra tie handling. | More ties resolved by deterministic tie-break hash/order. | Fewer ties; more strict max-drop selection. |
| `hydrology.streamAccumThreshold` | `FA_N` threshold for stream eligibility. | Fewer stream tiles. | More stream tiles. |
| `hydrology.streamMinSlopeThreshold` | Minimum slope required for stream tiles. | Suppresses low-slope streams. | Allows streams on gentler slopes. |
| `hydrology.lakeFlatSlopeThreshold` | Maximum slope for lake-candidate basins. | More flat basin tiles eligible for lakes. | Fewer lake candidates. |
| `hydrology.lakeAccumThreshold` | Minimum `FA_N` for lake candidates. | Harder to become lake. | Easier to become lake. |
| `hydrology.lakeGrowSteps` | Extra 4-way lake expansion depth from connected lake components (0 disables growth). | Larger/connected lakes; stronger stream suppression near lakes. | Smaller, stricter lake footprints. |
| `hydrology.lakeGrowHeightDelta` | Height band above component reference height allowed during lake growth. | Lakes can expand uphill more; easier coalescence. | Lakes stay tighter to basin bottoms. |
| `hydrology.moistureAccumStart` | `FA_N` point where accumulation-driven moisture begins ramping up. | Delays accumulation moisture effect (drier overall unless high `FA_N`). | Accumulation contributes earlier (wetter overall). |
| `hydrology.flatnessThreshold` | Slope threshold used in flatness moisture term. | More tiles receive flatness moisture boost. | Fewer tiles receive flatness boost. |
| `hydrology.waterProxMaxDist` | Distance cap/range for water-proximity moisture term. | Water proximity influence reaches farther. | Proximity moisture is more local/tight. |
| `hydrology.weights.accum` | Weight of accumulation moisture term. | Moisture follows drainage more strongly. | Drainage contributes less to moisture. |
| `hydrology.weights.flat` | Weight of flatness moisture term. | Flat areas get relatively wetter. | Flatness contributes less. |
| `hydrology.weights.prox` | Weight of water-proximity moisture term. | Near-water wetness effect increases. | Near-water effect decreases. |
| `hydrology.marshMoistureThreshold` | Moisture threshold for marsh classification. | Fewer marsh tiles. | More marsh tiles. |
| `hydrology.marshSlopeThreshold` | Slope cutoff for marsh classification. | Marsh allowed on steeper lowlands. | Marsh restricted to flatter areas. |

### `ground`

| Parameter | What it controls | Raise it | Lower it |
| --- | --- | --- | --- |
| `ground.peatMoistureThreshold` | Moisture needed for `peat` soil. | Fewer peat tiles. | More peat tiles. |
| `ground.standingWaterMoistureThreshold` | Moisture needed for `standing_water` flag. | Fewer standing-water flags. | More standing-water flags. |
| `ground.standingWaterSlopeMax` | Max slope allowed for standing water. | Standing water appears on steeper terrain. | Standing water limited to flatter terrain. |
| `ground.lichenMoistureMax` | Moisture ceiling for `lichen` flag. | More tiles qualify for lichen. | Fewer lichen tiles. |
| `ground.exposedSandMoistureMax` | Moisture ceiling for exposed sand conditions. | More sandy/exposed-sand outcomes. | Fewer sandy/exposed-sand outcomes. |
| `ground.bedrockHeightMin` | Elevation floor for bedrock-related checks. | Fewer bedrock flags (higher bar). | More bedrock flags (lower bar). |
| `ground.bedrockRoughnessMin` | Roughness floor for bedrock flag. | Fewer bedrock flags. | More bedrock flags. |

### `roughnessFeatures`

| Parameter | What it controls | Raise it | Lower it |
| --- | --- | --- | --- |
| `roughnessFeatures.obstructionMoistureMix` | Blend between roughness (`R`) and moisture for obstruction. | Obstruction tracks moisture more, roughness less. | Obstruction tracks roughness more, moisture less. |
| `roughnessFeatures.windthrowThreshold` | Obstruction threshold for `windthrow` flag. | Fewer windthrow flags. | More windthrow flags. |
| `roughnessFeatures.fallenLogThreshold` | Obstruction threshold for `fallen_log` flag. | Fewer fallen logs. | More fallen logs. |
| `roughnessFeatures.rootTangleMoistureThreshold` | Moisture threshold for `root_tangle` flag. | Fewer root tangles. | More root tangles. |
| `roughnessFeatures.boulderHeightMin` | Elevation floor for `boulder` flag. | Fewer boulder flags. | More boulder flags. |
| `roughnessFeatures.boulderRoughnessMin` | Roughness floor for `boulder` flag. | Fewer boulder flags. | More boulder flags. |

### `movement`

| Parameter | What it controls | Raise it | Lower it |
| --- | --- | --- | --- |
| `movement.steepBlockDelta` | Height delta threshold for blocked directional movement. | Fewer blocked uphill edges. | More blocked uphill edges. |
| `movement.steepDifficultDelta` | Height delta threshold for difficult (vs passable) movement. | Fewer difficult edges (more passable unless blocked). | More difficult edges. |
| `movement.cliffSlopeMin` | Local slope minimum for setting `CliffEdge` flag. | Fewer cliff-edge flags. | More cliff-edge flags. |
| `movement.moveCostObstructionMax` | Upper multiplier applied by obstruction to move cost. | Obstruction penalizes movement more. | Obstruction penalizes movement less. |
| `movement.moveCostMoistureMax` | Upper multiplier applied by moisture to move cost. | Wetness penalizes movement more. | Wetness penalizes movement less. |
| `movement.marshMoveCostMultiplier` | Additional multiplier for marsh tiles. | Marsh traversal gets costlier. | Marsh traversal gets cheaper. |
| `movement.openBogMoveCostMultiplier` | Additional multiplier for open-bog biome tiles. | Open-bog traversal gets costlier. | Open-bog traversal gets cheaper. |

### `visibility`

`visibility.*` follows the normative formula in Section 11 of the spec (`vis = base - penalties + elevation bonus`) and is planned-facing even if your current output contract does not consume every field yet.

| Parameter | What it controls | Raise it | Lower it |
| --- | --- | --- | --- |
| `visibility.base` | Baseline visibility distance (meters). | Raises visibility everywhere. | Lowers visibility everywhere. |
| `visibility.densityPenalty` | Tree-density penalty strength. | Dense vegetation reduces visibility more. | Dense vegetation reduces visibility less. |
| `visibility.obstructionPenalty` | Obstruction penalty strength. | Rough/obstructed terrain reduces visibility more. | Obstruction hurts visibility less. |
| `visibility.elevationBonus` | Elevation bonus strength from `H`. | High ground gains more visibility bonus. | Elevation contributes less bonus. |
| `visibility.minMeters` | Minimum visibility clamp. | Raises the floor (no extremely low visibility). | Allows lower minimum visibility. |
| `visibility.maxMeters` | Maximum visibility clamp. | Raises the ceiling for best-case visibility. | Lowers best-case visibility cap. |

### `orientation`

`orientation.*` follows the normative formula in Section 12 (informational in v1 and must not alter simulation outcomes).

| Parameter | What it controls | Raise it | Lower it |
| --- | --- | --- | --- |
| `orientation.min` | Lower clamp for orientation reliability. | Raises worst-case reliability floor. | Allows lower worst-case reliability. |
| `orientation.max` | Upper clamp for orientation reliability. | Raises best-case cap. | Lowers best-case cap. |
| `orientation.densityWeight` | Penalty weight from tree density. | Dense vegetation degrades orientation more. | Density penalizes less. |
| `orientation.obstructionWeight` | Penalty weight from obstruction. | Obstruction degrades orientation more. | Obstruction penalizes less. |
| `orientation.wetnessWeight` | Penalty weight from wetness term. | Wetness degrades orientation more. | Wetness penalizes less. |
| `orientation.wetnessStart` | Moisture point where wetness penalty begins. | Wetness penalty starts later (at wetter tiles). | Wetness penalty starts earlier. |
| `orientation.wetnessRange` | Moisture span used to ramp wetness penalty. | Gentler/wider ramp. | Sharper/faster ramp. |
| `orientation.ridgeBonus` | Bonus added on ridge landform tiles. | Ridges improve orientation reliability more. | Ridges improve it less. |

### `gameTrails`

| Parameter | What it controls | Raise it | Lower it |
| --- | --- | --- | --- |
| `gameTrails.diagWeight` | Extra multiplier for diagonal path steps in trail routing. | Trails avoid diagonals more (straighter cardinal routes). | Diagonals become relatively cheaper/more common. |
| `gameTrails.inf` | Cost sentinel for non-traversable tiles in trail routing. | Larger sentinel; harder to hit accidentally as finite cost. | More tiles may cross the non-traversable cutoff if costs get high. |
| `gameTrails.wSlope` | Slope penalty weight in trail preference cost field. | Trails avoid steep tiles more strongly. | Slope matters less to routing. |
| `gameTrails.slopeScale` | Scale at which slope penalty saturates. | Penalty ramps more gradually with slope. | Penalty ramps quickly at lower slopes. |
| `gameTrails.wMoist` | Moisture penalty weight in trail preference cost field. | Trails avoid wet tiles more strongly. | Moisture matters less. |
| `gameTrails.moistStart` | Moisture level where moisture penalty starts. | Penalty starts later (only wetter tiles). | Penalty starts earlier. |
| `gameTrails.wObs` | Obstruction penalty weight in trail preference cost field. | Trails avoid obstructed tiles more. | Obstruction matters less. |
| `gameTrails.wRidge` | Ridge preference magnitude (applied as a negative cost bonus on ridges). | Stronger ridge attraction. | Weaker ridge attraction. |
| `gameTrails.wStreamProx` | Bonus magnitude for being near streams. | Stronger stream-adjacency preference. | Weaker stream-adjacency preference. |
| `gameTrails.streamProxMaxDist` | Distance cap/range for stream proximity bonus. | Stream-proximity bonus extends farther. | Bonus becomes more local. |
| `gameTrails.wCross` | Extra cost for stream tiles while routing. | Trails cross streams less often. | Stream crossings become less discouraged. |
| `gameTrails.wMarsh` | Extra cost for marsh tiles while routing. | Trails avoid marsh more strongly. | Marsh penalty weakens. |
| `gameTrails.waterSeedMaxDist` | Distance cap/range in seed scoring for water proximity. | Seed scoring considers water proximity over a wider area. | Water-proximity seed bonus is more local. |
| `gameTrails.seedTilesPerTrail` | Controls seed count via `floor(playableArea / seedTilesPerTrail)`. | Fewer seeds/routes. | More seeds/routes. |
| `gameTrails.streamEndpointAccumThreshold` | `FA_N` threshold for stream endpoint candidates. | Fewer but stronger stream endpoints. | More stream endpoint candidates. |
| `gameTrails.ridgeEndpointMaxSlope` | Maximum slope for ridge endpoint candidates. | More ridge endpoint candidates. | Fewer ridge endpoint candidates. |
| `gameTrails.gameTrailMoveCostMultiplier` | Move-cost multiplier applied on tiles marked as game trails. | Trail benefit shrinks as value approaches `1` (and can become a penalty if >1). | Stronger move-cost reduction on trails (when <1). |

## Visualization

Create debug artifacts from an existing terrain envelope:

```bash
node --import tsx src/cli/main.ts debug --input-file forest.json --output-dir outdir
```

Generate browser-viewable SVG layers from debug artifacts:

```bash
npm run visualize:debug -- --input-dir outdir --output-dir out/visualizations --cell-size 10
```

Then open `out/visualizations/index.html`.

Outputs include layers for topography (`H`, `SlopeMag`), hydrology (`Moisture`, `WaterClass`), ecology (`Biome`, `TreeDensity`), and navigation (`MoveCost`, blocked-direction count).

## Authored Map From PNG

Convert a grayscale image into authored-map JSON compatible with `--map-h`:

```bash
bash scripts/png-to-authored-map.sh --input input.png --output map-h.json --expect-size 64x64
```

The script writes JSON with the required schema:
`{ "width": number, "height": number, "data": number[] }`
where `data` is row-major and normalized to `[0,1]`.

## Example tile

```json
{
  "id": "forest:42,17",
  "position": { "x": 42, "y": 17 },
  "topography": {
    "elevation": 0.63,
    "slopeMag": 0.08,
    "aspectDeg": 214,
    "landform": "slope"
  },
  "hydrology": {
    "flowDir": 3,
    "flowAccum": 87,
    "flowAccumN": 0.41,
    "moisture": 0.58,
    "waterClass": "none"
  },
  "vegetation": {
    "biome": "mixed_forest",
    "treeDensity": 0.59,
    "canopyCover": 0.62,
    "dominant": ["birch", "norway_spruce"]
  },
  "ground": {
    "soil": "sandy_till",
    "firmness": 0.72,
    "surfaceFlags": ["lichen"]
  },
  "roughness": {
    "obstruction": 0.36,
    "featureFlags": ["boulder"]
  },
  "visibility": {
    "baseMeters": 28
  },
  "navigation": {
    "moveCost": 1.12,
    "orientationReliability": 0.74,
    "followable": ["stream", "game_trail"],
    "passability": {
      "N": "blocked",
      "NE": "passable",
      "E": "difficult",
      "SE": "passable",
      "S": "passable",
      "SW": "blocked",
      "W": "passable",
      "NW": "passable"
    }
  }
}
```
