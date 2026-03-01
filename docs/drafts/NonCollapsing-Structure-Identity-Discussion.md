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

- `featureIds: string[]` (basin + peak IDs that include this tile)
- optional `activeFeatureIds: string[]` for selected persistence-cut composites

---

## Draft Output Shape (Adopted for Discussion)

Use a `features` section with explicit arrays (not dynamic object keys like `basin0`):

```json
{
  "features": {
    "basins": [
      {
        "id": "b_00012",
        "parentId": "b_00004",
        "childIds": ["b_00019", "b_00020"],
        "birthH": 0.03,
        "mergeH": 0.22,
        "persistence": 0.19,
        "minH": 0.03,
        "maxH": 0.21,
        "kind": "composite",
        "size": 47,
        "bbox": { "minX": 10, "minY": 4, "maxX": 18, "maxY": 11 }
      },
      {
        "id": "b_00019",
        "parentId": "b_00012",
        "childIds": [],
        "birthH": 0.05,
        "mergeH": 0.11,
        "persistence": 0.06,
        "minH": 0.05,
        "maxH": 0.11,
        "kind": "leaf",
        "size": 6,
        "bbox": { "minX": 12, "minY": 6, "maxX": 14, "maxY": 8 },
        "tileIds": [401, 402, 433, 434, 465, 466]
      }
    ],
    "peaks": []
  }
}
```

Adopted storage rule:

- leaf/local nodes include `tileIds`
- composite nodes do not include `tileIds`
- all nodes include `size`, `bbox`, `minH`, and `maxH`
- tiles include `featureIds` arrays in standard `out.json`

Why:

- avoids repeating huge tile lists across parent composites
- keeps local features inspectable and traceable
- keeps output size manageable

---

## Determinism Rules For Features

To keep outputs stable across runs:

- Assign IDs by deterministic sweep order with row-major tie-breaks.
- Sort `childIds` lexicographically (or by node numeric ID).
- Emit `basins` and `peaks` arrays sorted by numeric ID ascending.
- Compute `bbox` from node membership with inclusive bounds.

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
5. Add feature IDs to tiles in `out.json`; expose full trees first in debug outputs, then promote to standard output when stable.

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

## Decisions (Locked)

1. Standard `out.json` includes feature IDs on tiles (`featureIds` array).
2. Leaf/local nodes keep `tileIds`; composite/trunk nodes do not.
3. Persistence cut selects composite nodes only; leaf inclusion is not cut-driven.
4. Phase 1 includes both basin and peak feature trees.
