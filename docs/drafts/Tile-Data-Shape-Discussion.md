# Tile Data Shape Discussion

## Purpose

Describe, in one place, how tile and related metadata fields should be shaped so that:

- payloads remain minimal and non-redundant,
- field semantics are explicit and stable for downstream consumers,
- debug/recompute behavior is deterministic and explainable, and
- contract evolution (renames, deprecations, provenance, metadata additions) can be planned without drift.

Hydrology source policy is one part of this discussion, not the whole scope.

## Release Context

- This discussion targets the next major release (`v2`) as a breaking schema revision.
- Backward compatibility with `v1` payloads is not a contract requirement.
- Migration aids can still be added for convenience, but are optional and secondary to a clean v2 shape.

## Problem Statement

The current tile/envelope contract has drift in multiple dimensions:

1. Field meaning drift: some fields are redundant, low-signal, or no longer aligned with current algorithms.
2. Source-of-truth drift: envelope-carried data and debug/recomputed data can diverge without clear provenance.
3. Shape drift: naming and placement of fields (tile vs feature vs metadata) are inconsistent across use cases.
4. Evolution drift: deprecations/renames are not yet organized around a clear contract migration path.

Net effect:

- downstream consumers must infer intent from unstable signals,
- debug output can be surprising or non-reproducible,
- and contract growth risks accumulating cruft.

### Problem: hydrology debug detached from output files

Current behavior can ignore user intent in a common workflow:

1. User generates `forest.json` with hydrology-related params.
2. User runs debug against that file (`debug --input-file forest.json`).
3. Hydrology is recomputed from envelope topology using default/available params, not necessarily the original hydrology contract implied by the envelope.

This creates output drift and makes debugging non-reproducible from the user perspective.

#### Proposal: Hydrology source policy and contract checks

- Source mode for debug/hydrology-inspector behavior:
  - `auto` (default)
  - `envelope`
  - `recompute`

- `auto`:
  - If envelope is hydrology-complete, use envelope hydrology.
  - Else recompute from topology + params.

- `envelope`:
  - Require complete hydrology fields on all tiles.
  - Fail fast if incomplete.

- `recompute`:
  - Always recompute hydrology maps from topology + params.

#### Proposal: Hydrology-complete tile shape

Per tile, under `tile.hydrology`:

- Core required fields:
  - `fd: number` (DIR8 code or `255` sink)
  - `fa: number`
  - `faN: number`
  - `hasStream?: true`
- Optional lake/surface fields:
  - `waterDepth?: number`
  - `basinId?: string`

Water-depth semantics (discussion target):

- `waterDepth` is signed relative to local basin water surface:
  - `> 0`: submerged,
  - `= 0`: shoreline/surface intersection,
  - `< 0`: above water surface but near/within the same water-bearing basin context.
- `waterDepth` is emitted only for tiles in a basin context that currently has water.
  - no water-bearing context -> omit `waterDepth`.
- `basinId` is emitted whenever `waterDepth` is emitted.
  - (discussion invariant, not yet enforced in code)

Hydrology completeness levels:

- Level 0: none
- Level 1: partial
- Level 2: complete (all core fields valid on all tiles)

Only Level 2 is eligible as direct source when source mode uses envelope data.

Validation for hydrology-complete envelopes:

- `fd` integer in `{0..7, 255}`
- `fa` finite and non-negative
- `faN` finite
- `hasStream` when present must be `true` (absence means no stream on the tile)

#### Proposal: Hydrology provenance in debug outputs

- Include:
  - `hydrologyMapsSource: "envelope" | "recomputed"`
  - `hydrologySourceMode: "auto" | "envelope" | "recompute"`
  - recompute context (`sinkMode`, key params such as `lakeFill.wetnessScale`)

#### Proposal: Persist envelope params delta for replay/debug

- At `forest.json` creation time, include a top-level `paramOverrides` object that contains only values that differ from defaults.
- Place this field after `tiles` in serialized object order.
- Intended use:
  - tells consumers how this envelope was generated,
  - gives debug/replay tools the parameter context without requiring external files.
- Debug behavior proposal:
  - when `debug --input-file` is used, use envelope `paramOverrides` as recompute input context.
  - precedence (discussion target): defaults -> `paramOverrides` -> explicit CLI overrides (if enabled for that mode).

### Problem: topology tile signals are low-value or stale

Some tile-level topology fields no longer provide reliable standalone signal:

- `basinPersistence` is frequently null/unresolved in current behavior.
- `basinLike` can collapse to near-constant values in practice.
- `ridgeLike` can be redundant with persistence-style fields.
- `peakPersistence` at tile level can be interpreted inconsistently against direct height/elevation fields.

This leaves consumers with fields that appear authoritative but are weakly informative.

#### Proposal C: Remove `topography.structure.basinLike`

- Current field: `tile.topography.structure.basinLike: boolean`
- Discussion rationale:
  - Observed as non-informative in current data.
  - Adds contract surface without clear decision value.

#### Proposal D: Remove `topography.structure.ridgeLike`

- Current field: `tile.topography.structure.ridgeLike: boolean`
- Discussion rationale:
  - Appears redundant when persistence-style peak signal exists.
  - Does not add independent information if correlated.

#### Proposal E: Remove `topography.structure.basinPersistence`

- Current field: `tile.topography.structure.basinPersistence: number | null`
- Discussion rationale:
  - Previously treated as moisture/shallowness proxy.
  - No longer reliable in current structure semantics.
- Discussion direction:
  - Remove tile-level `basinPersistence`.
  - Use explicit hydrology/lake fields for wetness and shallow-water interpretation.

#### Proposal F: Remove `topography.structure.peakPersistence`

- Current field: `tile.topography.structure.peakPersistence: number | null`
- Discussion rationale:
  - Prominence-style metric, not direct peak height.
  - Limited tile-level value when direct elevation exists.
  - Not used by current hydrology model input.
- Discussion direction:
  - Remove tile-level `peakPersistence`.
  - Keep prominence metrics at feature level if needed.

### Problem: tile payload duplicates feature relationships

Feature membership is represented in both tile fields and feature objects:

- `featureIds` and `activeFeatureIds` on tiles,
- parent/child structure and tile membership in feature collections.

This duplication creates drift risk and a larger payload without a single clearly-declared canonical source.

#### Proposal A: Remove `featureIds` from tile payload

- Current field: `tile.featureIds: string[]`
- Discussion rationale:
  - Duplicates feature membership derivable from feature objects.
  - Increases payload size and drift risk.
- Discussion direction:
  - Prefer feature-centric membership as canonical source.
  - If fast tile lookup is needed, expose an index/debug artifact.

#### Proposal B: Remove `activeFeatureIds` from tile payload

- Current field: `tile.activeFeatureIds: string[]`
- Discussion rationale:
  - Similar duplication/drift risk as `featureIds`.
  - Semantics are less stable for long-term contract consumers.
- Discussion direction:
  - Keep as derived/debug concept, not persistent tile contract field.

### Problem: naming semantics leak implementation intent

Some names communicate ambiguous intent at the contract level:

- stream-presence naming can be read as identity/classification rather than presence.
- mixed use of per-tile signals and derived classifications can encourage downstream over-interpretation.

This makes domain modeling harder for consumers and increases naming churn pressure.

#### Proposal H: Stream-presence naming in v2 contract

- v2 canonical field name: `tile.hydrology.hasStream: boolean`.
- `isStream` is not part of the v2 tile shape.
- Discussion rationale:
  - `hasStream` communicates presence intent more clearly than identity-style naming.

#### Proposal I: Explicit stream flow directions per stream tile

- `fa` is accumulation magnitude and does not encode per-tile stream directionality.
- For tiles where `hasStream === true`, add directional fields:
  - `inStreamDir?: number[]`
  - `outStreamDir?: number`

- Presence rules:
  - if `hasStream === false`: omit `inStreamDir` and `outStreamDir`
  - if `hasStream === true`:
    - include `inStreamDir` only when one or more inflow directions exist,
    - include `outStreamDir` only when an outflow direction exists.

- Notes:
  - `inStreamDir` can contain multiple directions at confluences.
  - `outStreamDir` is expected to be single-valued in current flow model.
  - either field may be absent in valid cases (for example headwater/start or terminal sink/outlet edges).
  - this keeps directional topology explicit without forcing placeholder values.

### Problem: elevation frame-of-reference is split

Elevation context is not fully centralized in metadata:

- tiles carry both normalized `h` and explicit `elevationMeters`,
- envelope metadata currently lacks a full z-axis contract (`h0/h1/zMinMeters/zMaxMeters`).

Without a clear elevation contract, derivability and provenance are implicit rather than explicit.

#### Proposal G: Elevation z-axis metadata contract

- Discussion goal:
  - Move elevation frame-of-reference to envelope metadata and reduce per-tile redundancy.

- Proposed metadata shape:

```json
"meta": {
  "specVersion": "forest-terrain-v2",
  "elevation": {
    "h0": 80,
    "h1": 300,
    "zMinMeters": 50,
    "zMaxMeters": 270
  }
}
```

- Field semantics:
  - `h0`: meters at normalized `h=0`
  - `h1`: meters at normalized `h=1`
  - `zMinMeters`: realized map minimum elevation
  - `zMaxMeters`: realized map maximum elevation

- Discussion direction:
  - Keep `tile.topography.h` as canonical scalar.
  - Treat `tile.topography.elevationMeters` as derivable from `h + meta.elevation`.
  - v2 intent: remove `tile.topography.elevationMeters` from tile payload and derive it from `h` plus `meta.elevation`.

### Problem: contract evolution lacks explicit migration framing

Several fields are now discussion candidates for rename/removal/deprecation, but migration rules are not yet formalized:

- what is in/out of the v2 canonical contract,
- how optional migration aids should behave (if provided),
- contract versioning expectations for downstream consumers.

This increases the chance of accidental breaking changes during cleanup.

#### Cross-cutting migration proposals

- Define direct v2 canonical fields (no mandatory alias windows).
- Add explicit contract/version markers when cleanup lands (for example `tileContractVersion` / `hydrologyContractVersion`).
- Keep explicit open questions tracked:
  - If `featureIds`/`activeFeatureIds` are removed, what is the preferred replacement for tile->feature lookup (`index artifact`, `query CLI`, or `none`)?
  - Should a `tileContractVersion` or `hydrologyContractVersion` marker be added (or both)?

## Goals

- Define a stable tile hydrology shape for envelopes.
- Define exactly when debug uses envelope hydrology vs recomputation.
- Make source-of-truth visible in outputs.
- Define a clean v2 tile contract with minimal redundancy and explicit semantics.

## Non-Goals

- Redesign hydrology algorithms in this document.
- Define lake/river ecology semantics beyond data contract requirements.

## Working Example (v2 draft)

This is a discussion-only example of the proposed envelope shape after current changes.

```json
{
  "meta": {
    "specVersion": "forest-terrain-v2",
    "elevation": {
      "h0": 80,
      "h1": 300,
      "zMinMeters": 50,
      "zMaxMeters": 270
    }
  },
  "features": {
    "basins": [],
    "peaks": []
  },
  "tiles": [
    {
      "index": 1300,
      "x": 20,
      "y": 20,
      "topography": {
        "h": 0.4492555558681488,
        "r": 0.32,
        "v": 0.48,
        "structure": {}
      },
      "hydrology": {
        "fd": 7,
        "fa": 13,
        "faN": 0.030878860503435135,
        "hasStream": true,
        "inStreamDir": [6, 7],
        "outStreamDir": 7,
        "waterDepth": -0.11,
        "basinId": "b_00061"
      }
    },
    {
      "index": 1301,
      "x": 21,
      "y": 20,
      "topography": {
        "h": 0.36291322112083435,
        "r": 0.21,
        "v": 0.52,
        "structure": {}
      },
      "hydrology": {
        "fd": 255,
        "fa": 2,
        "faN": 0.005
      }
    }
  ],
  "paramOverrides": {
    "hydrology": {
      "sinkMode": "overflow_guided",
      "lakeFill": {
        "wetnessScale": 0.85
      }
    },
    "topography": {
      "structure": {
        "enabled": true
      }
    }
  }
}
```

Notes:

- `paramOverrides` is top-level and contains only non-default values.
- `elevationMeters` is intentionally omitted from tile shape in this v2 draft.
- `waterDepth` and `basinId` are emitted only for water-bearing basin context.
- `inStreamDir` is optional array; `outStreamDir` is optional single value.

## Working Schema Sketch (v2 draft)

```ts
type Dir8 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
type FdCode = Dir8 | 255;

interface EnvelopeV2Draft {
  meta: {
    specVersion: "forest-terrain-v2";
    elevation: {
      h0: number;
      h1: number;
      zMinMeters: number;
      zMaxMeters: number;
    };
  };
  features: {
    basins: unknown[];
    peaks: unknown[];
  };
  tiles: TileV2Draft[];
  paramOverrides?: Record<string, unknown>;
}

interface TileV2Draft {
  index: number;
  x: number;
  y: number;
  topography: {
    h: number;
    r: number;
    v: number;
    structure?: Record<string, unknown>;
  };
  hydrology?: {
    fd: FdCode;
    fa: number;
    faN: number;
    hasStream?: true;
    inStreamDir?: Dir8[];
    outStreamDir?: Dir8;
    waterDepth?: number;
    basinId?: string;
  };
}
```
