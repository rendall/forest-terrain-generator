# Forest Terrain Generator

Procedurally generate forest data.

The *Forest Terrain Generator* is a deterministic terrain synthesis engine for producing complete, machine-readable, procedurally generated forest landscapes. Given a seed, dimensions, and a parameter set, it generates a rectangular grid of tiles and derives a coherent physical model of that region: elevation, slope, landform, hydrology, moisture, biome classification, vegetation structure, ground conditions, roughness features, visibility, and movement semantics.

The output is a versioned JSON dataset whose `tiles` array contains one fully described record per coordinate. Each tile represents a physically consistent location within a forest environment, including both environmental attributes and navigation-related properties. The result is not prose or rendered content, but a structured terrain model designed to be deterministic, reproducible, and suitable for downstream systems that require spatially coherent forest data.
An optional post-processing CLI can attach deterministic prose descriptions per tile.

```bash
node --import tsx src/cli/main.ts generate --params params.json --seed 42 --width 32 --height 32 --output-file out.json
```

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

```bash
node --import tsx src/cli/main.ts debug --input-file forest.json --output-dir outdir
```

## Authored Map From PNG

Convert a grayscale image into authored-map JSON compatible with `--map-h`:

```bash
bash scripts/png-to-authored-map.sh --input input.png --output map-h.json --expect-size 64x64
```

The script writes JSON with the required schema:
`{ "width": number, "height": number, "data": number[] }`
where `data` is row-major and normalized to `[0,1]`.
