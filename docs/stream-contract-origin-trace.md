# Stream Contract: Explicit Origins + Traced Paths

Status: Proposed

This document defines the stream contract as deterministic traced stream objects.
It explicitly replaces old stream-mask semantics and does not reintroduce `waterClass` or `isStream`.

## 1) Proposed stream contract

A stream network is produced in four deterministic stages:

1. Select origin tiles using a predicate.
2. Sort origin tiles with a fixed ordering rule.
3. Trace each origin downstream using existing routing truth (`fd` + basin context).
4. De-duplicate overlapping downstream geometry into one unique network.

Output shape (conceptual):

- `origins`: ordered origin tile ids
- `streams`: one traced path per origin
- `uniqueEdges`: de-duplicated directed downstream edges
- `tileStream`: per-tile derived stream fields

## 2) Origin predicate interface

Origin selection is intentionally simple.

```ts
export type StreamOriginPredicate = (tile: {
  tileId: number;
  x: number;
  y: number;
  h: number;
  fa: number;
}) => boolean;

const streamOriginTiles = tiles.filter(predicate);
```

Bootstrap predicate (initial default):

```ts
const bootstrapPredicate: StreamOriginPredicate = (tile) =>
  tile.h > 0.5 && tile.fa > 5;
```

No predicate id/version/expression metadata is required by this contract.

## 3) Deterministic origin ordering rule

After filtering, sort origins by:

1. `h` descending
2. `fa` descending
3. `y` ascending
4. `x` ascending
5. `tileId` ascending

This ordering is total and deterministic.

## 4) Path tracing semantics

For each ordered origin:

- Start path at origin tile.
- Step downstream using current routing truth (`fd`, basin linkage/spill context).
- Append each visited tile in order.
- Stop when a termination state is reached (Section 5).
- If the next downstream edge already exists in `uniqueEdges`, stop extension and mark a merge (Section 6).
- Detect cycles; cycles terminate explicitly.

No heuristic rerouting and no threshold-mask reconstruction.

## 5) Termination states

Each stream ends in exactly one named state:

- `leaf_basin`: reached a leaf basin terminal.
- `entered_active_basin`: reached a tile inside an active basin.
- `entered_lake_basin`: reached a tile inside a lake basin.
- `local_sink`: no valid downhill continuation at a sink tile.
- `no_downstream`: routing truth provides no downstream target.
- `cycle_detected`: downstream traversal revisited a tile in the same trace.
- `max_steps_reached`: optional safety limit reached.
- `boundary_exit`: downstream exits available domain bounds.

Required by settled direction:

- terminate at leaf basin, or
- at a tile inside active/lake basin, or
- another explicitly named terminal condition.

## 6) Overlap / confluence uniqueness rule

Uniqueness key: directed edge `(fromTileId, toTileId)`.

- First stream to add an edge materializes it in `uniqueEdges`.
- Later streams do not duplicate an existing edge.
- Later streams terminate extension at first already-existing edge and record merge target stream.

This preserves per-origin traces while keeping downstream shared geometry unique.

## 7) Proposed per-tile emitted stream fields

Derived per tile from traced streams + unique edge set:

- `isOrigin: boolean`
- `originIds: string[]` (sorted stream ids whose traces include the tile)
- `upstreamOriginCount: number`
- `inUniqueNetwork: boolean`
- `enterEdgeCount: number` (unique-edge in-degree)
- `exitEdgeCount: number` (unique-edge out-degree)
- `terminalStates: string[]` (sorted unique terminal states ending at tile)

These are derived outputs only; they do not define hydrology truth.

## 8) What remains deferred

1. Exact serialized schema for CLI/artifact outputs.
2. Exact stream id string format (must remain deterministic).
3. Exact definition source for "active basin".
4. Exact definition source for "leaf basin".
5. Normalization rule between `local_sink` vs `no_downstream` where `fd` is undefined/flat.
6. Performance strategy for very dense origin sets.
7. Test fixture set for deterministic regression of this contract.

## Explicit ambiguities

- "Active basin" is still ambiguous until tied to one existing hydrology field contract.
- "Leaf basin" is still ambiguous until tied to one basin-graph rule.
- Domain-boundary behavior may be run-mode dependent (`boundary_exit` may be unreachable in some envelopes).
