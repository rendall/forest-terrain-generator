# Structure Grab Scalar (Discussion)

## Goal

Introduce exactly one scalar that controls how aggressively basin/peak structures are merged.

- Lower value: less grabby, more distinct basins/hills.
- Higher value: more grabby, fewer larger merged features.

No additional user-facing feature flags in this proposal.

---

## Problem (Current Feel)

Current structure output in `out.json` is intentionally compact:

- `basinPersistence`
- `peakPersistence`
- `basinLike`
- `ridgeLike`

This can feel "grabby" because the effective grouping level is fixed. You can see multiple meaningful hollows/hills in the map, but the final classification can collapse them too early into broader regions.

---

## Single Scalar Proposal

Add one parameter (working name):

`topography.structure.grab`

Range:

- `0.0` = least grabby (preserve more distinct structures)
- `1.0` = most grabby (merge structures more aggressively)

Suggested default:

- `0.35` (biased toward preserving distinct features)

---

## Core Idea

Do not change base topology generation.  
Use `grab` as a **cut level** on the existing basin/peak merge hierarchy.

Conceptually:

1. Build basin and peak merge trees (already implicit in sweep/merge logic).
2. Compute a persistence cutoff from `grab`.
3. Collapse components below that cutoff into parent components.
4. Classify tiles from the surviving components.

Result:

- one scalar controls both basin and peak coarseness
- fewer arbitrary hard-coded booleans
- more predictable tuning behavior

---

## Mapping Grab -> Cutoff

Let `g = grab in [0,1]`.

Compute basin and peak persistence distributions for the map, then map `g` to a persistence cutoff:

- low `g` -> low cutoff -> keep more components (less merging)
- high `g` -> high cutoff -> keep fewer components (more merging)

Practical mapping:

- `cutoff = lerp(P20, P80, g)`

where `P20/P80` are percentiles of component persistence in this map.

Why percentile-based:

- self-scales across seeds/sizes
- avoids brittle absolute thresholds

---

## Minimal Implementation Path

1. Keep existing structure pass outputs and internal merge process.
2. Add `grab` param read/validation/default.
3. During structure classification stage:
   - compute cutoff from `grab`
   - mark surviving basin components (`persistence >= cutoff`)
   - mark surviving peak components (`persistence >= cutoff`)
   - assign `basinLike` / `ridgeLike` from surviving components
4. Keep `out.json` compact as-is (no extra fields required for this change).

---

## Expected Behavior

- `grab = 0.0`: many localized hollows/hills retained.
- `grab = 0.5`: balanced grouping.
- `grab = 1.0`: broad merged valley/ridge systems dominate.

This directly targets "too grabby" behavior with a single control.

---

## Risks / Notes

- If persistence distribution is extremely narrow, percentile cuts may move little.
  - Mitigation: fallback min/max spread guard in code.
- Very noisy maps can still produce fragmented shapes at very low `grab`.
  - This is expected; low `grab` favors separation.

---

## Discussion Questions

1. Is `grab` the right user-facing name, or should it be `mergeAggressiveness`?
2. Default value preference: `0.35` vs `0.5`?
3. Should this scalar affect only view/classification, or also downstream hydrology/ecology consumers?

