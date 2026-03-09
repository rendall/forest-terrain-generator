# Stream Network Model

This document defines the stream network model used by the terrain generator.

Streams are deterministic traced paths derived from hydrology truth.  
The goal is to produce stream geometry that behaves plausibly, remains deterministic, and integrates cleanly with the terrain and basin systems.

---

# 1. Separation of Concerns

The stream system has two levels of representation.

## Tile-level stream geometry

Each tile may contain local information describing how stream flow passes through it.

The tile representation contains **only local geometry**, not network bookkeeping.

```ts
tile.hydrology.stream = {
  outgoingDirection: StreamDirection | null,
  incomingDirections: StreamDirection[]
}
```

Semantics:

- `outgoingDirection`
  - direction the stream exits this tile
  - `null` if the tile is a terminal stream tile

- `incomingDirections`
  - array of directions from which stream flow enters the tile
  - empty array for headwater tiles
  - multiple entries for confluences

### Invariants

- A tile may have multiple incoming directions.
- A tile may have **at most one outgoing direction**.
- If `outgoingDirection === null`, the tile is terminal.

The `incomingDirections` array must be emitted using the repository's **canonical direction order**.

---

## Feature-level stream objects

Stream paths themselves are represented as feature objects.

These live under:

```ts
features.streams
```

Minimal structure:

```ts
type StreamFeature = {
  id: string
  originTileId: number
  pathTileIds: number[]
  terminalTileId: number
  terminalKind: StreamTerminalKind
}
```

Field meanings:

- `id`
  - deterministic stream identifier

- `originTileId`
  - tile where this stream begins

- `pathTileIds`
  - ordered list of tiles visited by the stream

- `terminalTileId`
  - final tile in the path

- `terminalKind`
  - kind of path ending (`confluence` or `sink`)

### StreamFeature invariants

- `pathTileIds.length >= 1`
- `originTileId === pathTileIds[0]`
- `terminalTileId === pathTileIds[pathTileIds.length - 1]`

Streams must be emitted in deterministic order.

---

# 2. Stream Direction System

Streams use the repository's **canonical 8-direction system**.

The implementation must reuse the existing direction definitions already present in the codebase.

Directions are represented as:

```ts
type StreamDirection =
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "nw"
```

All direction comparisons, ordering, and emission must follow the repository’s canonical direction ordering.

No new direction conventions may be introduced.

---

# 3. Stream Origin Selection

Streams begin at tiles selected by a predicate.

Example bootstrap predicate:

```ts
(tile.h > 0.5 && tile.fa > 5)
```

Origins must be sorted deterministically before tracing.

Ordering rule:

1. height descending
2. flow accumulation descending
3. y coordinate ascending
4. x coordinate ascending
5. tile id ascending

This guarantees deterministic stream ordering.

---

# 4. Stream Path Tracing

Streams are traced downstream from each origin tile.

Tracing uses deterministic candidate selection with cycle avoidance.

The tracer constructs a stream path by repeatedly selecting the best downstream candidate neighbor.

---

# 5. Downstream Candidate Selection

For the current tile, the algorithm builds a list of candidate neighbors.

Candidates must satisfy the downstream admissibility rule.

Typical admissibility rule:

- neighbor elevation must be lower than the current tile

Equivalent forms may allow an epsilon for equal heights.

Each candidate neighbor is assigned a ranking tuple.

Ranking priority:

1. lower elevation
2. directional continuation
3. smallest angular deviation
4. canonical direction order
5. tile id

Conceptually:

```ts
rank = (
  h(next),
  turnCost(previousDirection, direction(current,next)),
  canonicalDirectionIndex(direction(current,next)),
  tileId(next)
)
```

Lower tuples rank higher.

---

# 6. Directional Inertia

When multiple candidates have equal elevation, streams prefer to continue in the same direction they were already traveling.

Tie-breaking behavior:

1. same direction
2. smallest angular deviation
3. canonical direction order

Turn costs:

| Turn | Cost |
|-----|-----|
| same direction | 0 |
| 45° | 1 |
| 90° | 2 |
| 135° | 3 |
| reverse | 4 |

The incoming direction to the tile determines the current travel direction.

---

# 7. Origin Step Behavior

At the origin tile there is no previous direction.

In that case candidate ordering becomes:

1. lowest elevation
2. canonical direction order
3. tile id

---

# 8. Cycle Handling

Streams must never terminate immediately upon encountering a cycle.

Instead the tracer performs deterministic backtracking.

If the next candidate would revisit a tile already in the current path:

- reject that candidate
- attempt the next ranked candidate

If all candidates for a tile are exhausted:

- backtrack to the previous tile
- continue searching from the next untried candidate there

The search continues until either:

- a valid terminal outcome is reached (`confluence` or `sink`)
- all reachable downstream candidates have been exhausted

Cycles therefore trigger **backtracking**, not immediate termination.

Cycle detection normally causes candidate rejection and backtracking.
Only failure of that deterministic resolution process should end in `terminalKind: "error"`.

---

# 9. Backtracking Algorithm

Conceptually the tracer performs a depth-first search with deterministic candidate ordering.

```ts
traceStream(origin):

  push origin
  mark origin visited

  while stack not empty:

    current = top of stack

    if terminal(current):
        return path

    for nextCandidate in orderedCandidates(current):

        if nextCandidate not yet tried:

            mark candidate tried

            if nextCandidate not in path:
                push nextCandidate
                mark visited
                continue search

    # no candidates left

    pop current
    unmark visited
```

The search ends only when:

- a valid terminal outcome is reached
- the search space is exhausted (which yields `terminalKind: "error"`)

---

# 10. Terminal Kinds

Terminal kinds describe only the kind of ending.

They do not encode stop reasons, tracing artifacts, or lake-specific semantics.

```ts
type StreamTerminalKind =
  | "confluence"
  | "sink"
  | "error"
```

Semantics:

- `confluence` means the traced path joins an already-established downstream stream path.
- `sink` means the traced path terminates without joining an already-established downstream stream path.
- `error` means the tracer failed to resolve a valid terminal outcome despite deterministic search/backtracking. This is not a normal hydrologic outcome; it is an unresolved tracing failure or contract-level error condition.

Lake semantics are deferred for now.

- Do not introduce a lake-specific terminal kind.
- Do not terminate merely because a tile is underwater.
- Streams continue through submerged/underwater tiles and terminate at the terminal leaf basin under the current model.
- "leaf basin" is treated as the current implementation interpretation of `sink`, not as a public terminal kind.

Cycle encounters do **not** normally produce terminal kinds; they are internal search events handled by deterministic backtracking.

`error` is only for unresolved failure cases, such as:

- a circuit/cycle that cannot be resolved by the backtracking search
- search exhaustion without producing a valid `confluence` or `sink`
- any equivalent unresolved internal failure where the stream cannot be assigned a valid hydrologic ending

---

# 11. Tile Stream Geometry Derivation

After all stream paths are computed, tile-level stream geometry is derived.

For each stream edge:

```text
(fromTile → toTile)
```

Derive:

- `outgoingDirection` for `fromTile`
- `incomingDirections` entry for `toTile`

Incoming directions must be sorted using canonical direction order.

If a tile has no outgoing edge it receives:

```ts
outgoingDirection = null
```

---

# 12. Design Goals

This model enforces several core properties:

### Determinism

All stream results must be reproducible given the same terrain.

### Plausible flow

Directional inertia encourages natural stream shapes.

### Robustness

Backtracking prevents artificial cycle termination.

### Clean data model

Tile-level geometry remains minimal.

Network-level structure lives in `features.streams`.

### Integration

Streams remain consistent with terrain topology and hydrology systems.

---

# End of Stream Network Model
