# Hydrology Inspector Visualization Implementation Checklist

Status: v1-draft  
Source plan: `docs/drafts/Hydrology-Inspector-Visualization-ImplementationPlan.md`

- [x] [cli] `HIV-CLI-01` Add `--viz <mode>` to `src/cli/hydrology-inspector.ts` with modes `fa|fd|fa-normalized|hydrology|all`.
- [x] [cli] `HIV-CLI-02` Add `--debug-dir <path>` to `src/cli/hydrology-inspector.ts` and enforce it as required when `--viz` is set.
- [x] [cli] `HIV-CLI-03` Add `--stats` and `--stats-file <path>` to `src/cli/hydrology-inspector.ts`; only emit stats when `--stats` is present.
- [x] [cli] `HIV-CLI-04` Enforce viz overwrite guard in `src/cli/hydrology-inspector.ts`: when any target viz file exists, require `--force`.
- [x] [cli] `HIV-CLI-05` Extend `src/cli/argv-validation.ts` to accept same-run debug integration flags: `--hydrology-viz`, `--hydrology-inspector-stats`, `--hydrology-inspector-stats-file`.

- [x] [app] `HIV-SRC-01` Add debug-artifact readers in `src/app/run-hydrology-inspector.ts` to load `topography.json` and selected hydrology artifacts (`fa.json`, `fd.json`, `fa-normalized.json`, `hydrology.json`) from `--debug-dir` when available.
- [x] [app] `HIV-SRC-02` Implement deterministic source fallback in `run-hydrology-inspector`: if required artifact file(s) are missing, fall back to existing envelope-first/recompute hydrology resolution path.
- [x] [app] `HIV-SRC-03` Ensure source reporting remains explicit in inspector output (`hydrologyMapsSource`) for viz/stat runs, including artifact-driven runs.

- [x] [viz] `HIV-VIZ-01` Add a shared base renderer in `src/app/run-hydrology-inspector.ts` that builds grayscale terrain from topography `h` for all viz modes.
- [x] [viz] `HIV-VIZ-02` Add a shared blue-tint blend helper for transparent-style overlays (preserve grayscale readability; do not replace base pixel color).
- [x] [viz] `HIV-VIZ-03` Implement `fa.ppm` writing in inspector with `faIntensity = clamp(fa, 0, 255) / 255` mapped through the shared blue-tint blend.
- [x] [viz] `HIV-VIZ-04` Implement `fa-normalized.ppm` writing with `faNIntensity = clamp(faN, 0, 1)` mapped through the same blue-tint blend.
- [x] [viz] `HIV-VIZ-05` Implement `fd.ppm` writing with deterministic direction overlay colors on top of grayscale terrain.
- [x] [viz] `HIV-VIZ-06` Implement `hydrology.ppm` writing with deterministic hydrology overlay (stream/water-class emphasis) on top of grayscale terrain.
- [x] [viz] `HIV-VIZ-07` Implement `--viz all` file emission with exact filenames: `fa.ppm`, `fd.ppm`, `fa-normalized.ppm`, `hydrology.ppm` (depends on `HIV-VIZ-03..06`).

- [x] [stats] `HIV-STAT-01` Add stats computation in `src/app/run-hydrology-inspector.ts` for sink count, stream tile count, `fa/faN` summary metrics (min/max/mean/p50/p90/p95/p99), FD histogram, and deterministic top-N accumulation tiles.
- [x] [stats] `HIV-STAT-02` Emit stats to `<debug-dir>/hydrology-inspector-stats.json` by default when `--stats` is set; honor `--stats-file` override when provided.

- [x] [debug] `HIV-DBG-01` Extend debug command wiring in `src/cli/main.ts` with `--hydrology-viz`, `--hydrology-inspector-stats`, `--hydrology-inspector-stats-file` so same-run debug+viz requests run viz only after debug artifacts are fully written.
- [x] [debug] `HIV-DBG-02` Ensure same-run debug+viz uses newly written debug artifacts in the output dir (no pre-write read attempts, no race/fail behavior).

- [x] [docs] `HIV-DOC-01` Update the top-level JSDoc manual in `src/cli/hydrology-inspector.ts` to include viz/stat flags, output files, overwrite rules (`--force`), and source-resolution behavior.

## Behavior Slices

### Slice A
- Goal: Add CLI surface and guardrails for visualization/stat modes.
- Items: `HIV-CLI-01`, `HIV-CLI-02`, `HIV-CLI-03`, `HIV-CLI-04`, `HIV-CLI-05`
- Type: behavior

### Slice B
- Goal: Resolve visualization inputs from debug artifacts first, with deterministic fallback to envelope/recompute.
- Items: `HIV-SRC-01`, `HIV-SRC-02`, `HIV-SRC-03`
- Type: behavior

### Slice C
- Goal: Produce four deterministic PPM visualizations from shared grayscale base plus layer-specific overlays.
- Items: `HIV-VIZ-01`, `HIV-VIZ-02`, `HIV-VIZ-03`, `HIV-VIZ-04`, `HIV-VIZ-05`, `HIV-VIZ-06`, `HIV-VIZ-07`
- Type: behavior

### Slice D
- Goal: Add optional stats output with deterministic metrics and file emission.
- Items: `HIV-STAT-01`, `HIV-STAT-02`
- Type: behavior

### Slice E
- Goal: Support same-run debug+viz sequencing without read-before-write failures.
- Items: `HIV-DBG-01`, `HIV-DBG-02`
- Type: behavior

### Slice F
- Goal: Keep CLI documentation aligned with implemented behavior.
- Items: `HIV-DOC-01`
- Type: mechanical
