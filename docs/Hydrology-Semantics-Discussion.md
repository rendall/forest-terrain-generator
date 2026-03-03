# Hydrology Semantics Discussion

## Status
Draft discussion document. Not an implementation directive.

## Purpose
Capture the current hydrology semantic mismatch in one place so future sessions can continue from shared context instead of partial memory.

## Scope
This document covers:
- basin topology vs hydrology interpretation,
- lake ownership semantics,
- map-exit semantics,
- accounting vs realized water state semantics,
- output contract implications.

It does not define final algorithms.

## Current System (Observed)
1. Basin topology is represented as a merge tree (leaf + composite nodes).
2. Lake accounting is computed per basin using:
   - `externalInflow`
   - `childOverflow` (sum of child `overflowExcess`)
   - `totalInflow = externalInflow + childOverflow`
   - `spillCapacity`
   - `fillRatio`, `isFilled`, `overflowExcess`, `role`
3. Tile lake fields are derived from filled basins by choosing a winning basin/depth assignment.
4. Map-exit support now exists via `receiverId` with `"OCEAN"` for root drainage when a boundary exit exists.

## Core Problem
The model is internally consistent but not yet semantically aligned with intuitive hydrology.

Symptoms:
1. Structural/composite basins can dominate tile lake ownership.
2. A tile can belong topographically to a local/low basin chain but get `lakeBasinId` from a higher-level composite receiver context.
3. Child overflow propagated up hierarchy can make high-level nodes appear hydrologically dominant.
4. There is no explicit, bounded per-run water budget; saturation behavior can be extreme relative to intuitive expectations.

Net effect:
- output fields can look physically implausible even if accounting is mathematically coherent.

## Example Snapshot (Current Output)
From `out/hydrology.json` (current local run):
- tile count: `4096`
- `lakeMask=true` tiles: `3872`
- unique `lakeBasinId` values: `3` (`null` + two basin IDs)
- dominant `lakeBasinId` owns most lake tiles (`3770` of `4096` total tiles)

Interpretation:
- ownership is highly concentrated; local basin signal is weak for many tiles.

## Conceptual Mismatch Identified
Two concepts are currently blended:
1. Structural topology nodes (merge/composite bookkeeping in the tree)
2. Hydrologically meaningful realized water owners (what downstream should interpret as actual water context)

This mismatch is now the central issue.

## Contract Semantics to Preserve
These discussion decisions are already aligned:
1. `waterDepth` should mean realized water depth (consumer-facing).
2. Any algorithmic/internal/unbounded metric should use a separate field (working name: `accountingWaterDepth` or `potentialWaterDepth`).
3. Downstream systems should rely on realized fields, not accounting internals.

## Open Questions
1. Lake ownership rule:
   - Should `lakeBasinId` represent local basin context, topmost filled owner, or both via separate fields?
2. Node eligibility:
   - Which basin-node kinds are eligible to own realized water?
3. Receiver semantics:
   - Is one global `OCEAN` receiver sufficient, and what metadata must be carried for location-specific exits?
4. Water forcing / budget semantics:
   - What explicit run-level forcing or budget is required so outputs have bounded physical meaning?
5. Output contract split:
   - Which fields are realized vs accounting, and which are debug-only?

## Non-Goals (For This Discussion)
1. Finalizing lake ecology behavior.
2. Finalizing stream-network feature labeling.
3. Finalizing performance or optimization strategy.

## Working Principle for Next Iteration
Do not treat mathematically valid accounting state as automatically equivalent to realized physical water state in output contracts.

## Readiness for Output Shape Work
Likely yes, with one caveat:
- we can proceed with output-shape changes if we explicitly separate realized fields from accounting/debug fields and keep uncertain semantics marked as provisional.

## Related Docs
- `docs/Tile-Data-Shape-Discussion.md`
- `docs/lakesProposal.md`
- `docs/featureDefinitionProposal.md`
