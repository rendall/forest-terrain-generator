# North-Star Alignment Phase 1 Checklist (Core Surfaces)

Goal: align the highest-visibility governance and onboarding copy with the description-first wilderness north star.

## Checklist

| Done | ID | Divergent copy | File name and line | Why it diverges | Recommended copy change |
|---|---|---|---|---|---|
| [ ] | NS1-AGENT-01 | "The deliverable is a CLI that implements the forest terrain generation system..." | `AGENTS.md:9` | Centers terrain generation as the end product instead of coherent wilderness location descriptions. | Replace with: "The deliverable is a deterministic CLI that models terrain truth layers and produces coherent wilderness location descriptions, with debug/developer outputs as long-term supporting surfaces." |
| [ ] | NS1-README-01 | `describe` is commented out in CLI summary. | `README.md:22` | Description output is now core direction but appears hidden/secondary. | Replace commented line with active command bullet describing `describe` behavior. |
| [ ] | NS1-README-02 | Canonical flags include describe flags without clearly stating describe command location. | `README.md:38-47` | Ambiguous command surface; current decision is to keep `describe` separate for now. | Add explicit sentence: "`describe` currently ships as a separate CLI (`src/cli/describe.ts`) by design." |
| [ ] | NS1-README-03 | "Other CLIs" lists only hydrology-inspector. | `README.md:25-27` | Understates long-term importance of debug/developer tool surfaces (`see`/`map`/`hydrology-inspector`). | Expand section to list `see`, `map`, `hydrology-inspector`, `stream`, `los`, `assign-regions` as long-term developer/debug tooling. |
| [ ] | NS1-README-04 | Large hydrology schema + field contract details embedded in README. | `README.md:139-166` | You decided detailed schema contracts should live in specialized docs, not README. | Replace with concise conceptual hydrology-layer summary plus link to `docs/active/hydrology-handoff.md`. |
| [ ] | NS1-README-05 | Wetness sweep workflow and TSV schema in README. | `README.md:167-193` | Specialized hydrology analysis workflow dilutes north-star onboarding copy. | Move detail to specialized hydrology docs/scripts; keep one-line pointer in README. |
| [ ] | NS1-CLI-01 | "Procedural forest terrain generation CLI" | `src/cli/main.ts:134` | Product description misses description-first output framing. | Replace with: "Deterministic wilderness terrain and location-description pipeline CLI." |
| [ ] | NS1-CLI-02 | "Attach deterministic tile descriptions to an existing terrain envelope" | `src/cli/describe.ts:18` | Correct but undersells north-star purpose. | Replace with: "Generate deterministic wilderness location descriptions from a terrain envelope." |

## Behavior Slices

- Goal: make public project framing clearly description-first.
  - Items: `NS1-AGENT-01`, `NS1-README-01`, `NS1-CLI-01`, `NS1-CLI-02`
  - Type: behavior
- Goal: clarify command surfaces and tool roles.
  - Items: `NS1-README-02`, `NS1-README-03`
  - Type: behavior
- Goal: remove schema-heavy hydrology detail from onboarding docs.
  - Items: `NS1-README-04`, `NS1-README-05`
  - Type: mechanical
