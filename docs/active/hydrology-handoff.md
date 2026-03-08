# Hydrology System Handoff

This document captures the **current working state of the hydrology system**, the invariants that must not be broken, and the safe workflow rules for future changes.

It exists so new contributors or AI agents can continue work without needing the full historical conversation that led to the current implementation.

---

# 1. Current Model Truth

The hydrology system now implements a **basin-surface model with continuous fill**.

Key principles:

### Basin surface is the source of truth

```text
features.basins[].waterSurfaceH
```

* Present only when the basin contains water.
* Omitted entirely when the basin is dry.

### Tile water depth is derived

```text
waterDepth = waterSurfaceH - h_tile
```

Properties:

* Signed value.
* Not clamped.
* Negative values represent subsurface/groundwater influence.

### Tile governance

Each tile is governed by exactly one basin at a time.

Rule:

```text
governing basin = deepest active basin
```

Tie-break:

```text
stable basin id ordering
```

### Basin water volume semantics

```text
allocatedVolume
```

Represents **retained basin water volume**.

Invariant:

```text
0 ≤ allocatedVolume ≤ spillCapacity
```

Additional fields:

| Field             | Meaning                                  |
| ----------------- | ---------------------------------------- |
| `presentedVolume` | incoming volume before spill propagation |
| `allocatedVolume` | retained volume inside basin             |
| `overflowExcess`  | water not retained because basin is full |

### Fill ratio

```text
fillRatio = allocatedVolume / spillCapacity
```

Invariant:

```text
fillRatio ≤ 1
```

---

# 2. Hydrology Fields and Their Meanings

### Basin-level

| Field             | Meaning                                             |
| ----------------- | --------------------------------------------------- |
| `waterSurfaceH`   | basin surface height (present only if basin is wet) |
| `allocatedVolume` | retained basin volume                               |
| `presentedVolume` | incoming volume before spill propagation            |
| `overflowExcess`  | water passed downstream                             |

### Tile-level

| Field           | Meaning                  |
| --------------- | ------------------------ |
| `lakeBasinId`   | governing basin id       |
| `waterSurfaceH` | governing basin surface  |
| `waterDepth`    | signed water depth       |
| `waterClass`    | visualization classifier |

### Important note

`lakeMask` is a **legacy field** and should not be used as a hydrology source of truth.

Water state must be derived from:

```text
waterDepth
lakeBasinId
waterSurfaceH
```

---

# 3. Completed Hydrology Phases

The current system was implemented in phases to avoid destabilizing the model.

### Phase 1 — Basin surface representation

Goal:

```
Introduce basin.waterSurfaceH into basin structures and outputs.
```

No hydrology behavior changes.

---

### Phase 2 — Partial-fill basin solver

Implemented:

```
Solve hs where S_B(hs) = V(B)
```

Basin states:

```
dry
partial
full-to-spill
```

---

### Phase 3 — Tile depth derivation

Tiles now derive depth from basin surface:

```
waterDepth = waterSurfaceH - h_tile
```

Properties:

* signed
* unclamped
* partial basins participate

---

### Phase 4 — Strict-excess parent onset

Parent basin fill begins only from **excess beyond connection threshold**.

Introduced:

```
V(B) = allocatedVolume
```

---

### Phase 5 — Basin governance

Tile governance changed from:

```
max-depth arbitration
```

to:

```
deepest active basin
```

---

### Phase 6 — Basin volume semantics correction

Clarified basin volume fields:

```
presentedVolume → incoming volume
allocatedVolume → retained volume
overflowExcess → propagated excess
```

Invariant enforced:

```
allocatedVolume ≤ spillCapacity
```

---

### Phase 7 — Basin dry-state contract

Dry basins now **omit `waterSurfaceH`**, instead of emitting `null`.

Both outputs now follow the same rule:

```
features.basins
lakeAccounting.basins
```

---

### Phase 8 — Output cleanup

Removed legacy field:

```
topography.structure
```

from tile outputs.

This field is no longer used by any hydrology logic.

---

# 4. Known Remaining Issues

These items remain open but do **not affect core hydrology correctness**.

### Inspector semantics

`run-hydrology-inspector.ts` still contains legacy assumptions:

* positive-only depth statistics
* `lakeMask` gating

Inspector should eventually support signed depth semantics.

---

### Visualization assumptions

Some scripts assume outdated schemas:

* string `waterClass`
* `moisture` field
* `fillFraction`
* `lakeMask` semantics

These are consumer-layer issues.

---

### Epsilon boundary policy

Small epsilon thresholds exist around zero-volume and threshold boundaries.

Decision pending:

```
strict mathematical semantics
vs
deterministic tolerance handling
```

---

### Stream system

Stream generation and debugging have **not yet been reconciled with the new hydrology semantics**.

Streams should be addressed only after visualization/debugging surfaces are stabilized.

---

# 5. Safe Change Rules

The hydrology system is now stable but fragile to incorrect consumer assumptions.

Future work must follow these rules.

### Rule 1 — Hydrology core is read-only by default

Do not modify:

```
src/pipeline/*
```

unless the task explicitly targets hydrology logic.

---

### Rule 2 — Visualization/debug changes must not change hydrology semantics

Consumers may derive display fields but must not redefine core hydrology state.

---

### Rule 3 — Signed depth must remain intact

The following must always remain true:

```
waterDepth > 0  → surface water
waterDepth = 0  → water table
waterDepth < 0  → subsurface influence
```

---

### Rule 4 — Basin surface is the only source of truth

Tile water state must always derive from:

```
basin waterSurfaceH
```

Never from derived masks.

---

### Rule 5 — Locked phases for risky changes

All significant changes must declare:

```
Binding Invariants
Hardest Missing Step
Contradictions/Risks
What Remains False
```

---

# 6. Recommended Next Steps

Future work should proceed in this order:

1. Visualization and debugging cleanup
2. Remove `lakeMask` from outputs and consumers
3. Repair inspector semantics
4. Normalize visualization schema assumptions
5. Only then begin stream-system debugging

---

# 7. Hydrology Regression Safety

Any change touching outputs or visualization must confirm:

```
hydrology-baseline-regression.test
hydrology-debug-artifacts.test
```

remain unchanged.

Hydrology core outputs must not change unless explicitly intended.

---

# Summary

The hydrology model is now:

* basin-surface driven
* continuous-fill
* strictly propagated
* signed-depth aware
* governed by deepest active basin

Future work should treat the solver and basin logic as **stable infrastructure**, and focus on improving consumers rather than modifying the model.
