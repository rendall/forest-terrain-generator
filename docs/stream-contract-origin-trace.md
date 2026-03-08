# Stream Contract: Explicit Origins + Traced Paths

Status: Proposed

This document defines the **new stream contract** as deterministic traced stream objects.
It replaces threshold-mask semantics and does not use `isStream` or `waterClass`.

## Binding Invariants

1. Stream existence is decided by an explicit origin predicate, not by a per-tile stream mask.
2. For a fixed terrain envelope and fixed predicate parameters, emitted stream objects are deterministic.
3. Each emitted stream has one origin tile and one ordered downstream path.
4. Termination for each stream is explicit and encoded as a named terminal state.
5. Overlapping downstream segments are represented once in the unique segment set (no duplicated segment geometry).

## 1) Proposed stream contract

The stream system emits **stream traces** built from:

- a deterministic set of origins,
- routed downstream paths over existing routing truth (`fd`, basin context),
- explicit terminal states,
- unique segment topology for overlaps/confluences.

### Canonical output objects

```ts
export interface StreamNetwork {
  contractVersion: "stream-contract-v1";
  originPredicate: StreamOriginPredicateSpec;
  originOrdering: "h_desc_fa_desc_y_asc_x_asc_tileId_asc";
  streams: StreamTrace[];
  uniqueSegments: StreamSegment[];
  tiles: StreamTileEmission[];
}
```

`streams` preserves per-origin trace identity. `uniqueSegments` de-duplicates shared downstream geometry.

## 2) Origin predicate interface

Origins are selected by a **named, explicit, replaceable predicate**.

```ts
export interface StreamOriginPredicateSpec {
  id: string; // e.g. "bootstrap-h-gt-0.5-fa-gt-5"
  version: string; // semantic version for predicate definition
  params: Record<string, number | string | boolean>;
  expression: string; // machine-readable expression string
}

export interface OriginCandidateContext {
  tileId: number;
  x: number;
  y: number;
  h: number;
  fa: number;
}

export type StreamOriginPredicate = (
  tile: OriginCandidateContext,
  spec: StreamOriginPredicateSpec,
) => boolean;
```

### Bootstrap predicate (initial default)

A tile is an origin iff both conditions are true:

- `h > 0.5`
- `fa > 5`

Named bootstrap spec:

```json
{
  "id": "bootstrap-h-gt-0.5-fa-gt-5",
  "version": "1.0.0",
  "params": { "hMinExclusive": 0.5, "faMinExclusive": 5 },
  "expression": "tile.h > hMinExclusive && tile.fa > faMinExclusive"
}
```

## 3) Deterministic origin ordering rule

After predicate filtering, origins are sorted by this strict key tuple:

1. `h` descending
2. `fa` descending
3. `y` ascending
4. `x` ascending
5. `tileId` ascending

This ordering is total and deterministic.

If future predicates add/omit fields, sorting keys remain unchanged unless contract version changes.

## 4) Path tracing semantics

Each origin creates one `StreamTrace`:

```ts
export interface StreamTrace {
  streamId: string; // deterministic: "s-<originTileId>"
  originTileId: number;
  origin: { x: number; y: number; h: number; fa: number };
  orderedTilePath: number[]; // includes origin, includes terminal tile when tile-based
  orderedEdges: Array<{ fromTileId: number; toTileId: number }>;
  terminal: StreamTerminalState;
  mergedIntoStreamId: string | null;
}
```

Routing rules:

- Use existing downstream routing truth (`fd`, basin hierarchy/metadata, and basin spill context).
- Advance one downstream step at a time according to routing truth.
- If downstream step enters already-known geometry, stop path extension and mark merge (see Section 6).
- Cycle detection is mandatory. Any detected cycle terminates with an explicit cycle terminal state.

Non-goals:

- No fallback re-routing heuristics.
- No threshold-mask reconstruction.

## 5) Termination states

Every stream must end in exactly one explicit state:

```ts
export type StreamTerminalState =
  | { type: "leaf_basin"; basinId: string }
  | { type: "entered_active_basin"; basinId: string }
  | { type: "entered_lake_basin"; basinId: string }
  | { type: "boundary_exit" }
  | { type: "local_sink"; tileId: number }
  | { type: "cycle_detected"; tileId: number }
  | { type: "max_steps_reached"; stepLimit: number }
  | { type: "no_downstream"; tileId: number };
```

Required semantics from settled direction:

- terminate at leaf basin,
- or when reaching a tile inside an active basin/lake basin,
- or another **named** terminal condition.

`boundary_exit`, `local_sink`, `cycle_detected`, `max_steps_reached`, and `no_downstream` are the explicit additional terminal conditions in this proposal.

## 6) Overlap / confluence uniqueness rule

Rule: downstream geometry is unique by directed edge key `fromTileId -> toTileId`.

- First stream to claim a directed edge owns its materialization in `uniqueSegments`.
- Later streams that reach an already-claimed edge do not duplicate geometry.
- Later streams terminate extension at first claimed edge and set `mergedIntoStreamId` to owning stream.

This yields:

- unique shared downstream representation,
- per-origin trace identity,
- deterministic confluence handling.

## 7) Proposed per-tile emitted stream fields

Per-tile stream emissions are derived from traced streams and unique edges.

```ts
export interface StreamTileEmission {
  tileId: number;
  streamOriginIds: string[]; // sorted; origins whose traces include tile
  upstreamOriginCount: number;
  isOrigin: boolean;
  inUniqueNetwork: boolean; // tile appears in uniqueSegments
  enterEdgeCount: number; // in-degree within unique directed stream graph
  exitEdgeCount: number; // out-degree within unique directed stream graph
  terminalTypes: StreamTerminalState["type"][]; // sorted unique set for streams terminating here
}
```

Notes:

- These fields are for debug/consumers and must remain derivations from stream traces.
- This section intentionally does not introduce `isStream`.

## 8) What remains deferred

1. **Predicate plug-in mechanism shape** (CLI arg shape/config file schema/runtime registration).
2. **Exact stream ID encoding** beyond deterministic origin-derived identity string.
3. **Whether `boundary_exit` is representable in current envelopes** or only future tiled-world runs.
4. **How to represent basin-entry terminal tile when basin metadata is present but tile-level attribution is partial.**
5. **Storage format split** between debug artifact vs stable public output contract.
6. **Performance constraints** for very dense origin sets (batching/indexing), while preserving determinism.
7. **Golden regression fixtures** for invariants listed above.

## Ambiguities called out explicitly

- "Active basin" needs a strict implementation-level boolean definition sourced from current hydrology truth outputs.
- "Leaf basin" needs a strict definition in terms of basin graph metadata available at trace time.
- `fd` behavior at flats/undefined direction must be normalized into terminal-state behavior (likely `no_downstream` vs `local_sink`) in implementation notes.
