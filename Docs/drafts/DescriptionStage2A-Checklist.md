# Stage 2A Topology-Only Passage Checklist

Use this checklist to implement and review Stage 2A movement-structure narration.

## Core implementation

- [ ] Add `PassabilityByDir` to `DescriptionTileInput` and validate in attach path (`malformed_passability` on invalid/missing).
- [ ] Extend `DescriptionDebug.code` to include `malformed_passability` for passability validation failures.
- [ ] Add `"movement_structure"` to sentence slot union and structured output mapping.
- [ ] Implement `summarizePassability(passability)` helper.
- [ ] Implement `classifyTopology(openDirs)` helper.
- [ ] Implement direction helpers: canonical sort, `formatDirList(dirs)`, and optional fan-of-3 formatter.
- [ ] Add Stage 2A phrase banks: `MOVEMENT_TEMPLATES` and `DEFAULT_MOVEMENT_TEMPLATES` (defaults are lenient-mode only).
- [ ] Implement deterministic template selection with seed key `${seedKey}:move:variant:${variant}`.
- [ ] Implement strict phrase coverage behavior: missing variant templates in strict mode throw `phrase_library_missing`.
- [ ] Implement rendering mode selection:
- [ ] `OPEN_LIST` when `openCount <= 3`.
- [ ] `BLOCKED_LIST` when `openCount >= 6 && blockedCount > 0 && blockedCount <= 2`.
- [ ] `STRUCTURE_ONLY` otherwise.
- [ ] Implement difficult-footing clause for constrained cases (`openCount <= 2 && difficultCount > 0`) with no causal language.
- [ ] Add final sentence sanitation (single sentence, normalized spaces, terminal period).

## Pipeline integration

- [ ] Insert Stage 2A sentence immediately after Stage 1 anchor sentence.
- [ ] Keep Stage 1 logic unchanged (no merge/rewrite of existing Stage 1 sentences).
- [ ] Enforce cap policy (max 4 sentences) with Stage 2A priority right after anchor.
- [ ] Ensure structured sentence includes provenance fields (`contributors`, `contributorKeys`) for movement sentence.
- [ ] Ensure Stage 2A provenance is deterministic: `contributors: ["movement_structure"]`, `contributorKeys.movement_structure = <topologyVariant>`.
- [ ] Update all `generateRawDescription(...)` callsites/tests to provide `passability`.
- [ ] Ensure final rendered Stage 2A text never leaks unresolved placeholders (`{openDirs}`, `{blockedDirs}`).

## Documentation

- [ ] Update `README.md` with Stage 2A behavior summary.
- [ ] Document strict-mode behavior for missing movement templates.
- [ ] Document when Stage 2A returns `null` (all 8 directions passable).
- [ ] Update `docs/drafts/ImplementationPlan.md` to record Stage 2A sequencing/scope changes per policy completion rules.

## Test checklist

- [ ] All-passable tile returns `null` Stage 2A sentence.
- [ ] Any blocked or difficult exits produce exactly one Stage 2A sentence ending in `.`.
- [ ] `openCount=1` classifies and renders `cul_de_sac`.
- [ ] `openCount=2` opposite renders `corridor`.
- [ ] `openCount=2` adjacent renders `corner`.
- [ ] `openCount=2` separated non-opposite renders `skew_bend`.
- [ ] `openCount=3` with opposite pair renders `t_junction`.
- [ ] `openCount=3` consecutive renders `fan_3`.
- [ ] `openCount=4` exact cardinals renders `cardinal_crossroads`.
- [ ] `openCount=4` exact diagonals renders `diagonal_crossroads`.
- [ ] `openCount=6` with two adjacent blocked renders `open_with_notch` behavior.
- [ ] `openCount=7` renders `nearly_open` behavior.
- [ ] Strict mode throws `phrase_library_missing` when selected variant template is absent.
- [ ] Stage 2A sentence contains no banned tokens: `visibility`, `view`, `sightline`, `tile`, `cell`, `passability`.
- [ ] Integration ordering is correct: anchor first, Stage 2A second (when emitted).
- [ ] Output sentence cap never exceeds 4.
- [ ] Malformed or missing passability yields per-tile failure with `description: null` and `descriptionDebug.code = "malformed_passability"` (unit + CLI integration coverage).
- [ ] Difficult-only case (`blockedCount=0`, `difficultCount>0`) emits Stage 2A and uses non-causal wording.
- [ ] Final Stage 2A output contains no unresolved placeholder tokens (`{openDirs}`, `{blockedDirs}`).

## Clarifications to confirm before implementation

- [ ] Strict mode never falls back to defaults for missing selected variant templates.
- [ ] `BLOCKED_LIST` is only allowed when there is at least one blocked direction.
- [ ] If Stage 1 already has 4 sentences, Stage 2A still takes slot 2 and lower-priority Stage 1 sentences are dropped.
- [ ] Normative rule reference: difficult-only case (`blockedCount=0`, `difficultCount>0`) still emits Stage 2A sentence.
