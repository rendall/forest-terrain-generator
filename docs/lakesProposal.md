# Proposal: Basin Fill and Overflow Propagation (v1)

Status: proposal (implementation-oriented, tunable)

Goal

- Use existing FD/FA + basin topology (spill edges, spillH, parent links) to decide:
  1) which basins fill (standing water to spill level),
  2) which basins overflow to parent,
  3) which basins act as sinks that terminate incoming streams.

This is a basin-level policy layer. It must not mutate FD/FA generation.

---

## Definitions

Tile fields (existing)

- `h(t)`: elevation
- `fd(t)`: flow direction (DIR8 or NONE)
- `fa(t)`: flow accumulation (area proxy; units depend on FA definition)

Basin fields (existing or derived)

- `basinId`
- `tiles(B)`: tile set membership
- `spillH(B)`: spill height (merge level / saddle height)
- `parentId(B)`: merge tree parent basin id (null for root)
- `spillEdge(B)`:
  - `spillFromTileId(B)`: tile inside B adjacent to connecting component (guaranteed in-basin)
  - `spillToTileId(B)`: adjacent tile outside B (typically parent-side contact)

We assume spillEdge exists for all non-root basins. Root may or may not have an external outlet; treat as a special case.

---

## Core computed quantities

### 1) Basin capacity to spill: C(B)

Interpretation:

- How much "fill" the basin can hold before water reaches spill level.

Definition:

- `C(B) = sum over t in tiles(B) of max(0, spillH(B) - h(t))`

Notes:

- This is in "tile-height" units (height * tiles). It is a structural capacity proxy.

### 2) Basin boundary inflow from outside: I0(B)

We use Option A (general boundary inflow, not stream-masked).

Interpretation:

- Total upstream "supply" entering basin B across its boundary, based on FD edges.

Definition:

- Consider directed FD edges u -> v where `fd(u)` points to neighbor v.
- Define a basin entry edge if:
  - `basin(u) != B` and `basin(v) == B` (crossing from outside into B)

Then:

- `I0(B) = sum fa(u) over all entry edges (u -> v) into B`

Implementation detail:

- To avoid double counting, sum per source tile u (not per edge) or per edge, but ensure FD yields at most one out-edge per u.
- This counts all boundary-fed flow, including diffuse, because FA already aggregates upstream.

### 3) Total inflow including child overflow: I(B)

We define child overflow O(child) and add it to parent's inflow.

- `I(B) = I0(B) + sum O(child) for child in children(B)`

### 4) Overflow out of basin: O(B)

- `O(B) = max(0, k * I(B) - C(B))`

Where:

- `k` is a global balancing factor (dimensionless) that maps the FA scale to the capacity scale.
  - Rationale: `I` is in FA-units; `C` is in height*tiles. Without a time/rainfall unit, they are not naturally commensurate.
  - `k` is the single knob to tune "how wet the world is".
  - v1 can set `k = 1` and tune later.

### 5) Inflow/capacity ratio: R(B)

We expose a ratio for debugging/analysis:

- `R(B) = (k * I(B)) / max(eps, C(B))`

Where `eps` prevents divide-by-zero for degenerate basins.

Interpretation:

- `R < 1` implies not enough supply to fill to spill
- `R ~= 1` marginal fill
- `R > 1` fill + overflow

---

## Leaf-to-parent fill algorithm (bottom-up)

We compute fill/overflow in basin-tree order, from leaves upward.

Input prerequisites:

- Basin tree: children(B), parentId(B)
- spillEdge(B) for non-root basins
- tiles(B), spillH(B)
- fa, fd, basinId per tile

Algorithm:

1) Precompute `I0(B)` for all basins
   - Iterate all tiles u with a valid FD neighbor v
   - Let Bu = basin(u), Bv = basin(v)
   - If Bu != Bv:
       I0(Bv) += fa(u)

2) Precompute `C(B)` for all basins
   - For each basin B:
       C(B) = sum max(0, spillH(B) - h(t)) for t in tiles(B)

3) Topologically process basins bottom-up
   - Compute postorder of basin tree (children before parent)
   - For each basin B in postorder:
       I(B) = I0(B) + sum O(child)
       R(B) = (k *I(B)) / max(eps, C(B))
       filled(B) = (k* I(B) >= C(B))  // boolean, v1
       O(B) = max(0, k * I(B) - C(B))

4) Root handling
   - If parentId(root) == null:
       - If root has an external outlet concept (optional), route O(root) outward.
       - Else treat as endorheic terminal: overflow is discarded or recorded as "excess".

---

## Basin classification: sink vs through (stream termination)

We define basin behavior based on fill status:

- If `filled(B) == false`:
  - Basin is a sink for its inflow.
  - Streams that reach its local minima terminate here (standing water does not reach spill).

- If `filled(B) == true`:
  - Basin is a through-basin (lake at spill height).
  - It carries flow to its spill edge and overflows to parent.
  - Outflow tile for visualization/routing is `spillFromTileId(B) -> spillToTileId(B)`.

Optional: define strength

- `throughStrength(B) = O(B)` (how much overflow remains after filling)
- Larger O implies more persistent outflow behavior.

---

## Water surface and per-tile depth (only if filled)

When a basin is filled (v1 boolean fill):

- Surface level: `L(B) = spillH(B)`
- For tile t in basin B:
  - `depth(t) = max(0, L(B) - h(t))` if filled(B) else 0

This yields a deterministic "potential lake" depth map tied to supply.

Note:

- This v1 does not compute partial fill levels for `k*I < C`. That can be added later:
  - `fillFrac = clamp(k*I / C, 0, 1)`
  - `L = minH + fillFrac*(spillH - minH)` (optional v2)

---

## Outputs (proposed)

Per-basin output (`basins-fill.json` or embedded in hydrology structure):

- `I0`, `I`, `C`, `R`, `filled`, `O`
- `spillFromTileId`, `spillToTileId`, `spillH`, `parentId`

Per-tile optional outputs (`water-depth.json`):

- `depth(t)` (0 if basin not filled)
- optionally `lakeBasinId(t)` if depth > 0

---

## Determinism and invariants

- No randomness; all ties broken by tileId ordering when needed.
- No dependence on stream masks.
- Never use `spillTileId` as "must belong to basin"; routing uses `spillFromTileId` (in-basin) + `spillToTileId` (out-of-basin).
- Boundary inflow `I0` uses FD edges crossing basin boundary; no heuristic neighbor scans.

---

## Balancing factor k

Yes, `k` is likely needed unless FA and capacity are already aligned by construction.

Recommended v1 approach:

1) Start with `k = 1`.
2) Compute distribution of R across basins on a few seeds.
3) Choose k so that:
   - a reasonable fraction of basins fill (not 0%, not 100%)
   - large basins rarely fill unless strongly supplied
4) Keep k as a single config parameter in params.json for tuning.

Alternative to k (if you want "no knob"):

- Normalize I and C by map-level statistics:
  - `I' = I / median(I)`
  - `C' = C / median(C)`
  - `filled if I'/C' >= 1`
This removes explicit k but replaces it with implicit normalization. k is usually cleaner.

---

## Implementation notes / pitfalls

- Double counting: ensure boundary inflow sums over u tiles with out-edge into B. FD is single out-edge per tile, so this is stable.
- Basins with C(B)=0: treat as trivially filled or trivially non-filled; define explicitly. Suggest: if C==0 and has spill edge, set filled=true and O=k*I.
- Root basin without spill: classify as terminal lake if filled; else terminal sink.

---

## Acceptance test (concrete)

Given a sample map:

- Verify `I0` is nonzero for basins that receive FD edges from outside.
- Verify bottom-up computation yields stable results (same across runs).
- Verify a basin with `k*I < C` is flagged as sink and has no overflow.
- Verify a basin with `k*I > C` produces overflow that increases parent's I and can flip parent's filled state.
- Verify computed depths are nonnegative and only present when filled.
