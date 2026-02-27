# Region Enrichment - Implementation Checklist

Primary reference: `docs/drafts/RegionEnrichment-Proposal.md`

- [x] [scope] Confirm this task remains a post-process enrichment only and does not modify terrain derivation behavior.
- [x] [scope] Confirm no changes are made to `src/app/run-generator.ts`, `src/pipeline/*` terrain derivation modules, or `src/cli/main.ts`.
- [x] [scope] Confirm assign-regions is implemented as a separate executable and is not added as a `src/cli/main.ts` subcommand.
- [x] [policy] Record the separate post-process executable (`forest-terrain-assign-regions`) in `docs/drafts/ImplementationPlan.md` as an extension outside the core `generate|derive|debug` simulator surface.
- [x] [policy] Add ADR entry in `docs/ADR.md` for the region-enrichment data contract and determinism rules.
- [x] [types] Add `RegionTileAttachment` and `RegionSummary` interfaces in `src/domain/types.ts` for per-tile and top-level region payloads.
- [x] [types] Extend `TerrainEnvelope` in `src/domain/types.ts` with top-level `regions` support and per-tile `region` payload support; define assign-regions output contract to always emit `regions` (depends on previous item).
- [x] [io] Update `readTerrainEnvelopeFile` in `src/io/read-envelope.ts` to remain backward-compatible for envelopes without `regions`, and validate minimal required shape when `regions` is present (depends on previous item).
- [x] [io] Update `attachTileDescriptions` return shape in `src/app/run-describe.ts` to preserve top-level `regions` from enriched input envelopes (depends on previous item).
- [x] [app] Add deterministic region labeling helper module under `src/app` (or app-local helper) for 8-way same-biome connected-component assignment using row-major seed scan and canonical Dir8 neighbor order.
- [x] [app] Implement stable `biomeRegionId` assignment in first-seen component order in the app-local labeling helper (depends on previous item).
- [x] [app] Implement deterministic region summarization (ordered by region `id`) in the app-local assign-regions path (depends on previous item).
- [x] [app] Add `run-assign-regions` application function in `src/app` that reads tile biome values from the input envelope and attaches `region.biomeRegionId` to each tile (depends on previous item).
- [x] [app] Populate required envelope `regions` array from deterministic summaries in `run-assign-regions` and always emit the field (empty array allowed) (depends on previous item).
- [x] [cli] Add region-enrichment command entrypoint `src/cli/assign-regions.ts` with `--input-file`, `--output-file`, and `--force` arguments.
- [x] [cli] Add package bin mapping for `forest-terrain-assign-regions` targeting the compiled assign-regions CLI entrypoint.
- [x] [cli] Implement command runtime wiring to read input envelope, compute regions, append region data, and write output envelope using existing IO boundaries (depends on previous item).
- [x] [cli] Ensure validation errors for missing `--input-file` or `--output-file` follow existing invalid-input error conventions.
- [x] [docs] Document region enrichment command usage and output fields in project docs after command wiring is complete.

## Parent Region Linkage Extension

- [x] [policy] Record `regions[].parentRegionId` as additive metadata in `docs/drafts/ImplementationPlan.md` and `docs/ADR.md` with explicit enclosure semantics.
- [x] [types] Extend `RegionSummary` in `src/domain/types.ts` with optional `parentRegionId?: number`.
- [x] [io] Update `readTerrainEnvelopeFile` in `src/io/read-envelope.ts` to accept optional integer `regions[].parentRegionId` and reject malformed values.
- [x] [app] In `src/app/assign-regions.ts`, implement deterministic parent linkage assignment:
  - Region touching map boundary gets no parent.
  - Region whose full external perimeter neighbors map to exactly one distinct region ID gets that `parentRegionId`.
  - Otherwise omit parent.
- [x] [app] Keep `biomeRegionId` and `tile.region.biomeRegionId` unchanged while adding parent linkage as summary-only metadata.
- [x] [tests] Add/extend unit tests in `test/unit/assign-regions.test.mjs` for enclosed-island parent assignment, edge-touch no-parent, and multi-neighbor no-parent.
- [x] [tests] Extend envelope IO tests in `test/unit/read-envelope.test.mjs` for valid and invalid `parentRegionId`.
- [x] [tests] Extend integration verification in `test/integration/cli-assign-regions.test.mjs` for parent metadata presence on enclosed fixtures.
- [x] [docs] Update `docs/drafts/RegionEnrichment-Proposal.md` examples/semantics to include `parentRegionId`.
