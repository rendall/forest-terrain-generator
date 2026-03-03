# Parameter Override Precedence Discussion

## Status
Decision captured for v2 tile-data-shape track.

## Purpose
Capture and decide how parameter sources should merge and override each other across CLI workflows.

## Why this exists
`Tile-Data-Shape-Discussion.md` is focused on output data shape. Input precedence and override policy are related but separate concerns, so they are tracked here to avoid scope drift.

## Scope
- Precedence contract for this track:
  - default parameters
  - input-file embedded `paramOverrides`
  - `--params` file values
  - explicit CLI flag values
- Define conflict handling and user-facing diagnostics.
- Define behavior consistency across commands (`generate`, debug tooling, inspectors).

## Locked Decision (v2 track)
- Authoritative precedence order:
  - `defaults < input-file paramOverrides < CLI --params file < explicit CLI flags`
- This precedence applies when recomputing from an input envelope in debug/inspector paths.
- This document now tracks the decided policy for implementation checklists and docs.

## Open questions
- Should conflicting keys emit warning, info, or hard error?
- Should precedence behavior be globally uniform across all CLIs, or command-specific?
- Should CLI diagnostics report the winning source per overridden key in debug output?

## Next step
Use this decision as the source for implementation tasks and tests. Keep future changes additive and explicit.
