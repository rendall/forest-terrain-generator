# North-Star Alignment Phase 3 Checklist (Tooling + Tail Copy)

Goal: align remaining CLI/help/test/developer copy so supporting tools are clearly positioned as long-term truth-inspection surfaces, not competing product goals.

## Checklist

| Done | ID | Divergent copy | File name and line | Why it diverges | Recommended copy change |
|---|---|---|---|---|---|
| [ ] | NS3-MAP-01 | "Render terrain envelope fields as grayscale PGM images" | `src/cli/map.ts:17` | Omits long-term developer/debug role you confirmed. | Reword to emphasize long-term truth-layer inspection purpose. |
| [ ] | NS3-HI-01 | Hydrology inspector descriptions focus on viz/stats mechanics only. | `src/cli/hydrology-inspector.ts:5-8`, `src/cli/hydrology-inspector.ts:103` | Misses framing as supporting-truth validator for downstream description quality. | Reword manual/description to explicitly position as hydrology-truth validation surface. |
| [ ] | NS3-SEE-01 | Landforms error text treats legacy fallback in the same "expected" clause. | `src/app/run-see.ts:192` | Can normalize stale fallback semantics as authoritative expectations. | Keep fallback behavior but label it compatibility-only, non-authoritative. |
| [ ] | NS3-README-01 | Landform grayscale mapping is presented without explicit non-authoritative caveat. | `README.md:85-90` | Can be read as semantic source-of-truth rather than rendering classification. | Add explicit note: this mapping is a rendering/debug classifier, not semantic authority. |
| [ ] | NS3-README-02 | Feature-tree tile membership wording elevates `activeFeatureIds` as if normative authority. | `README.md:217-220` | Current direction treats it as convenience/compatibility projection. | Rephrase as compatibility projection and point to specialized docs for authoritative semantics. |
| [ ] | NS3-TEST-01 | Test descriptions emphasize `see --landforms` as core behavior without product-context note. | `test/integration/cli-command-wiring.test.mjs:172` | Reinforces renderer-first framing in review output and contributor mental model. | Reword test descriptions to classify this as debug/developer rendering behavior. |
| [ ] | NS3-TEST-02 | Test expectations still encode legacy hydrology-copy assumptions (`lakeMask`/schema-centric wording). | `test/integration/cli-command-wiring.test.mjs:277-284` | Contradicts normative hydrology guidance that `lakeMask` is legacy. | Update expectation copy/comments to treat `lakeMask` as compatibility field where still present. |
| ~~[ ]~~ | ~~NS3-PATH-01~~ | ~~Misspelled hydrology-doc reference appears in working habits (`hydrologyHandloff`).~~ | ~~user/dev workflow references; canonical file is `docs/normative/water-depth-model.md`~~ | ~~Increases drift and lookup errors for the current hydrology contract doc.~~ | ~~Add a short "canonical docs" section in README and use only the normative water-depth-model path in docs.~~ |

## Behavior Slices

- Goal: align long-term tooling descriptions with north star support role.
  - Items: `NS3-MAP-01`, `NS3-HI-01`, `NS3-SEE-01`
  - Type: behavior
- Goal: remove remaining README semantic-authority ambiguity.
  - Items: `NS3-README-01`, `NS3-README-02`, ~~`NS3-PATH-01`~~
  - Type: behavior
- Goal: align test-copy language with current governance intent.
  - Items: `NS3-TEST-01`, `NS3-TEST-02`
  - Type: mechanical
