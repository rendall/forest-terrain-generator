# Region Enrichment Proposal (Discussion Draft)

## Purpose

Add a post-generation companion executable that appends deterministic region context to an existing terrain envelope JSON file, similar in workflow to the description pass.

Goal outcomes:

1. Identify disconnected biome components (`biomeRegionId`).
2. Persist this context in JSON for downstream use (description, tooling, analysis).

## Why a Post-Generation Executable

This keeps core generation/derivation stable and makes region logic an explicit enrichment pass:

1. Input: existing terrain envelope JSON.
2. Output: terrain envelope JSON with appended region fields.
3. No change to hydrology/ecology/navigation derivation behavior.

## Scope Lock

This proposal is explicitly scoped away from core simulator/generator behavior:

1. Region assignment is computed only from input envelope tile payload data.
2. No changes to core derivation flows in `run-generator` or generation pipeline stages.
3. No changes to the primary `generate|derive|debug` command behavior.
4. Implement as a separate lightweight CLI entrypoint: `src/cli/assign-regions.ts`.

## Constraints and Policy Notes

1. `docs/drafts/ImplementationPlan.md` currently defines the core generator command surface as `generate`, `derive`, `debug`.
2. The region assigner is a separate companion executable (not a `src/cli/main.ts` subcommand) and should be recorded in planning/ADR artifacts before implementation.
3. `tiles` remains the authoritative downstream payload.
4. Deterministic traversal must follow normative ordering rules.

## Proposed Executable Contract

Recommended first shape:

1. Add a companion executable analogous to describe flow:
   - `--input-file <path>`
   - `--output-file <path>`
   - `--force`
2. Command behavior:
   - read envelope JSON
   - compute region artifacts
   - append region data
   - write enriched envelope JSON
   - always emit top-level `regions` index in output
3. Entry-point and packaging:
   - source entrypoint: `src/cli/assign-regions.ts`
   - published bin target: `forest-terrain-assign-regions`

## Region Model (Phase 1)

Primary region primitive: connected components by biome.

Definitions:

1. `biome region`: maximal set of same-biome tiles connected by 8-way adjacency.
2. `biomeRegionId`: deterministic integer assigned in first-seen row-major order.

Algorithm:

1. Scan tiles row-major (`y`, then `x`).
2. For each unvisited tile, BFS flood-fill only same-biome neighbors.
3. Neighbor expansion order uses canonical Dir8 order (`E, SE, S, SW, W, NW, N, NE`).
4. Assign one `biomeRegionId` to all tiles in that component.

## Proposed JSON Contract

Per-tile attachment:

```json
{
  "x": 25,
  "y": 19,
  "region": {
    "biomeRegionId": 12
  }
}
```

Top-level index (required):

```json
{
  "regions": [
    {
      "id": 12,
      "biome": "spruce_swamp",
      "tileCount": 87,
      "bbox": { "minX": 20, "minY": 14, "maxX": 33, "maxY": 26 }
    }
  ]
}
```

Semantics:

1. `tile.region.biomeRegionId` is primary lookup.
2. `regions[]` is a required denormalized index for discovery/debug/reporting.
3. `assign-regions` output MUST always include `regions` (empty array is allowed when no tiles/components exist).

## Compatibility Requirements

Current post-processing path behavior may drop unknown top-level fields if not updated. Region enrichment rollout must preserve required `regions` in enriched envelopes and preserve envelope extensions:

1. Read path remains backward-compatible with pre-enrichment envelopes that do not include `regions`.
2. Describe path preserves required `regions` through read-transform-write when processing enriched envelopes.
3. Future enrichers preserve previously appended top-level artifacts unless explicitly removed by policy.

Implementation boundary note:

1. Region logic should live in the assign-regions app/CLI path, not in terrain derivation modules.

## Determinism Requirements

1. Stable component seed order: row-major.
2. Stable neighbor order: canonical Dir8 order.
3. Stable region ID assignment: first-seen component order.
4. No hash-order dependence in output ordering.

## Non-goals (Initial)

1. No changes to terrain generation math.
2. No new randomness.
3. No region-aware prose rewrite in the same change.
4. No modifications to `src/app/run-generator.ts`.
5. No modifications to `src/pipeline/*` terrain derivation modules.
6. No changes to `src/cli/main.ts` command behavior.

## Open Decisions

1. Whether to include additional aggregate fields (`centroid`, `meanHeight`, etc.) in v1.
