# Streamflow Pipeline Integration Plan (v1-draft)

Status: v1-draft
Owner: Terrain generation team
Purpose: Convert the currently refined stream CLI algorithm into a production pipeline stage while preserving determinism and existing contracts.

---

## 1) Context

We used the Stream CLI as a proving ground for routing logic and basin overflow behavior. The current goal is to migrate from "single-source debug tool" to a deterministic, full-map hydrology stage that can feed downstream terrain/ecology outputs.

This document proposes a concrete, reviewable design before implementation.

---

## 2) Goals and Non-Goals

### Goals

- Keep current single-source trace behavior available for diagnostics.
- Introduce full-map flow accumulation suitable for stream-size classification.
- Preserve deterministic outputs for fixed inputs/seed.
- Integrate into existing pipeline outputs without breaking current consumers.
- Support debug artifacts that explain routing and accumulation behavior.

### Non-Goals (initial rollout)

- Physically calibrated discharge units.
- Time-varying rainfall simulation.
- Sediment/erosion coupling in first integration pass.
- Multi-flow routing (D-infinity) in v1 integration.

---

## 3) Existing State (What we have now)

- **Single-source downhill trace** with deterministic tie-breaks.
- **Stop reasons**: sea level, local minimum, max steps.
- **Optional overflow post-pass** using basin metadata links.
- **Diagnostic JSON + PPM overlay** for path and overflow segments.

This is excellent for debugging route correctness, but it is not yet a complete full-map discharge/flow accumulation product.

---

## 4) Proposed Target Architecture

Add a dedicated hydrology stage in the generation/derive pipeline:

1. **Flow Direction (FD) map**
   - One deterministic D8 outflow target per tile (or NONE at sinks).
2. **Flow Accumulation (FA) map**
   - Number of contributing cells reaching each tile.
   - Optional normalized FA (`faN`) for thresholding/debug display.
3. **Stream Extraction map**
   - Boolean stream mask from FA threshold policy.
4. **Optional water class map updates**
   - Mark stream/lake/pool based on topography + basin data + thresholds.

The Stream CLI remains a targeted inspection tool that can query/visualize these pipeline products.

---

## 5) Algorithm Proposal (v1)

### 5.1 Routing model

- Use deterministic **D8 single-flow routing**.
- For each tile, select strictly downhill neighbor with lowest `h`.
- Stable tie-break preference for equal-height downhill candidates: (1) in direction of flow, (2) toward map center, (3) tile index.
- If no downhill neighbor exists, route = NONE (sink).

### 5.2 Sink handling policy

- Keep existing basin-aware overflow logic as a controlled post-pass capability.
- For accumulation v1, support two modes (configurable):
  - **strict_local**: sinks terminate flow.
  - **overflow_guided**: if basin spill links exist, continue through spill/parent contact.

### 5.3 Accumulation computation

- Initialize each cell with local contribution = `1`.
- Build in-degree from FD graph.
- Process in topological order (queue of in-degree zero).
- Propagate contribution downstream once per edge.

This yields deterministic `fa` in O(N) time after FD construction.

### 5.4 Stream extraction

- Derive `isStream` from `fa` using a policy (configurable):
  - absolute threshold (`fa >= T`), or
  - quantile threshold (`faN >= q`).
- Keep threshold defaults conservative to avoid over-marking tiny tributaries.

---

## 6) Data Contract Proposal

Use/complete existing hydrology SoA maps in the domain model:

- `fd`: flow direction code (DIR8/NONE)
- `fa`: accumulation count (uint32)
- `faN`: normalized accumulation (float)
- `isStream`: extracted stream mask
- existing lake/pool/water class fields as available

### Envelope compatibility strategy

To avoid breaking current envelope consumers:

- Keep existing tile schema unchanged in initial step.
- Emit hydrology artifacts first in debug output and internal pipeline outputs.
- Add tile-level hydrology fields only behind an explicit, versioned contract decision.

---


## 6.1) Specific Integration Mechanism (Pipeline Topology)

Yes — the intended integration path is the same pipeline flow used by other derived products.

Proposed new pipeline module:

- `src/pipeline/derive-hydrology.ts`

Proposed orchestration point:

- `src/app/run-generator.ts`, immediately after `deriveTopographicStructure(...)` and before envelope tile serialization.

Planned call sequence in `runGenerator`:

1. Resolve/generate base maps (`resolveBaseMaps`).
2. Derive topography (`deriveTopographyFromBaseMaps`).
3. Derive structure (`deriveTopographicStructure`).
4. **Derive hydrology (`deriveHydrology`)** from shape + `topography.h` + structure feature links/params.
5. Serialize envelope/debug outputs (initially debug/internal only for hydrology products).

The reason for this placement is that hydrology depends on finalized height/topography and (for overflow-guided mode) basin/feature relationships already produced by topographic structure.

## 7) Integration Plan (Phased)

### Phase A: Internal pipeline hydrology maps

- Compute FD/FA/FA-N/isStream maps inside pipeline.
- No public envelope contract changes yet.
- Add unit tests for deterministic FD/FA on small canonical maps.

### Phase B: Debug artifacts and observability

- Emit debug rasters/JSON summaries:
  - `fd.json`
  - `fa.json`
  - `fa-normalized.json`
  - `stream-mask.json`
- Add optional visualization helper output (PPM/PGM overlays).

### Phase C: Inspector planning (no implementation yet)

- Keep `stream` unchanged as the existing toy/experimental tracer.
- Plan a future `hydrology-inspector` CLI as a separate inspector surface, but do not implement it until approved.
- Design expectation for that future inspector: read pipeline hydrology maps when present, preserve single-source trace mode, and optionally report local accumulation at `(x,y)`.

### Phase D: Contract decision

- Decide whether to expose hydrology in envelope tiles directly.
- If yes, record via ADR + versioning/migration policy.

---

## 8) Determinism Requirements

Determinism must hold for:

- Neighbor ordering and tie-breaks.
- Queue ordering when processing same in-degree tier.
- Floating-point normalization procedure.
- Overflow traversal ordering through basin metadata.

Implementation note: document all ordering rules explicitly and lock with tests.

---

## 9) Test Strategy

- **Unit tests**
  - FD selection tie-breaks.
  - Sink behavior (strict_local vs overflow_guided).
  - FA propagation correctness on handcrafted grids.
- **Integration tests**
  - Pipeline emits expected hydrology debug artifacts.
  - Stream CLI remains backward-compatible for existing flags/outputs.
- **Determinism tests**
  - Repeated runs produce byte-identical outputs for same seed/inputs.

---

## 10) Risks and Mitigations

- **Risk:** Architectural drift between CLI routing and pipeline routing.
  - **Mitigation:** Shared core routing function used by both.
- **Risk:** Contract churn for downstream consumers.
  - **Mitigation:** Delay schema expansion; add ADR before public contract change.
- **Risk:** Over/under extraction of streams due to threshold choice.
  - **Mitigation:** Start with debug-first tuning and quantile-based fallback.

---

## 11) Resolved Decisions (v1)

The following decisions are now locked for this v1 draft:

1. **Sink handling default**: default to `strict_local`; allow `overflow_guided` via parameter setting.
2. **Stream extraction default**: use absolute `fa` thresholding by default.
3. **Inspector placement**: `hydrology-inspector` remains separate from the main CLI for initial rollout.
4. **Public envelope timing**: expose hydrology values in public tile schema after Phase C validation and just before Phase D.
5. **ADR timing**: write a dedicated ADR before entering Phase D (not before Phase A).

### Inspector flag planning note

When implemented, `hydrology-inspector` should include a sink-mode flag (for example `--sink-mode strict_local|overflow_guided`) so output can be compared across both routing modes from the same source input.

---

## 12) Suggested Immediate Next Step

If this v1 draft looks right, the next step is to execute a checklist-driven Phase A/Phase B implementation while keeping public envelope schema unchanged until the Phase C gate is complete.
