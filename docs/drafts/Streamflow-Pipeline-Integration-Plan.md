# Streamflow Pipeline Integration Plan (Discussion Draft)

Status: Draft for review
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
- Stable tie-break by index order.
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

### Phase C: Stream CLI re-alignment

- Make stream CLI read pipeline hydrology maps when present.
- Preserve current single-source tracing mode for route introspection.
- Add command mode for reporting local accumulation at `(x,y)`.

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

## 11) Open Questions for Review

1. Should v1 default to `strict_local` or `overflow_guided` accumulation?
2. Do we want thresholding by absolute `fa` or by quantile `faN` as default?
3. Should stream CLI become a subcommand of main CLI long-term, or remain separate?
4. At what phase should hydrology values become part of public envelope tile schema?
5. Do we want a dedicated ADR before Phase A or only before Phase D?

---

## 12) Suggested Immediate Next Step

If this plan looks right, next step is to approve **Phase A only** for implementation:

- internal FD/FA computation,
- tests,
- no public contract changes.

That lets us validate correctness and determinism before deciding schema exposure.
