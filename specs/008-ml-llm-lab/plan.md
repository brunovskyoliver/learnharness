# Implementation Plan: ML and LLM learning lab

**Branch**: `claude/confident-edison-h092l5` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md) | **Design canvas**: https://claude.ai/artifact/EmWdcYcnZrXu5Ng1VyHiA6

## Summary

Three parts, one feature:

1. **Panels.** Six new demo-kit panel types:
   - `heatmap`, `tokens`, `next_token`, `scatter`, `network` and `shapes`;
   - drawn by the existing kit runtime, so the demo builder can compose them;
   - one inline tool, `ml_visual`, renders a single panel in the reply, checked in headless Chrome exactly like `plot` (005);
   - a `tokenize` tool and a `POST /api/tokenize` route back the token strip with `js-tiktoken`, server-only. The learner's edits re-tokenize through a new validated bridge message.
   - The pure maths behind sampling, the small network and vector arithmetic lives in `src/core` and is unit-tested to the digits the learner sees.
2. **Hugging Face.** A second server, `huggingface`, in 007's MCP layer, used anonymously behind two LearnHarness-shaped tools: `hub_search` and `hub_model`. `hub_model` reads `config.json` over HTTPS for exact numbers.
3. **Papers.** Plain-HTTPS clients for Semantic Scholar (falling back to arXiv), giving `paper_search` and `paper_read`. `paper_read` reads up to 10 PDF pages per turn with the existing pdfjs ops.

Lookups appear as quiet rows built on the math-check row skeleton. Three settings toggles: ML visuals, Model hub, Papers. Doctrine drafts are in contracts/doctrine.md, pending owner approval.

**Gate before lookups:** live probe T002, because this environment couldn't reach the services (research.md).

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js 16 (read `node_modules/next/dist/docs/` before writing the route, as AGENTS.md says).

**Primary Dependencies**:
- New runtime dependency `js-tiktoken@1.0.21`, approved by Oliver on 2026-10-28. Pure JS, server-only, loaded with dynamic `import()`.
- Existing: `@earendil-works/pi-mcp@1.4.0` (007), `pdfjs-dist` (PDF ops), `typebox`, the demo-kit runtime bundle (`scripts/build-demo-kit.mjs`), Plotly (lazy, for the 3D scatter).

**Storage**: none new (data-model.md).

**Testing**: `node:test` via `tsx`, no network and no model.
- Fixtures: tokenizer reference ids (generated once from js-tiktoken and committed), a hand-checked network fixture, stub MCP and HTTP servers, and a small fixture PDF.
- Opt-in live tests for Hugging Face and papers.
- Seeded browser check at 320, 390 and 1440 px.

**Target Platform**: hosted (tenant-scoped) and desktop (Electron), as in 007.

**Performance Goals**:
- inline panel ≤ ~3 s (the headless check is ~1.5 s);
- tokenization after first load < 5 ms, first load ≤ 1 s for o200k (measured 941 ms);
- lookups within the 25 s MCP timeout and a 20 s HTTP timeout.

**Constraints**:
- Only names, ids and queries leave the server.
- Per-turn caps: Hub 5, paper search 5, paper pages 10.
- Panel limits per data-model.md.
- Startup and initial JS within 5%.

**Scale/Scope**: one learner per tenant; panels ≤ 4,096 heatmap cells and ≤ 200 scatter points.

## Constitution Check

*Pre-design: pass. Re-checked after Phase 1: pass.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I Owner decides | Pass | 12 owner answers are recorded in spec Clarifications. Tool descriptions, doctrine wording and a few new UI strings (running labels, "Tokenized · …", "Editing works in the app") are drafts marked for owner approval in the PR. The implementer MUST NOT reword them. Technical choices left to the agent are logged in research.md (R2–R6). |
| II Teaching theory first | Pass | Doctrine forbids putting a posed question's answer in a panel, and practice panels never show the committed answer. Illustrative numbers are labelled, so the learner doesn't take them as facts. Model numbers are looked up, not remembered. |
| III Learner data is never lost | Pass | Append-only transcript, no new stores. The learner's token edits are local panel state and are never sent to a model. |
| IV Honest states | Pass | "Illustrative numbers" can't be removed by the agent. Token splits are real. Lookups fail in words, caps refuse with the limit stated, and running, done and failed rows are distinct. |
| V Consent before cost | Pass | The services are free. Automatic paper reading is owner-approved within 10 pages per turn, inside a turn the learner sent. All of it can be switched off with toggles. No background model work is added. |
| VI Interface follows DESIGN.md | Pass with exception | All UI reuses the kit runtime classes, the math-check row skeleton and the settings rows (ui-contract.md). The `shadcn`, `impeccable` and `web-design-guidelines` skills aren't installed here, so a manual review stands in, as in 005 and 007. |
| VII Boundaries, tenancy, sandboxing | Pass | Pure maths in `src/core`. Clients in `src/agent`. The route lives in `app/api`, with no store writes. The iframe stays `allow-scripts` only, and the new bridge message is validated by source window and payload. Clients and caches are tenant-scoped. |
| VIII Performance | Pass (to measure) | Server-only dynamic imports. The panel code ships inside `public/demo-kit/runtime.js`, which isn't in the startup graph. Measure the baseline (T001) and final (T060) with the 005/007 `perf.sh`, and report runtime.js size separately. |

## Project Structure

### Documentation

```text
specs/008-ml-llm-lab/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/ml-visual-tool.md, lookups.md, doctrine.md, ui-contract.md
├── checklists/requirements.md
├── tasks.md            # speckit-tasks
├── handoff.md          # implementation handoff (rules for the implementer)
└── progress.md         # stage, decisions, log, report
```

### Source code (planned changes)

```text
src/core/
├── demo-kit.ts                # + six panel schemas, limits, validation, reserved `tokenized`
├── ml-sampling.ts             # new: softmax/temperature/top-k/top-p/renormalise (pure)
├── ml-net.ts                  # new: forward/backward for ≤5×8 networks (pure)
├── ml-vectors.ts              # new: vector arithmetic, cosine/euclidean nearest (pure)
├── ml-visual.ts               # new: ml_visual input schema, problems, one-panel kit spec
├── lookups.ts                 # new: HubLookup/PaperSearch/PaperRead details types + row headline helpers
├── pending.ts                 # + TOGGLEABLE_TOOLS keys, ACTIVITY_LABELS
└── contracts.ts               # + demo-tokenize / lh-demo-tokens bridge messages
src/demo-kit/runtime.ts        # + six panel renderers, link highlight, tokenize bridge client
src/agent/
├── tokenizer.ts               # new: js-tiktoken lazy encodings + byte pieces (server-only)
├── tools/ml-visual.ts         # new: ml_visual (plot pattern) + withTokenizedPanels
├── tools/tokenize.ts          # new
├── tools/hub.ts               # new: hub_search, hub_model (+ shared 5/turn counter)
├── tools/papers.ts            # new: paper_search, paper_read (5 searches, 10 pages)
├── papers/semantic-scholar.ts, papers/arxiv.ts   # new HTTP clients (spacing, backoff, abort)
├── mcp/servers.ts             # + huggingface entry
├── tools.ts, tools/practice.ts                    # registry + toggles
├── subagents/demo-builder.ts  # prompt: document the six panels; write_kit_demo runs withTokenizedPanels
├── subagents/researcher.ts    # + hub and paper tools, INSTRUCTIONS item 6
└── prompts/teacher/36-ml-lab.md, prompts/practice/00-base.md
app/api/tokenize/route.ts      # new
components/
├── artifacts/lookup-row.tsx   # new (math-check skeleton)
├── artifacts/index.ts         # ml_visual: PlotCard; hub_*/paper_*/tokenize: LookupRow
├── artifacts/live-tool-card.tsx  # running rows for the new tools (no input shown)
├── artifacts/demo-card.tsx    # bridge: demo-tokenize → /api/tokenize → lh-demo-tokens
└── settings/agent-section.tsx # three toggles
src/core/view.ts               # resultMessageId for tool-ml_visual
DESIGN.md, PRODUCT.md, docs/ui-review.md   # 008 sections
scripts/seed-review.mjs (or seed-ml.mjs)   # review sessions for 008
```

**Structure Decision**: extend the existing layers, with no new packages or services. All new UI is either kit runtime (inside the iframe) or a clone of existing transcript and settings components.

## Phase 0 and Phase 1

- research.md: R1–R8 decisions, with T002 required before writing lookups.
- data-model.md, contracts/* and quickstart.md are written.
- The agent context file is unchanged: AGENTS.md has no plan pointer to update.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|------|------------|--------------------------------------|
| A new bridge message and route for token edits | Owner chose editable text | Tokenizing in the iframe would ship megabytes of rank tables into every demo |
| Papers over HTTPS instead of MCP | No official arXiv/S2 MCP server | A community MCP server puts third-party code between us and the data |
| `config.json` over HTTPS beside the HF MCP server | Exact numbers | MCP card summaries may omit or round fields |
