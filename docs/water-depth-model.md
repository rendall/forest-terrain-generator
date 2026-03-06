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
- A fully filled basin has `waterSurfaceH` at spill surface.

## Tile water depth

Tile depth is computed directly from basin water surface and terrain elevation.

```text
waterDepth = waterSurfaceH - h_tile
```

No clamp is applied.

Interpretation:

- `waterDepth > 0`: standing/surface water above ground.
- `waterDepth = 0`: water table exactly at ground.
- `waterDepth < 0`: water table below ground (subsurface/aquifer signal).

This gives one continuous hydrologic variable that supports both open-water classification and groundwater-informed biome behavior.

## Practical output semantics

- `waterSurfaceH` is authored/owned at basin level.
- Per-tile water quantity is `waterDepth`, derived from `waterSurfaceH` and tile `h`.
- Basin membership alone must not imply that a tile has positive surface water.
- Positive, zero, and negative `waterDepth` are all meaningful and intentional.
