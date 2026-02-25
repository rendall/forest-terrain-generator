# Followable Adjacency Structured Output Checklist

Purpose: add deterministic `adjacency` data to `descriptionStructured` by comparing each tile’s `navigation.followable` tokens with neighbor `followable` tokens.

This checklist is implementation-level. Follow steps in order.

## 1. Output contract (lock first)

- [ ] Add `adjacency` to structured output at tile level:
  - [ ] Path: `tile.descriptionStructured.adjacency`
  - [ ] Type: `Record<string, Direction[]>`
  - [ ] Always present when `--include-structured` is set.
  - [ ] Empty case must be exactly `{}`.
- [ ] Keep existing `descriptionStructured.text` and `descriptionStructured.sentences` unchanged.
- [ ] Do not change prose generation behavior in this task.

Expected shape:

```json
"descriptionStructured": {
  "text": "...",
  "sentences": [ ... ],
  "adjacency": {
    "game_trail": ["NW", "E"],
    "shore": ["SW", "SE"],
    "stream": ["S"]
  }
}
```

## 2. Data plumbing in `src/app/run-describe.ts`

- [ ] Extend `TileSignals` with:
  - [ ] `followable: string[]`
- [ ] In `buildTileSignals(tile)`:
  - [ ] Read `navigation` object (`const navigation = ...` already exists).
  - [ ] Set `followable` directly from `navigation.followable` with array contract assumption:
    - [ ] `followable: navigation.followable as string[]`
  - [ ] Do not add defensive parsing or dedupe logic for `followable`.

## 3. OOB handling (minimal)

- [ ] Do not add bounds objects or `isInBounds` helper.
- [ ] Treat OOB as “missing neighbor in map”:
  - [ ] Build and use existing `byCoord: Map<string, TileSignals>`.
  - [ ] In adjacency scan, lookup neighbor with `byCoord.get(tileKey(nx, ny))`.
  - [ ] If lookup returns `undefined`, skip direction.

## 4. Adjacency builder (core algorithm)

- [ ] Build adjacency inline using `reduce` over `self.followable`:
  - [ ] Target expression shape:
    - [ ] `const adjacency = self.followable.reduce<Record<string, Direction[]>>((obj, token) => ({ ...obj, [token]: directionsForToken }), {});`
  - [ ] For each `token`, compute `directionsForToken` by scanning canonical `DIRECTION_ORDER`:
    - [ ] Use existing `DIRECTION_DELTAS`.
    - [ ] Compute `nx = self.x + dx`, `ny = self.y + dy`.
    - [ ] Lookup neighbor: `const neighbor = byCoord.get(tileKey(nx, ny));`
    - [ ] If no neighbor, skip direction.
    - [ ] If `neighbor.followable.includes(token)`, include that direction.
  - [ ] Keep direction order as scanned (canonical); no sort and no dedupe.
  - [ ] Ensure computed property key is used: `[token]` (not literal `"token"`).

Notes:
- Direction order is already canonical because scanning order is canonical.
- Do not sort directions.
- Do not dedupe directions.

## 5. Structured output integration

- [ ] In `attachTileDescriptions(...)`, inside success path and `if (includeStructured)` block:
  - [ ] Build adjacency once per tile with the `self.followable.reduce(...)` expression from Section 4.
  - [ ] Attach it under `descriptionStructured`:
    - [ ] `outputTile.descriptionStructured.adjacency = adjacency`
- [ ] Keep failure tiles unchanged:
  - [ ] `descriptionStructured` remains `null`.

## 6. Required tests

- [ ] Update `test/unit/describe-attach.test.mjs`:
  - [ ] Add fixture with known `followable` overlaps.
  - [ ] Assert `descriptionStructured.adjacency` exists when `includeStructured=true`.
  - [ ] Assert canonical direction order in arrays.
  - [ ] Assert OOB directions are not included.
  - [ ] Assert empty token result is `[]` (not omitted) when token exists on self but not neighbors.
- [ ] Update `test/integration/cli-describe.test.mjs`:
  - [ ] In `--include-structured` test, assert `descriptionStructured.adjacency` exists and is an object.
  - [ ] Assert at least one sample token maps to an array.
- [ ] Keep existing tests untouched unless they fail due to this schema addition.

## 7. Verification commands

- [ ] `npm run typecheck`
- [ ] `npm test -- test/unit/describe-attach.test.mjs test/integration/cli-describe.test.mjs`
- [ ] Optional manual check:
  - [ ] `node --import tsx src/cli/describe.ts --input-file forest.json --output-file /tmp/out-adjacency.json --force --include-structured`
  - [ ] `jq '.tiles[0].descriptionStructured.adjacency' /tmp/out-adjacency.json`

## 8. Done criteria

- [ ] `descriptionStructured.adjacency` exists on all successful tiles when `--include-structured`.
- [ ] `adjacency` is `{}` when `self.followable` is empty.
- [ ] Token keys are exactly self tile followable values, in source order.
- [ ] Direction arrays are in canonical order from scan, with OOB skipped.
- [ ] Typecheck and targeted tests pass.
