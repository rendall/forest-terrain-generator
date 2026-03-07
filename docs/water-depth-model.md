# Water Depth Model for Tile Outputs

This document captures the agreed hydrology model for water depth and basin water surface behavior.

## Core intent

The terrain model should represent water in a way that is physically intuitive for basin filling and directly useful for biome logic.

- Basins fill from low places upward.
- Filling is continuous, not binary (not just `empty` or `full`).
- Child basins fill before their parent basin starts filling.
- A basin-level water surface is the source of truth, and tile-level depth is derived from it.

## Basin hierarchy and fill order

Basins are nested.

### Child-connect threshold invariant

For a parent basin `P` with required child basins `C1..Cn`, define `T_connect(P)` as the first moment when every required child reaches its connecting/spill condition.

At `T_connect(P)`:

- each required child basin is full to its connection level;
- parent basin `P` has zero water volume;
- parent basin `P` has no emitted water-surface field (`waterSurfaceH` absent).

Allocation rule:

- Inflow up to and including `T_connect(P)` is consumed by child fill only.
- Only inflow strictly beyond `T_connect(P)` contributes to parent fill.
- Therefore parent fill onset is strict (`> T_connect(P)`), not inclusive (`>= T_connect(P)`).

This is intended to match intuitive behavior in small examples (for example, a 3×3 case with two low side dips and a shallower middle connector):

1. Small water amounts appear in the deepest child dips first.
2. More water raises those child surfaces.
3. At connection height, water links through the connector tile.
4. After connection, the shared surface rises and spreads to higher surrounding tiles only when that level is reached.

## Basin water surface field

The previous name `lakeSurfaceH` is replaced with **`waterSurfaceH`**.

- `waterSurfaceH` is a basin-level trait (one surface level per basin state).
- A dry basin has no water and should not emit a `waterSurfaceH` value.
- A partially filled basin has `waterSurfaceH` below its spill surface.
- A fully filled non-root basin has `waterSurfaceH` at spill surface.
- In ordinary map operation, root full-map saturation is an error condition (root spill capacity effectively zero while positive inflow still exists).

## Tile water depth

Tile depth is computed directly from basin water surface and terrain elevation.

```text
waterDepth = waterSurfaceH - h_tile
```

`waterDepth` is defined only when `waterSurfaceH` is present.

No clamp is applied.

Interpretation:

- `waterDepth > 0`: standing/surface water above ground.
- `waterDepth = 0`: water table exactly at ground.
- `waterDepth < 0`: water table below ground (subsurface/aquifer signal).

This gives one continuous hydrologic variable that supports both open-water classification and groundwater-informed biome behavior.

## Practical output semantics

- `waterSurfaceH` is authored/owned at basin level.
- Per-tile water quantity is `waterDepth`, derived from `waterSurfaceH` and tile `h`.
- If `waterSurfaceH` is absent, `waterDepth` is also absent.
- Basin membership alone must not imply that a tile has positive surface water.
- Positive, zero, and negative `waterDepth` are all meaningful and intentional.

## Computation contract

For each basin `B`, define:

* `V(B)` = water volume allocated to basin `B` after child-first allocation rules are applied
* `spillSurfaceH(B)` = the basin’s spill/connection surface height
* `tiles(B)` = the set of tiles governed by basin `B`
* `h(t)` = terrain elevation of tile `t`

For a candidate basin water surface height `hs`, define submerged storage:

```text
S_B(hs) = Σ max(0, hs - h(t))  for all t in tiles(B)
```

Normative rules:

1. If `V(B) <= 0`, basin `B` is dry and must not emit `waterSurfaceH`.
2. If `0 < V(B) < S_B(spillSurfaceH(B))`, basin `B` is partially filled and the implementation must solve for a unique `hs` such that:

```text
S_B(hs) = V(B)
```

and must emit:

```text
waterSurfaceH(B) = hs
```

3. If `V(B) = S_B(spillSurfaceH(B))`, basin `B` is exactly full to spill and must emit:

```text
waterSurfaceH(B) = spillSurfaceH(B)
```

4. If `V(B) > S_B(spillSurfaceH(B))`, excess water must not remain assigned to basin `B`; it must propagate according to the basin hierarchy / downstream allocation rules.

This section is the missing bridge between “continuous filling” and actual computed basin surface.

---

## Partial-fill emission contract

Partial-fill behavior is not optional.

Normative rules:

1. A basin with `0 < V(B) < spillCapacity(B)` must emit basin-level `waterSurfaceH`.
2. Tiles governed by that basin must derive `waterDepth` from that basin-level surface even before the basin reaches spill.
3. Implementations must not restrict tile depth emission to only fully filled basins.
4. A binary `empty/full` interpretation is non-conformant.

This is the key section that would have blocked the loophole you ran into.

---

## Basin state location contract

Basin water state must be externally visible at basin level, not only in internal accounting.

Normative rules:

1. Basin-level hydrologic state must be emitted on `features.basins[]`.
2. If a basin has water, `features.basins[i].waterSurfaceH` must be present.
3. Internal accounting structures may exist, but they do not replace required basin-level output fields.
4. Tile outputs must be derivable from emitted basin state plus tile elevation.

That closes the “the state exists internally somewhere else” escape hatch.

---

## Tile governance rule for nested or overlapping basin membership

A tile may be associated with multiple basins through nesting, but exactly one basin governs its emitted water state at a given computation stage.

Normative rule:

* A tile’s `waterDepth` must be derived from the **deepest active basin that currently governs that tile**, where “active” means the basin has emitted `waterSurfaceH`.

Determinism rule:

* If multiple candidate basins could govern a tile, the tie-break must be deterministic and documented.
* The default rule is: choose the most specific nested basin first; if still ambiguous, choose by stable basin id ordering.

This section matters because otherwise nested basins can create silent ambiguity about which surface applies.

---

## Tile derivation contract

For each governed tile `t` in basin `B` with emitted `waterSurfaceH(B)`:

```text
waterDepth(t) = waterSurfaceH(B) - h(t)
```

Normative rules:

1. This derivation applies for dry-adjacent, partially filled, and fully filled basin states whenever `waterSurfaceH` is present.
2. No positive-only clamp is applied.
3. `waterDepth > 0`, `= 0`, and `< 0` are all valid outputs.
4. If `waterSurfaceH` is absent for the governing basin, `waterDepth` must also be absent.

This is partly already in your doc, but here it becomes explicitly tied to partial fill and governed tiles. 

---

## Conformance requirements

The implementation is not conformant unless tests cover all of the following cases:

### Required fixture classes

1. **Dry basin**

   * zero allocated volume
   * no `waterSurfaceH`
   * no emitted `waterDepth`

2. **Partially filled basin**

   * `0 < V(B) < spillCapacity(B)`
   * basin emits `waterSurfaceH`
   * at least one governed tile has derived `waterDepth`
   * implementation proves tile depth is emitted before full spill

3. **Exactly full to spill**

   * basin emits `waterSurfaceH = spillSurfaceH`
   * no unresolved ambiguity about child/parent handoff

4. **Child-first fill**

   * required children fill before parent onset
   * parent has no water before strict post-connect onset

5. **Nested basin governance**

   * overlapping membership resolves deterministically
   * emitted tile depth comes from the governing basin only

6. **Negative depth case**

   * a governed tile above `waterSurfaceH` emits negative `waterDepth` when the model intends groundwater signal

Normative rule:

* A change that preserves output shape but lacks these fixture classes is incomplete.

---

## Non-conformant implementation patterns

The following patterns violate this model:

* emitting basin `waterSurfaceH` only for fully filled basins
* deriving tile depth only when `isFilled === true`
* keeping basin water state only in internal accounting with no basin-level emission
* treating basin membership as equivalent to positive standing water
* allowing partial-fill intent in docs without a volume-to-surface solver
