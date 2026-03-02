# Proposal: Basin Fill and Overflow Propagation (v1)

Status: proposal (implementation-oriented, tunable)

Goal

- Use existing FD/FA + basin topology (spill edges, `mergeH`, parent links) to decide:
  1) which basins fill (standing water to spill level),
  2) which basins overflow to parent,
  3) which basins act as sinks that terminate incoming streams.
- Explicit policy target: use basin metadata plus basin accounting to classify each basin as either:
  - `sink basin` (stream terminates in-basin), or
  - `overflow carrier` (stream routes through the basin via spill edge to parent).

This is a basin-level policy layer. It must not mutate FD/FA generation.

Hydrology flow pipeline (v1)

1) Build basin topology (tree + spill edges).
2) Compute basin accounting (`externalInflow`, `totalInflow`, `spillCapacity`, `fillRatio`).
3) Determine which basins fill and which overflow.
4) Route streams:
   - non-filled basin: terminate as sink.
   - filled basin: route to spill edge and continue to parent.

Design constraints (v1)

- Keep FD/FA generation and lake policy decoupled.
- Use one fixed FD basis for accounting (recommended: `strict_local`) so inflow math is stable.
- Avoid parent double-counting when child overflow is added upward.

---

## Definitions

Tile fields (existing)

- `h(t)`: elevation
- `fd(t)`: flow direction (DIR8 or NONE)
- `fa(t)`: flow accumulation (area proxy; units depend on FA definition)

Basin fields (existing or derived)

- `basinId`
- `tiles(B)`: tile set membership
- `mergeH(B)`: merge/spill height (saddle height at first merge)
- `parentId(B)`: merge tree parent basin id (null for root)
- `spillEdge(B)`:
  - `childSpillFromTileId(B)`: tile inside B adjacent to connecting component (guaranteed in-basin)
  - `parentContactTileId(B)`: adjacent tile outside B (parent-side contact)
- `spillOutTileId(B)`: legacy/debug spill marker; useful for inspection but not a robust routing endpoint.

We assume spillEdge exists for all non-root basins. Root may or may not have an external outlet; treat as a special case.

Accounting basis (recommended)

- `FD_base` / `FA_base`: maps derived once with `sinkMode = strict_local` and used for all inflow accounting below.
- `overflow_guided` can still be used later for routing/visualization, but not for inflow accounting.

---

## Core computed quantities

### 1) Basin spill capacity: spillCapacity(B) (alias `C(B)`)

Interpretation:

- How much "fill" the basin can hold before water reaches spill level.

Definition:

- `spillCapacity(B) = C(B) = sum over t in tiles(B) of max(0, mergeH(B) - h(t))`

Notes:

- This is in "tile-height" units (height * tiles). It is a structural capacity proxy.

### 2) Basin external inflow: externalInflow(B) (alias `Iext(B)`)

Interpretation:

- Total upstream "supply" entering basin B from outside `tiles(B)`.

Definition:

- Consider directed `FD_base` edges u -> v where `fd(u)` points to neighbor v.
- Define a basin entry edge if:
  - `u ∉ tiles(B)` and `v ∈ tiles(B)` (crossing into B's tile set).

Optional safety guard:

- If tile-set membership for composites is not materialized directly, enforce equivalent logic by excluding edges from descendants of B when propagating `sum overflowExcess(child)` upward.

Then:

- `externalInflow(B) = Iext(B) = sum fa_base(u) over all qualifying entry edges (u -> v) into B`

Implementation detail:

- To avoid double counting, sum per source tile u (not per edge) or per edge, but ensure FD yields at most one out-edge per u.
- This counts all boundary-fed flow, including diffuse, because FA already aggregates upstream.

### 3) Total inflow including child overflow: totalInflow(B) (alias `I(B)`)

We define child overflow O(child) and add it to parent's inflow.

- `totalInflow(B) = I(B) = Iext(B) + sum overflowExcess(child) for child in children(B)`

### 4) Overflow excess out of basin: overflowExcess(B) (alias `O(B)`)

- `overflowExcess(B) = O(B) = max(0, k * totalInflow(B) - spillCapacity(B))`

Where:

- `k` is a global balancing factor (dimensionless) that maps the FA scale to the capacity scale.
  - Rationale: `I` is in FA-units; `C` is in height*tiles. Without a time/rainfall unit, they are not naturally commensurate.
  - `k` is the single knob to tune "how wet the world is".
  - In params, this is named `params.hydrology.lakeFill.wetnessScale` (default `1.0`).
  - In equations below, we keep using `k` as shorthand for that parameter.

### 5) Inflow/capacity ratio: fillRatio(B) (alias `R(B)`)

We expose a ratio for debugging/analysis:

- `fillRatio(B) = R(B) = (k * totalInflow(B)) / max(eps, spillCapacity(B))`

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
- tiles(B), mergeH(B)
- `FD_base`, `FA_base`, basinId per tile

Algorithm:

1) Precompute `externalInflow(B)` for all basins
   - Build `FD_base/FA_base` once with `sinkMode=strict_local`.
   - Iterate all tiles u with a valid `FD_base` neighbor v
   - For each basin B where `v ∈ tiles(B)`:
       - If `u ∉ tiles(B)`, then `externalInflow(B) += fa_base(u)`
   - Implementation tip: build a fast tile->basin-membership index so this remains linear in tiles.

2) Precompute `spillCapacity(B)` for all basins
   - For each basin B:
       spillCapacity(B) = C(B) = sum max(0, mergeH(B) - h(t)) for t in tiles(B)

3) Topologically process basins bottom-up
   - Compute postorder of basin tree (children before parent)
   - For each basin B in postorder:
       totalInflow(B) = I(B) = Iext(B) + sum overflowExcess(child)
       fillRatio(B) = R(B) = (k * totalInflow(B)) / max(eps, spillCapacity(B))
       isFilled(B) = (k * totalInflow(B) >= spillCapacity(B))  // boolean, v1
       overflowExcess(B) = O(B) = max(0, k * totalInflow(B) - spillCapacity(B))

4) Root handling
   - If parentId(root) == null:
       - If root has an external outlet concept (optional), route overflowExcess(root) outward.
       - Else treat as endorheic terminal: overflow is discarded or recorded as "excess".

---

## Basin classification: sink vs through (stream termination)

We define basin behavior based on fill status:

- If `isFilled(B) == false`:
  - Basin is a sink for its inflow.
  - Streams that reach its local minima terminate here (standing water does not reach spill).

- If `isFilled(B) == true`:
  - Basin is a through-basin (lake at spill height).
  - It carries flow to its spill edge and overflows to parent.
  - Outflow crossing for routing is `childSpillFromTileId(B) -> parentContactTileId(B)`.

Decision rule (normative for v1 proposal):

- Basin topology metadata (`parentId`, `mergeH`, spill-edge endpoints) provides structural routing context.
- Basin accounting (`externalInflow`, `totalInflow`, `spillCapacity`, `fillRatio`, `overflowExcess`) provides water-state context.
- The combined result determines the stream role of basin B:
  - sink role when `isFilled(B) == false`
  - overflow-carrier role when `isFilled(B) == true`.

Optional: define strength

- `throughStrength(B) = overflowExcess(B)` (how much overflow remains after filling)
- Larger O implies more persistent outflow behavior.

---

## Stream routing policy over basin state (v1)

Once fill state is computed:

- Route stream tiles by FD.
- On entering basin B:
  - if `isFilled(B) == false`: terminate in B (sink basin).
  - if `isFilled(B) == true`: route to `childSpillFromTileId(B)`, cross to `parentContactTileId(B)`, continue in parent.

Implementation note:

- Basin interior routing to `childSpillFromTileId` can use deterministic minimax connector pathing.
- This keeps through-basin behavior explicit without mutating base FD/FA generation.

---

## Water surface and per-tile depth (only if filled)

When a basin is filled (v1 boolean fill):

- Surface level: `L(B) = mergeH(B)`
- For tile t in basin B:
  - `depth(t) = max(0, L(B) - h(t))` if isFilled(B) else 0

This yields a deterministic "potential lake" depth map tied to supply.

Note:

- This v1 does not compute partial fill levels for `k*totalInflow < spillCapacity`. That can be added later:
  - `fillFrac = clamp(k*totalInflow / spillCapacity, 0, 1)`
  - `L = minH + fillFrac*(mergeH - minH)` (optional v2)

---

## Clean contract (v1)

- `FD_base` comes from `strict_local` and is used only for inflow accounting.
- `externalInflow(B)` / `Iext(B)` is computed once from boundary crossings `u ∉ tiles(B)` and `v ∈ tiles(B)`.
- `totalInflow(B)` / `I(B) = Iext(B) + sum overflowExcess(child)`.
- `isFilled(B)` / `filled(B) = (k * totalInflow(B) >= spillCapacity(B))`.
- `overflowExcess(B)` / `O(B) = max(0, k * totalInflow(B) - spillCapacity(B))`.
- Routing stays separate from accounting:
  - unfilled basin => terminate (sink basin)
  - filled basin => route to spill edge and continue to parent.

---

## Outputs (proposed)

Per-basin output (`basins-fill.json` or embedded in hydrology structure):

- `externalInflow` (`Iext`), `totalInflow` (`I`), `spillCapacity` (`C`), `fillRatio` (`R`), `isFilled` (`filled`), `overflowExcess` (`O`)
- `childSpillFromTileId`, `parentContactTileId`, `spillOutTileId`, `mergeH`, `parentId`

Per-tile optional outputs (`water-depth.json`):

- `depth(t)` (0 if basin not filled)
- optionally `lakeBasinId(t)` if depth > 0

---

## Determinism and invariants

- No randomness; all ties broken by tileId ordering when needed.
- Inflow accounting uses a fixed FD basis (`FD_base`, recommended `strict_local`).
- No dependence on stream masks.
- Never use `spillOutTileId` as routing destination; routing uses `childSpillFromTileId` (in-basin) + `parentContactTileId` (out-of-basin).
- Boundary inflow uses `FD_base` edges crossing `u ∉ tiles(B)` to `v ∈ tiles(B)`; no heuristic neighbor scans.
- Parent inflow uses `externalInflow + sum overflowExcess(child)` and must never count child-to-parent spill crossings as "external".

---

## Balancing factor k

Yes, `k` is likely needed unless FA and capacity are already aligned by construction.

Parameter mapping:

- `k = params.hydrology.lakeFill.wetnessScale`
- Suggested default: `1.0`

Recommended v1 approach:

1) Start with `k = 1`.
2) Compute distribution of `fillRatio` across basins on a few seeds.
3) Choose k so that:
   - a reasonable fraction of basins fill (not 0%, not 100%)
   - large basins rarely fill unless strongly supplied
4) Keep k as a single config parameter in params.json for tuning.

Alternative to k (if you want "no knob"):

- Normalize `totalInflow` and `spillCapacity` by map-level statistics:
  - `I' = totalInflow / median(totalInflow)`
  - `C' = spillCapacity / median(spillCapacity)`
  - `isFilled if I'/C' >= 1`
This removes explicit k but replaces it with implicit normalization. k is usually cleaner.

---

## Implementation notes / pitfalls

- Double counting: `Iext(B)` must be computed by outside-of-`tiles(B)` crossings. A naive `basinId(u) != basinId(v)` rule will overcount child-to-parent transitions.
- Basins with `spillCapacity(B)=0`: treat as trivially filled or trivially non-filled; define explicitly. Suggest: if `spillCapacity==0` and basin has spill edge, set `isFilled=true` and `overflowExcess = k * totalInflow`.
- Root basin without spill: classify as terminal lake if `isFilled`; else terminal sink.

---

## Acceptance test (concrete)

Given a sample map:

- Verify `Iext` is nonzero for basins that receive FD edges crossing from `u ∉ tiles(B)` to `v ∈ tiles(B)`.
- Verify child-to-parent spill crossings are not counted in parent `Iext`.
- Verify bottom-up computation yields stable results (same across runs).
- Verify a basin with `k * totalInflow < spillCapacity` is flagged as sink and has no overflow.
- Verify a basin with `k * totalInflow > spillCapacity` produces overflow that increases parent `totalInflow` and can flip parent `isFilled` state.
- Verify computed depths are nonnegative and only present when `isFilled`.
