# Child-Basin Fill Ordering: Problem, Options, and Recommended Direction

## Why this draft exists

We have a hydrology realism issue in basin accounting: in nested basin systems, water currently appears to partially fill basins at multiple levels at the same time. In real-world bowl-in-bowl terrain, that is not what happens.

If a child basin sits inside a parent basin, water should first fill the child to its spill elevation. Only after the child is full should the parent begin receiving inflow from that child path.

---

## The current problem in plain language

Today, parent basins can start filling from their own external inflow even while one or more child basins are still not full. That creates unrealistic “simultaneous partial fill” across hierarchy levels.

At a high level, the current logic is:

1. Compute parent external inflow.
2. Add child overflow (if any).
3. Fill the parent with that total.

Illustrative pseudo-code (not exact implementation):

```ts
const childOverflow = sum(child.overflowExcess)
const totalInflow = parent.externalInflow + childOverflow
parent.fillRatio = totalInflow / parent.spillCapacity
```

This is mathematically consistent, but physically incomplete: it does not enforce a fill-order invariant for nested basins.

---

## Invariant we want

**Child-first fill invariant:**

> For any parent basin `P`, if `P` has child basins, those child basins must be completely filled before `P` receives effective inflow attributable to that nested path.

In practical terms:

- No child full yet -> parent should not start filling from that nested structure.
- Some children full, some not -> parent still should not start filling if the policy is strict all-children-first.
- All children full -> parent can start filling and can receive child overflow.

---

## Candidate solution options

### Option A: Strict child-complete gating (recommended)

Treat parent fill as **gated** by child completion:

- Compute child states first (postorder as now).
- For basin `P`, if any direct child is not filled, set parent effective inflow to `0` (or hold it in deferred storage for diagnostics only).
- Once all children are filled, allow normal parent fill accounting.

Illustrative pseudo-code:

```ts
const allChildrenFilled = childIds.every((id) => byId.get(id)?.isFilled === true)
const childOverflow = sum(child.overflowExcess)
const rawInflow = externalInflow + childOverflow
const effectiveInflow = allChildrenFilled ? rawInflow : 0
```

**Pros**

- Matches the stated physical expectation exactly.
- Simple rule, easy to explain and test.
- Deterministic and compatible with existing postorder computation.

**Cons**

- Behavior change: previously some parent fill could occur early.
- Produces sharper transitions (parent stays dry until gate opens).

---

### Option B: Water ledger / deferred inflow queue

Track “blocked inflow” separately while children are unfilled. When gate opens, release accumulated deferred inflow into the parent.

**Pros**

- Conserves accounting of all incoming quantities over time-like steps.
- Better for simulations with explicit timesteps.

**Cons**

- Adds state complexity and potentially new output fields/contracts.
- Harder to keep simple for a single-pass terrain derivation pipeline.

---

### Option C: Proportional sharing across levels

Distribute inflow across child and parent capacities proportionally before complete child fill.

**Pros**

- Smooth transitions.

**Cons**

- Explicitly violates the desired child-first physical invariant.
- More tunable parameters, less intuitive behavior.

---

### Option D: Height-threshold-only gating (no topology gate)

Use only local elevation thresholds and allow parent partial fill whenever parent threshold conditions are met, regardless of child completion.

**Pros**

- Minimal change.

**Cons**

- Does not solve the reported issue.
- Keeps unrealistic nested partial-fill behavior.

---

## Why Option A is the best fit

Given the stated goal (“all child basins must be fully filled before parent inflow”), Option A is the closest direct match:

1. **Correctness to requirement**: It enforces the invariant exactly, without ambiguity.
2. **Low implementation risk**: It can be implemented in the existing postorder basin loop with a small, local rule.
3. **Determinism preserved**: No stochastic behavior or iterative convergence needed.
4. **Testability**: Easy to add targeted unit tests:
   - unfilled child blocks parent fill,
   - filled child unlocks parent fill,
   - mixed child states keep parent blocked.
5. **User explainability**: “Children fill first, then parent starts” is clear and intuitive.

---

## Suggested acceptance criteria

If we implement Option A, acceptance criteria could be:

- Parent basin with any unfilled child has `effectiveInflow = 0` for fill computation.
- Parent `totalInflow` field semantics are explicitly documented (raw vs effective).
- Parent transitions from not-filling to filling only when all children are filled.
- No double counting of child-to-parent contributions.
- Existing determinism tests continue to pass.

---

## Implementation note (non-binding)

The rule should be introduced as a small, explicit policy in lake accounting (for example, a named helper such as `isChildCompleteGateOpen`). Keeping it explicit avoids hidden coupling and keeps future policy changes manageable.

