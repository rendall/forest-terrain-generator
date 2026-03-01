# Non-Collapsing Structure Identity (Discussion)

## Goal

Preserve local basin/peak identities after spill/merge events instead of collapsing to a single winner lineage.

---

## Problem

Current behavior is effectively winner-lineage classification:

- when two components merge, one lineage wins
- losing local components stop being independently classifiable

This causes visually distinct local hollows/hills to disappear from structure labels even when they are obvious in `h`.

---

## Proposed Direction

Use a non-collapsing merge tree:

- every local minimum/maximum remains a feature node
- merges create parent nodes (new composite features)
- child identities are never deleted

This keeps both:

- local features (small distinct blobs)
- composite features (larger merged systems)

---

## Core Model

For basins and peaks separately, represent features as a tree (or DAG if needed later):

- `node.id`
- `node.kind` (`basin` or `peak`)
- `node.birthH` (minimum/maximum level where node appears)
- `node.mergeH` (spill/saddle level where node merges upward)
- `node.persistence` (`mergeH - birthH`, with unresolved policy handling)
- `node.children[]` (local identities below this composite)
- `node.parentId` (optional for root)

Per tile, store assignment to at least one node:

- local identity (`localBasinId` / `localPeakId`)
- optional active/composite identity at selected cut level

---

## Classification Strategy

Do not force a single global winner lineage.

Instead:

1. Keep local-node labels available always.
2. Choose a persistence cut level that selects which nodes are “active.”
3. Derive `basinLike`/`ridgeLike` from active-node membership, while preserving local IDs for explainability.

This allows:

- “feature core” rendering
- broader feature rendering
- traceable transitions between both

---

## Why This Matches Human Perception Better

Humans see both:

- small distinct depressions/crests
- larger connected valleys/ridges

Collapsing lineage removes one of those scales. Non-collapsing identity keeps both scales available.

---

## Minimal Implementation Path

1. Keep current sweep/merge mechanics for ordering and merge levels.
2. Replace “loser discarded” lineage logic with node creation + parent linkage.
3. Add per-tile local node assignment arrays.
4. Add active-node selection helper for a chosen cut level.
5. Keep current compact `out.json` unchanged initially; expose richer tree/IDs in debug output first.

---

## Migration Considerations

- Existing boolean fields (`basinLike`, `ridgeLike`) can remain as derived outputs.
- Existing pipelines can continue consuming booleans while richer identity is introduced.
- No immediate requirement to change hydrology/ecology consumers until structure identity stabilizes.

---

## Risks

- More state and bookkeeping than winner-lineage DSU.
- Need deterministic tie-breaking for node IDs and parent selection.
- Need clear policy for unresolved roots (`mergeH` absent).

---

## Open Questions

1. Should standard `out.json` include local IDs now, or only debug artifacts first?
2. Should the persistence cut select active composite nodes only, or also influence local-node inclusion?
3. Do we need both basin and peak local IDs in phase one, or basin first then peak?
