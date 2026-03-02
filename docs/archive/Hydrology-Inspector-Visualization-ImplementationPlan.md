# Hydrology Inspector Visualization Implementation Plan (archived)

Status: implemented (archived baseline)  
Owner: local team  
Scope: `src/cli/hydrology-inspector.ts`, `src/app/run-hydrology-inspector.ts`, and debug-command integration points in `src/cli/main.ts`, `src/cli/argv-validation.ts`, `src/app/run-generator.ts`

---

## 1) Purpose

Upgrade `hydrology-inspector` so it can generate map visualizations from existing debug artifacts and provide compact statistical summaries for troubleshooting.

This document is retained as the implementation record and baseline reference.

Baseline fixture:
- `test/fixtures/hydrology-baseline`

Baseline regression:
- `test/integration/hydrology-baseline-regression.test.mjs`

---

## 2) Locked Decisions

1. Visualization target directory is the debug output directory (not `--viz-output-dir`).
2. Output image filenames are:
   - `fa.ppm`
   - `fd.ppm`
   - `fa-normalized.ppm`
   - `hydrology.ppm`
3. Base image is topography height (grayscale) with hydrology overlays.
4. Inspector should emit statistical info in addition to visual output.
5. If debug artifacts already exist in the debug dir, visualization should use them directly.
6. When debug + viz are requested in the same run, viz executes only after debug artifacts are written.
7. `fa.ppm` must preserve grayscale terrain readability by using a transparent-style blue tint overlay, not full color replacement.
8. `fa-normalized.ppm` uses the same blue-tint blend style as `fa.ppm`; map `faN` directly to intensity (`faN * 255`).
9. When `--viz` writes image files and targets already exist, `--force` is required.
10. Stats file emission is only enabled when `--stats` is set.

---

## 3) CLI Contract Proposal

### 3.1 New flags

- `--viz <mode>` where `<mode>` is `fa|fd|fa-normalized|hydrology|all`
- `--debug-dir <path>` required when `--viz` is set
- `--stats` enables stat emission
- `--stats-file <path>` optional; defaults to `<debug-dir>/hydrology-inspector-stats.json` when `--stats` is set

For same-run debug+viz integration in `main debug` mode:

- `--hydrology-viz <mode>` where `<mode>` is `fa|fd|fa-normalized|hydrology|all`
- `--hydrology-inspector-stats`
- `--hydrology-inspector-stats-file <path>`

### 3.2 Existing flags unchanged

- Keep current routing flags (`--input-json`, `--x`, `--y`, `--sink-mode`, `--debug`, `--output-ppm`, etc.).
- Keep current JSON stdout behavior; stats may be added as an additional top-level field in stdout when requested.

---

## 4) Visualization Outputs

All visual outputs are PPM in `--debug-dir`.

### 4.1 `fa.ppm`

- Base: topography `h` grayscale.
- Overlay: flow accumulation as blue-tint strength from `fa` values.
- Rendering rule (locked):
  - compute `faIntensity = clamp(fa, 0, 255) / 255`
  - blend on top of grayscale base so low `fa` remains mostly unchanged and high `fa` shifts toward blue
  - do not replace the tile color outright with blue/white
  - target visual: transparent overlay feel, preserving terrain contrast

### 4.2 `fa-normalized.ppm`

- Base: topography `h` grayscale.
- Overlay: normalized accumulation as blue-tint strength from `faN`.
- Rendering rule (locked):
  - compute `faNIntensity = clamp(faN, 0, 1) * 255`
  - apply the same blend function used by `fa.ppm`
  - preserve grayscale terrain readability and avoid blue-white map wash

### 4.3 `fd.ppm`

- Base: topography `h` grayscale.
- Overlay: direction-coded color by `fd` (8 directions + sink/NONE).

### 4.4 `hydrology.ppm`

- Base: topography `h` grayscale.
- Overlay: stream/water-class layer from hydrology maps (`isStream` and water class fields when available).

---

## 5) Stats Output

When `--stats` is enabled, compute and emit:

- `hydrologyMapsSource` (`envelope` or `recomputed`)
- tile count
- sink count (`fd == NONE`)
- stream tile count
- `fa` metrics: min/max/mean/p50/p90/p95/p99
- `faN` metrics: min/max/mean/p50/p90/p95/p99
- FD histogram by direction code
- top-N accumulation tiles (tileId, x, y, fa, faN), deterministic ordering

---

## 6) Data Source Rules

Use this source policy for visualization/stat generation:

1. Prefer existing debug artifacts in `--debug-dir` when all required sources are present.
   - Required baseline: `topography.json`.
   - Required hydrology layer files depend on selected viz mode:
     - `fa` -> `fa.json`
     - `fd` -> `fd.json`
     - `fa-normalized` -> `fa-normalized.json`
     - `hydrology` -> `hydrology.json`
2. If required artifact file(s) are missing, fall back to inspector map resolution logic:
   - prefer hydrology fields already present in envelope
   - otherwise recompute via pipeline hydrology
3. Never fail solely because split artifacts are absent if recomputation path is available.

This source must be reported in stats and debug output (`hydrologyMapsSource`).

### 6.1 Same-run sequencing rule

If visualization is requested together with a debug generation run, execution order is:

1. generate debug artifacts
2. flush writes successfully
3. run viz/stat pass against the produced debug directory

This avoids race/fail behavior from reading files before they exist.

---

## 7) Determinism and Safety

- Visualization mapping (colors, normalization, bins) must be deterministic.
- Sorting for top-N and histograms must have explicit tie-breaks.
- No mutation of envelope content.
- No behavioral changes to stream routing logic in this work slice.

---

## 8) Implementation Slices

### Slice A: CLI plumbing

- Add `--viz`, `--debug-dir`, `--stats`, `--stats-file`.
- Validate combinations and input errors.

### Slice B: Visualization writers

- Add per-layer render helpers.
- Write selected PPM files into debug dir with fixed names above.

### Slice C: Stats

- Add stats computation helper over resolved hydrology maps.
- Emit to file and optionally stdout.

### Slice D: Tests

- Integration tests for:
  - viz file creation and naming
  - `--viz all` producing all 4 files
  - stats file generation and key fields
  - invalid flag combinations

---

## 9) Out of Scope (for this upgrade)

- Changing hydrology routing algorithms.
- Adding new hydrology fields to public envelope schema.
- Replacing existing `stream` CLI behavior.
- Multi-time-step physical simulation.

---

## 10) Remaining Open Review Question

No blocking open questions remain for this implementation.

---

## 11) Checklist Review Pass Log

### Pass 1 (Quality Control): issues and decisions

- **Issue QC-01 (scope drift):** checklist included `main debug` wiring, but plan scope was inspector-only.
  - **Decision:** expand scope to include explicit debug-command integration files (`main`, `argv-validation`, `run-generator`).
- **Issue QC-02 (ambiguous integration contract):** same-run debug+viz behavior did not define concrete debug CLI flags.
  - **Decision:** lock explicit debug CLI flags: `--hydrology-viz`, `--hydrology-inspector-stats`, `--hydrology-inspector-stats-file`.
- **Issue QC-03 (stats mismatch):** checklist requested p95 metrics while plan omitted p95.
  - **Decision:** align plan metrics to include p95 for both `fa` and `faN`.
- **Issue QC-04 (review blocker):** blend-constant question left unresolved.
  - **Decision:** adopt linear blend constants for this iteration and remove as a blocker.

### Pass 2 (Integration): checklist/plan alignment

- Confirmed checklist items map to plan scope and locked decisions, including debug-command integration and overwrite/stats policies.
- Confirmed naming and file targets (`fa.ppm`, `fd.ppm`, `fa-normalized.ppm`, `hydrology.ppm`) are consistent across plan and checklist.

### Pass 3 (Sanity): blocker check

- No unresolved blockers remain for implementation.
