# Stream Network Model — Minimal Implementation Checklist

Scope: implement the minimal stream-network plan co-located with `docs/normative/stream-network-model.md`.

Notes:
- This checklist is an implementation-shape mirror of the agreed minimal plan.
- Per `docs/normative/checklist.md`, explicit test-writing/execution steps are intentionally excluded from checklist items.
- Stream direction ordering must reuse the repository canonical direction definitions from `src/domain/hydrology.ts`.
- Import and use:
  ```ts
  export const DIR8_CODE = {
    e: 0,
    se: 1,
    s: 2,
    sw: 3,
    w: 4,
    nw: 5,
    n: 6,
    ne: 7
  }
  ```

## Atomic Items

- [x] [pipeline] Create `src/pipeline/derive-stream-network.ts` that derives deterministic stream network outputs (`features.streams` + tile stream geometry) from existing terrain/hydrology truth using canonical 8-direction definitions.
- [x] [pipeline] Import and reuse canonical direction ordering from `src/domain/hydrology.ts` via `DIR8_CODE` for traversal ordering, edge derivation, `incomingDirections`, and `outgoingDirection`; do not introduce any parallel or ad hoc stream-direction ordering.
- [x] [pipeline] Implement deterministic origin candidate selection in `derive-stream-network.ts` using the agreed stream-origin predicate over existing terrain/hydrology truth.
- [x] [pipeline] Implement deterministic origin selection + ordering in `derive-stream-network.ts` as: height desc, flow accumulation desc, y asc, x asc, tile id asc.
- [x] [pipeline] Implement origin-elimination/deduplication in `derive-stream-network.ts` so candidate origins already present in any prior stream path are skipped before tracing and do not produce stream features or terminal outcomes.
- [x] [pipeline] Emit deterministic `StreamFeature` objects in `derive-stream-network.ts` with exact minimal contract fields: `id`, `originTileId`, `pathTileIds`, `terminalTileId`, `terminalKind`.
- [x] [pipeline] Implement origin-step downstream candidate ranking in `derive-stream-network.ts` exactly as: lowest elevation, canonical direction order, tile id when no previous direction exists.
- [x] [pipeline] Implement deterministic downstream candidate ranking and traversal in `derive-stream-network.ts` for non-origin steps as: lower elevation, directional continuation, smallest angular deviation, canonical direction order, tile id.
- [x] [pipeline] Implement cycle handling in `derive-stream-network.ts` via deterministic backtracking search; emit `terminalKind: "error"` only when deterministic tracing/backtracking search exhausts without valid `confluence` or `sink`.
- [x] [pipeline] Implement terminal classification in `derive-stream-network.ts` exactly per `docs/normative/stream-network-model.md`: `confluence` means joining an already-established downstream stream path during evaluation; `sink` means terminating without joining an already-established downstream stream path; no separate lake terminal kind is introduced; terminal leaf-basin/underwater termination cases remain `sink`.
- [x] [pipeline] Derive tile-local stream geometry in `derive-stream-network.ts` so each tile has at most one `outgoingDirection`, canonical-ordered `incomingDirections`, and `outgoingDirection = null` at terminals.
- [x] [domain] Extend `src/domain/topographic-features.ts` to support optional `features.streams` payload with explicit minimal stream feature schema parity fields: `id`, `originTileId`, `pathTileIds`, `terminalTileId`, `terminalKind`.
- [x] [app] Wire `src/app/run-generator.ts` to call `derive-stream-network.ts`, attach `features.streams` to generator/replay envelope features, and attach tile `hydrology.stream` geometry in tile payload output.
- [x] [docs] Keep `docs/normative/stream-network-model.md` as the behavioral contract and ensure implementation field names/terminal semantics match it exactly.

## Behavior Slices

### Slice A
- Goal: produce deterministic stream path features from terrain/hydrology truth with minimal new surface area.
- Items: [pipeline] Create `src/pipeline/derive-stream-network.ts`; [pipeline] import and reuse `DIR8_CODE`; [pipeline] deterministic origin candidate selection; [pipeline] deterministic origin selection + ordering; [pipeline] origin-elimination/deduplication; [pipeline] exact `StreamFeature` emission; [pipeline] origin-step downstream ranking; [pipeline] deterministic downstream candidate ranking + traversal; [pipeline] cycle handling via deterministic backtracking; [pipeline] exact terminal classification semantics.
- Type: behavior

### Slice B
- Goal: emit local tile stream geometry consistent with derived network edges.
- Items: [pipeline] tile-local stream geometry derivation.
- Type: behavior

### Slice C
- Goal: expose stream network outputs through existing envelope contracts with additive schema changes only.
- Items: [domain] optional `features.streams` support with exact minimal stream feature fields; [app] run-generator wiring for `features.streams` + tile `hydrology.stream`.
- Type: behavior

### Slice D
- Goal: preserve a single, explicit source-of-truth contract for stream behavior semantics.
- Items: [docs] implementation parity with `docs/normative/stream-network-model.md`.
- Type: mechanical
