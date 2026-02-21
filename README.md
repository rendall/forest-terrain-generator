# Forest Terrain Generator

Procedurally generate forest data.

The *Forest Terrain Generator* is a deterministic terrain synthesis engine for producing complete, machine-readable, procedurally generated forest landscapes. Given a seed, dimensions, and a parameter set defined by the normative specification, it generates a rectangular grid of tiles and derives a coherent physical model of that region: elevation, slope, landform, hydrology, moisture, biome classification, vegetation structure, ground conditions, roughness features, visibility, and movement semantics.

The output is a versioned JSON dataset whose `tiles` array contains one fully described record per coordinate. Each tile represents a physically consistent location within a forest environment, including both environmental attributes and navigation-related properties. The result is not prose or rendered content, but a structured terrain model designed to be deterministic, reproducible, and suitable for downstream systems that require spatially coherent forest data.

## Project Purpose

This repository's deliverable is a CLI that implements the forest terrain generation spec; the CLI outputs either a single file path or an output directory for multi-artifact modes (for example, debug).

## Documentation

- Specification: [docs/normative/ForestTerrainGeneration.md](docs/normative/ForestTerrainGeneration.md)
- Implementation plan & checklist: [docs/ImplementationPlanChecklist.md](docs/ImplementationPlanChecklist.md)
- Repository policy and scaffold guidance: [docs/drafts/ImplementationPlan.md](docs/drafts/ImplementationPlan.md)
- Agent collaboration policy: [AGENTS.md](AGENTS.md)

## Roadmap

- consider implications of adding landform `peak` to spec

## CLI Summary

Commands:

- `generate`: Generate terrain and write envelope JSON to `--output-file`.
- `derive`: Derive terrain from authored maps (requires `--map-h`) and write envelope JSON to `--output-file`.
- `debug`: Emit debug artifacts to `--output-dir`; optionally also write envelope JSON to `--debug-output-file`.

Canonical flags:

- `--params <path>`
- `--map-h <path>`, `--map-r <path>`, `--map-v <path>`
- `--output-file <path>` (generate/derive only)
- `--output-dir <path>` (debug only)
- `--debug-output-file <path>` (debug optional)
- `--force`

Path resolution:

- Relative paths passed directly on CLI are resolved from the current working directory.
- Relative paths inside a params file are resolved from that params file's directory.

Mode/output validation highlights:

- In `debug`, using `--output-file` is rejected with the hint: `You might mean --debug-output-file.`
- Existing output files/directories fail by default and require `--force` to overwrite/replace.

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
