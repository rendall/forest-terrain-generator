# Stream Network Model — Minimal Implementation Checklist

Scope: implement the minimal stream-network plan co-located with `docs/stream-network-model.md`.

Notes:
- This checklist is an implementation-shape mirror of the agreed minimal plan.
- Per `docs/normative/checklist.md`, explicit test-writing/execution steps are intentionally excluded from checklist items.

## Atomic Items

- [ ] [pipeline] Create `src/pipeline/derive-stream-network.ts` that derives deterministic stream network outputs (`features.streams` + tile stream geometry) from existing terrain/hydrology truth using canonical 8-direction definitions.
- [ ] [pipeline] Implement deterministic origin selection + ordering in `derive-stream-network.ts` as: height desc, flow accumulation desc, y asc, x asc, tile id asc.
- [ ] [pipeline] Implement origin-elimination/deduplication in `derive-stream-network.ts` so candidate origins already present in any prior stream path are skipped without creating a stream feature.
- [ ] [pipeline] Implement deterministic downstream candidate ranking and traversal in `derive-stream-network.ts` with directional inertia and canonical direction tie-break behavior.
- [ ] [pipeline] Implement cycle handling in `derive-stream-network.ts` via deterministic backtracking search; emit `terminalKind: "error"` only when search exhausts without valid `confluence`/`sink`.
- [ ] [pipeline] Derive tile-local stream geometry in `derive-stream-network.ts` so each tile has at most one `outgoingDirection`, canonical-ordered `incomingDirections`, and `outgoingDirection = null` at terminals.
- [ ] [domain] Extend `src/domain/topographic-features.ts` to support optional `features.streams` payload with minimal stream feature shape.
- [ ] [app] Wire `src/app/run-generator.ts` to call `derive-stream-network.ts`, attach `features.streams` to generator/replay envelope features, and attach tile `hydrology.stream` geometry in tile payload output.
- [ ] [docs] Keep `docs/stream-network-model.md` as the behavioral contract and ensure implementation field names/terminal semantics match it exactly.

## Behavior Slices

### Slice A
- Goal: produce deterministic stream path features from terrain/hydrology truth with minimal new surface area.
- Items: [pipeline] Create `src/pipeline/derive-stream-network.ts`; [pipeline] deterministic origin selection + ordering; [pipeline] origin-elimination/deduplication; [pipeline] deterministic downstream candidate ranking + traversal; [pipeline] cycle handling via deterministic backtracking.
- Type: behavior

### Slice B
- Goal: emit local tile stream geometry consistent with derived network edges.
- Items: [pipeline] tile-local stream geometry derivation.
- Type: behavior

### Slice C
- Goal: expose stream network outputs through existing envelope contracts with additive schema changes only.
- Items: [domain] optional `features.streams` support; [app] run-generator wiring for `features.streams` + tile `hydrology.stream`.
- Type: behavior

### Slice D
- Goal: preserve a single, explicit source-of-truth contract for stream behavior semantics.
- Items: [docs] implementation parity with `docs/stream-network-model.md`.
- Type: mechanical
