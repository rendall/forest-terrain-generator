# Parameter Override Precedence Discussion

## Status
Draft stub for future discussion.

## Purpose
Capture and decide how parameter sources should merge and override each other across CLI workflows.

## Why this exists
`Tile-Data-Shape-Discussion.md` is focused on output data shape. Input precedence and override policy are related but separate concerns, so they are tracked here to avoid scope drift.

## Scope (future)
- Define precedence between:
  - default parameters
  - input-file embedded `paramOverrides`
  - `--params` file values
  - explicit CLI flag values
- Define conflict handling and user-facing diagnostics.
- Define behavior consistency across commands (`generate`, debug tooling, inspectors).

## Non-goals (for now)
- No implementation changes.
- No contract changes in this stub.

## Open questions
- Should `--params` be allowed together with input-file `paramOverrides` for debug/inspector commands?
- If allowed, what exact precedence order should apply?
- Should conflicting keys emit warning, info, or hard error?
- Should precedence behavior be globally uniform across all CLIs, or command-specific?

## Next step
When we are ready to implement or formalize behavior, expand this draft into a proposal/checklist per `docs/normative` process.
