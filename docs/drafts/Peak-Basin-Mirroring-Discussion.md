# Peak / Basin Mirroring Discussion

## Purpose

Capture the current design direction for peak topology work.

This is still a draft discussion document. It is not a contract and not an implementation checklist. Its purpose is to record the agreed direction clearly enough that later implementation planning can stay narrow and disciplined.

## Current Direction

Working direction from discussion:

- Peaks should be handled like basins.
- No more, no less.
- The work should be built in parallel without touching basin derivation.
- When a peak-side design question arises, basin behavior is the default guide.

In practice, that means:

- peak ownership should mirror basin-style dense ownership,
- peak composites should mirror basin composite `tileIds`,
- and current peak-side sparse ownership behavior should be treated as implementation drift rather than a desired semantic difference.

## Scope

This direction is intentionally narrow.

In scope:

- peak derivation,
- peak ownership projection,
- peak composite `tileIds`,
- existing topography outputs,
- peak behavior needed to mirror basin behavior.

Out of scope for this pass:

- biome implementation,
- new peak-only topology surfaces,
- consumer redesign,
- basin refactoring,
- hydrology changes,
- generic basin/peak abstraction.

## Guiding Principle

The guiding principle is simple:

- if basins do it, peaks should do it the same way unless a concrete peak-specific reason prevents that.

The current discussion does not identify such a reason for sparse peak ownership. So the draft direction is:

- basins do not cut ownership down to a sparse subset,
- therefore peaks should not either.

## Candidate Invariants For Later Implementation

These are candidate invariants for a later implementation pass. They are not yet approved implementation invariants.

1. For identical terrain input and seed, basin outputs remain unchanged.
2. For identical terrain input and seed, hydrology outputs remain unchanged.
3. For identical terrain input and seed, peak outputs remain deterministic.
4. Every tile has a peak-side owner, mirroring basin-style dense ownership.
5. Peak composite features serialize `tileIds`, mirroring basin composite behavior.
6. No new peak-specific serialized topology fields are introduced in this pass.

## Hardest Missing Step

The hardest missing step is giving every tile a deterministic peak owner while preserving the peak merge tree and keeping basin logic untouched.

That is the core problem to solve. Other peak issues matter only insofar as they block that result.

What would prove this is solved:

- every tile receives a peak `featureId`,
- peak composites carry `tileIds`,
- repeated runs remain deterministic,
- and basin and hydrology outputs remain unchanged.

## Current Mirror Violations

These are the specific ways the live peak path still differs from the basin model.

### 1. Peak ownership is sparse instead of dense

Current peak projection only gives ownership to a minority of tiles.

That differs from basin behavior, where every tile receives a basin-side owner relation.

### 2. Peak composites do not carry `tileIds`

Current basin composites serialize `tileIds`.

Current peak composites do not.

That is a direct mirror break and prevents peak composite ancestry from projecting back onto tiles the same way basin ancestry does.

### 3. Peak feature construction is not shaped like basin feature construction

The active basin path constructs ownership and feature structure inline during the sweep.

The current peak path computes merge events first and then builds the feature tree afterward.

This does not necessarily need to be solved by refactoring basins. It does, however, explain why the peak path currently does not behave like a direct basin mirror.

### 4. Shared node persistence remains basin-signed

`persistence` is a legacy signal and not the main topology surface we care about for this work.

Even so, the shared helper still applies basin-signed node persistence to peaks. That is another sign that peak behavior has drifted away from a true mirror.

## Current Working Read

The current peak system is not primarily failing at detection.

The main failure is projection:

- peaks do not currently project ownership the way basins do,
- peak composites do not project tile membership the way basin composites do,
- and the result is that peak topology is much less usable as a tile relation surface.

So the design direction is not to add new semantics. It is to make peaks use the same ownership and projection model that basins already use.

## What Remains False

- This document is still a draft discussion, not an approved implementation contract.
- The live code still gives sparse peak ownership rather than basin-style dense ownership.
- The live code still omits peak composite `tileIds`.
- The live code still uses a peak path that is not yet shaped like a basin mirror.
- No implementation tests exist yet for the candidate invariants above.
