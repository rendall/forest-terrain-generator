# North-Star Alignment Phase 2 Checklist (Governance + Semantic Docs)

Archived note: remaining `featureDefinitionProposal` work is being tracked separately.

Goal: align governance and semantic/audit docs so they no longer encode stale priorities or obsolete description-input assumptions.

## Checklist

| Done | ID | Divergent copy | File name and line | Why it diverges | Recommended copy change |
|---|---|---|---|---|---|
| ~~[ ]~~ | ~~NS2-ADR-01~~ | ~~No ADR entry explicitly states description-first wilderness north star.~~ | ~~`docs/ADR.md:1-70`~~ | ~~Governance currently emphasizes hydrology gate/reset history but not current product direction.~~ | ~~Add new top ADR entry: "Description-First Wilderness Output North Star" with scope, consequences, and relationship to supporting truth layers.~~ |
| ~~[ ]~~ | ~~NS2-ADR-02~~ | ~~"Hydrology Public Schema Gate (Phase D)" appears as active product-level framing.~~ | ~~`docs/ADR.md:5-37`~~ | ~~Without explicit scope note, this can be misread as current top-level direction.~~ | ~~Add supersession/scope note: hydrology gate is subsystem policy under the description-first north star.~~ |
| ~~[ ]~~ | ~~NS2-RIDGE-01~~ | ~~Narrative consumer claim still says `run-describe` uses raw `topography.landform` + `navigation.followable`.~~ | ~~`docs/ridgeTypology.md:53`, `docs/ridgeTypology.md:131-132`~~ | ~~No longer accurate after description-facts normalization path.~~ | ~~Update to reflect `description-facts` normalization + adapter-derived prose signals.~~ |
| ~~[ ]~~ | ~~NS2-RIDGE-02~~ | ~~Consumer table still frames some stale convenience fields without clearly separating compatibility vs authority.~~ | ~~`docs/ridgeTypology.md:124-136`~~ | ~~Risks reintroducing stale semantics as authoritative guidance.~~ | ~~Add explicit authority note per consumer: topology truth vs compatibility projection.~~ |
| [ ] | NS2-FEAT-01 | "Feature Definition Pass (stub)" / "placeholder for later" language. | `docs/featureDefinitionProposal.md:1-3` | Makes prominence/orientation work read as speculative rather than core roadmap. | Retitle and reframe as planned pillar for coherent location description quality. |
| ~~[ ]~~ | ~~NS2-AUDIT-01~~ | ~~Embedded `<PREVIOUS_PR_TITLE>` and `<PREVIOUS_PR_DESCRIPTION>` blocks.~~ | ~~`docs/lakeMask-removal-audit.md:92-115`~~ | ~~Historical PR template residue is not durable governance copy.~~ | ~~Remove block and keep timeless audit findings + current-state notes only.~~ |

## Behavior Slices

- ~~Goal: codify north star at governance level.~~
  - ~~Items: `NS2-ADR-01`, `NS2-ADR-02`~~
  - ~~Type: behavior~~
- Goal: keep semantic guidance accurate for current description pipeline.
  - Items: ~~`NS2-RIDGE-01`~~, ~~`NS2-RIDGE-02`~~, `NS2-FEAT-01`
  - Type: behavior
- ~~Goal: clean non-governance residue from active docs.~~
  - ~~Items: `NS2-AUDIT-01`~~
  - ~~Type: mechanical~~
