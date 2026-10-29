# Tasks: ML and LLM learning lab

**Input**: `specs/008-ml-llm-lab/` plan.md, spec.md, research.md, data-model.md, contracts/ (ml-visual-tool.md, lookups.md, doctrine.md, ui-contract.md), quickstart.md, and the design canvas https://claude.ai/artifact/EmWdcYcnZrXu5Ng1VyHiA6

**Tests**: included. SC-009 requires tests without network or model, and the constitution requires them. Write each test task first and watch it fail before implementing.

**Binding rules**: `handoff.md` (in this folder) and `contracts/ui-contract.md`. Strings marked "draft, owner approval" are pasted verbatim, never reworded.

## Phase 1: Setup

- [X] T001 Performance baseline: copy `~/agent-runs/2026-10-28-feature-007/perf.sh` (or 005's) to `~/agent-runs/<date>-feature-008/perf.sh` and run `perf.sh baseline` on a production build of the current tree. Also record the byte size of `public/demo-kit/runtime.js` after `node scripts/build-demo-kit.mjs`. Log both in `specs/008-ml-llm-lab/progress.md`.
- [X] T002 **Live probe (gate for US4, US5)**, from a machine whose network reaches the services. Record the raw results in `~/agent-runs/<date>-feature-008/probe.md` and a summary under Decisions in `progress.md`:
  - (a) `https://huggingface.co/mcp`, anonymous: `initialize`, `tools/list`, one call each to model search, dataset search and paper search, and 20 calls in quick succession (rate limits);
  - (b) `GET https://huggingface.co/openai-community/gpt2/resolve/main/config.json`;
  - (c) `GET https://api.semanticscholar.org/graph/v1/paper/search?query=attention+is+all+you+need&limit=3&fields=title,authors,year,externalIds,abstract,openAccessPdf`, repeated 10× (rate limiting);
  - (d) `GET https://export.arxiv.org/api/query?search_query=ti:%22attention%20is%20all%20you%20need%22&max_results=1`;
  - (e) download `https://arxiv.org/pdf/1706.03762` and confirm `pdfExtract(path, "4")` contains "Scaled Dot-Product Attention".

  Map Hugging Face's actual anonymous tool names onto `hub_search` per research R5. If a capability is missing, use the R5 fallback and log it. If any service refuses anonymous access entirely, **stop and ask Oliver** before continuing that story.
- [X] T003 Add the runtime dependency `js-tiktoken` pinned at `1.0.21` (`npm install --save-exact js-tiktoken@1.0.21`) in `package.json` and `package-lock.json`.

## Phase 2: Foundational (blocks all stories)

- [X] T004 [P] Failing tests in `tests/ml-kit-schema.test.ts`: `validateDemoKitSpec` accepts one valid spec per new panel type (data-model.md table) and rejects:
  - a heatmap over 64×64, or with rows/cols lengths that don't match `values`;
  - `tokens` text over 2,000 characters, empty text, or an agent-supplied `tokenized`;
  - `next_token` with over 30 tokens, or with both `logit` and `p` forms;
  - `scatter` with over 200 points, duplicate labels, or mixed 2D/3D;
  - `network` with under 2 or over 5 layers, a layer over 8, or weight shapes that don't match layer sizes;
  - `shapes` with 0 or over 24 steps, or over 6 dims in a shape;
  - an unknown `scale`, `metric`, `activation`, `loss` or `encoding` value.
- [X] T005 Extend `src/core/demo-kit.ts`:
  - six panel schemas (`heatmap`, `tokens`, `next_token`, `scatter`, `network`, `shapes`) with common optional `title`, `width`, `caption` and `link`;
  - literal-field limit checks in `validateDemoKitSpec`;
  - the reserved `tokenized` field refused when supplied by input.

  Keep existing panels unchanged. Export new types through `src/core/index.ts`.
- [X] T006 [P] Failing tests in `tests/ml-visual-input.test.ts`: `mlVisualInputProblems` and `mlVisualKitSpec` from `src/core/ml-visual.ts`. Cover:
  - title 1–80 characters, caption ≤ 200;
  - per-kind data shapes as in contracts/ml-visual-tool.md;
  - the built spec has exactly one panel of the kind, with data turned into JSON expressions.
- [X] T007 Implement `src/core/ml-visual.ts`: `MlVisualInputSchema`, `mlVisualInputProblems` and `mlVisualKitSpec`, per contracts/ml-visual-tool.md.
- [X] T008 [P] Failing tests in `tests/settings-pure.test.ts` and `tests/render-settings.test.tsx`:
  - `TOGGLEABLE_TOOLS` ends `"math_check", "ml_visuals", "model_hub", "papers"`;
  - rows render "ML visuals" / "Shows tokens, attention, sampling, networks and shapes as interactive panels", "Model hub" / "Looks up model configs, datasets and papers on Hugging Face" and "Papers" / "Finds papers on arXiv and Semantic Scholar and cites their pages";
  - accessible names are "tool ml visuals", "tool model hub" and "tool papers";
  - test ids are `toggle-tool-ml-visuals`, `toggle-tool-model-hub` and `toggle-tool-papers`.

  The `id.replace("_", " ")` in agent-section.tsx only replaces the first underscore; use `replaceAll` and update its test pin.
- [X] T009 Add the three keys to `TOGGLEABLE_TOOLS` (`src/core/pending.ts`) and `TOGGLE_TOOLS` + `TOOL_COPY` (`components/settings/agent-section.tsx`), and update the pinned lists in `tests/tool-toggles-bridge.test.ts`, `tests/question-tools.test.ts` and `tests/practice-agents.test.ts` the way 007 did.
- [X] T010 [P] Failing render tests in `tests/render-lookup-row.test.tsx` for `components/artifacts/lookup-row.tsx`. Check:
  - the skeleton classes from ui-contract.md §B1 (`lh-reading` on `details`; `select-none` only on `summary`);
  - each headline from spec FR-014 and FR-018, for done and failed states;
  - the destructive headline on failure, with the reason not in `font-mono`;
  - field grid labels in words with mono `key value`;
  - links with `target="_blank"`, `rel="noreferrer"` and no amber class.
- [X] T011 Implement `components/artifacts/lookup-row.tsx` by cloning the skeleton of `components/artifacts/math-check-card.tsx` (ui-contract.md §B), with the headline helpers in `src/core/lookups.ts` (data-model.md "Lookup results"). Register `tokenize`, `hub_search`, `hub_model`, `paper_search` and `paper_read` → `LookupRow` in `components/artifacts/index.ts`.
- [X] T012 Running rows: add the `ACTIVITY_LABELS` entries in `src/core/pending.ts` ("Drawing a panel…", "Tokenizing…", "Looking up on Hugging Face…" for both hub tools, "Searching papers…", "Reading a paper…"; canvas copy, draft, owner approval). Extend the input-hiding branch in `components/artifacts/live-tool-card.tsx` from `math_check` to these tools, with a test in `tests/render-math-check.test.tsx` or a new `tests/render-live-rows.test.tsx`.

## Phase 3: User Story 1 — See how text becomes tokens (P1) 🎯 MVP

**Goal**: the teacher shows a real token strip in the reply. The learner switches encodings and edits the text.
**Independent test**: spec US1. Fixed strings produce the reference ids. Switching encodings needs no model call. Edits re-split through the bridge.

- [X] T013 [P] [US1] Generate `tests/fixtures/tokenizer-reference.json` once from js-tiktoken 1.0.21: 20 strings including spaces, line breaks, emoji, CJK, an accented word and a 2,000-character string, × the `o200k`, `cl100k` and `gpt2` encodings. Commit the generator script `scripts/gen-tokenizer-fixture.mjs`.
- [X] T014 [P] [US1] Failing tests in `tests/tokenize.test.ts` for `src/agent/tokenizer.ts`:
  - ids and pieces equal the fixture (SC-001);
  - a partial UTF-8 token has `text: null` and `bytes`;
  - an unknown encoding throws;
  - text over 2,000 characters throws;
  - the encodings load lazily (no import at module load).
- [X] T015 [US1] Implement `src/agent/tokenizer.ts` (research R1): a per-process cache of `Tiktoken` instances, `tokenize(text, encoding)` → `Token[]`, and `withTokenizedPanels(spec)`, which fills `tokenized` for each `tokens` panel with all three encodings.
- [X] T016 [P] [US1] Failing tests in `tests/tokenize-tool.test.ts`: the `tokenize` tool's model text and details follow contracts/ml-visual-tool.md, and invalid input returns `invalidInputResult`.
- [X] T017 [US1] Implement `src/agent/tools/tokenize.ts` with the draft description verbatim.
- [X] T018 [P] [US1] Failing tests in `tests/ml-visual-tool.test.ts` with a stubbed headless browser (as `tests/plot-tool.test.ts` does):
  - a valid `tokens` input returns a demo result whose HTML contains `tokenized`;
  - a failed check throws the contract text;
  - invalid input gives `invalidInputResult`.
- [X] T019 [US1] Implement `src/agent/tools/ml-visual.ts` (contracts/ml-visual-tool.md; mirror `src/agent/tools/plot.ts`) with the draft description verbatim. Register `ml_visual` and `tokenize` in `createTeacherTools` (`src/agent/tools.ts`) and the practice registry (`src/agent/tools/practice.ts`), both dropped when `ml_visuals === false`.
- [X] T020 [US1] Transcript: `ml_visual: PlotCard` in `components/artifacts/index.ts`, and `resultMessageId` for `tool-ml_visual` in `src/core/view.ts` (beside `tool-plot`). Test in `tests/render-plot-part.test.tsx` or a new `tests/render-ml-visual-part.test.tsx`.
- [X] T021 [US1] Runtime `tokens` panel in `src/demo-kit/runtime.ts`, exactly per the TokenStrip board and ui-contract.md §A1–A11:
  - text field;
  - `.k-seg` encoding choice ("o200k · GPT-4o", "cl100k · GPT-4", "GPT-2");
  - chips with `␣`/`↵` markers, the id in mono and `<0xNN>` byte pieces;
  - the count line;
  - the readout line;
  - one tab stop with arrows;
  - the 300 ms debounce;
  - "Updating…" with chips at 60% opacity;
  - the error texts;
  - read-only text with "Editing works in the app" when no bridge answers within 2 s (draft copy).
- [X] T022 [P] [US1] Failing tests in `tests/demo-bridge-tokenize.test.ts`:
  - the pure reducer accepts `demo-tokenize` only from the card's iframe window, with a string `requestId` ≤ 40, text ≤ 2,000 characters and a known encoding;
  - everything else is ignored;
  - `lh-demo-tokens` reply shapes;
  - a route test for `app/api/tokenize/route.ts`: 200 shape, 400 on a bad body, hosted with no tenant refused, no model import.
- [X] T023 [US1] Implement the bridge in `components/artifacts/demo-card.tsx` and the `DemoBridgeMessage` types in `src/core/contracts.ts`, plus `app/api/tokenize/route.ts`. Read `node_modules/next/dist/docs/` on route handlers first, and follow the auth and tenant pattern of an existing `app/api/*/route.ts`.
- [X] T024 [US1] Doctrine: create `src/agent/prompts/teacher/36-ml-lab.md` and append the practice paragraph to `src/agent/prompts/practice/00-base.md`, verbatim from contracts/doctrine.md. Update any prompt-segment pins in tests.

**Checkpoint**: MVP. A token strip renders inline, is checked headless, and is editable in the app.

## Phase 4: User Story 2 — Watch sampling and attention (P1)

**Goal**: next-token bars with temperature, top-k and top-p, plus a heatmap with exact values on hover and focus, both labelled illustrative.
**Independent test**: spec US2 and SC-003, SC-005.

- [X] T025 [P] [US2] Failing tests in `tests/ml-sampling.test.ts` for `src/core/ml-sampling.ts`:
  - softmax with temperature from logits;
  - the `p` form normalised;
  - top-k then top-p with renormalisation;
  - the sum is 100% ± 0.1 at temperatures {0.1, 0.5, 1, 2} × k {0,1,3,8} × p {0.05, 0.5, 0.9, 1};
  - top-k = k leaves exactly k tokens;
  - cut reasons are "cut by top-k" or "cut by top-p";
  - a seeded `sample(rng)` draws only kept tokens.
- [X] T026 [US2] Implement `src/core/ml-sampling.ts`.
- [X] T027 [US2] Runtime `next_token` panel (NextToken board; ui-contract.md §A):
  - rows of label, bar and value;
  - cut rows muted with an outline bar and the reason written out;
  - Temperature, Top-k ("off" at 0) and Top-p fields;
  - Reset and **Sample** (`k-primary`);
  - the readout;
  - "Illustrative numbers" in the head.
- [X] T028 [US2] Runtime `heatmap` panel (Heatmap board; ui-contract.md §A):
  - row and column headers, bold when focused;
  - `role=grid` with roving tabindex and arrow keys;
  - sequential and diverging scales from kit tokens;
  - a legend with min, mid and max;
  - values printed only in cells ≥ 44px;
  - scrolling inside the frame above 12×12;
  - the readout;
  - "Illustrative numbers".
- [X] T029 [P] [US2] Headless render tests in `tests/plot-headless.test.ts` style (skipped without Chrome, like that file): each of `next_token` and `heatmap` passes the kit self-test, the illustrative label is present, and a cell exposes its value through `aria-label`.

## Phase 5: User Story 3 — Network, embeddings and shapes (P2)

**Goal**: a network the panel computes itself, an embedding scatter with arithmetic, and a shape tracer.
**Independent test**: spec US3 and SC-002.

- [X] T030 [P] [US3] Failing tests in `tests/ml-net.test.ts` against `tests/fixtures/ml-net-2-3-1.json`, hand-checked:
  - weights W1 `[[0.5,-0.4],[0.9,0.2],[-0.3,0.8]]`, b1 `[0.1,-0.2,0.05]`, W2 `[[0.7,-0.6,0.4]]`, b2 `[0.1]`, x `[1,0.5]`, target `[1]`, sigmoid, mse as ½(y−t)²;
  - every activation, the loss, each δ and each weight gradient matches to 4 significant digits;
  - tanh, relu and bce paths too.

  Write the fixture by hand computation, not by the implementation under test.
- [X] T031 [US3] Implement `src/core/ml-net.ts`: `forward`, `backward`, and a `steps(spec)` list for the stepper (inputs → each layer forward → loss → output δ → each hidden δ → weight gradients).
- [X] T032 [P] [US3] Failing tests in `tests/ml-vectors.test.ts`:
  - `plus`/`minus` arithmetic over labelled points;
  - nearest by cosine and by Euclidean distance, excluding the operands;
  - 2D and 3D.
- [X] T033 [US3] Implement `src/core/ml-vectors.ts`.
- [X] T034 [US3] Runtime `network` panel (Network board; ui-contract.md §A):
  - an SVG for edges plus positioned neuron buttons;
  - Reset, Back a step, Step forward → Start backward → Step backward;
  - "Step n of N";
  - the phase line ("Forward · layer 2 of 3: hidden activations", …);
  - a legend in words;
  - δ in mono with its sign;
  - "–" before a value is computed;
  - no illustrative label.
- [X] T035 [US3] Runtime `scatter` panel (Scatter board):
  - 2D in an SVG with positioned point buttons and overlap-hidden labels;
  - 3D through the kit's Plotly `plot3d` path;
  - the arithmetic ring and arrows;
  - a legend in words;
  - the readout naming the nearest point and the metric;
  - "Illustrative numbers".
- [X] T036 [US3] Runtime `shapes` panel (Shapes board):
  - the dims legend line;
  - step buttons with `aria-current`;
  - dim chips in mono;
  - changed dims raised with an ink edge;
  - the change text written out (it wraps under the shape below 560px);
  - the readout.
- [X] T037 [P] [US3] Headless render tests for `network`, `scatter` (2D and 3D) and `shapes` in the T029 file.

## Phase 6: User Story 4 — Lessons cite real model numbers (P2)

**Goal**: `hub_search` and `hub_model` with quiet rows. **Requires T002.**
**Independent test**: spec US4. A stubbed server returns the config, the numbers appear in the row, and failure is honest.

- [X] T038 [P] [US4] Failing tests in `tests/hub-tools.test.ts`, with an in-memory MCP server (`@earendil-works/pi-mcp/testing`, as 007's tests do) and a stubbed `fetch` for `config.json`:
  - search model text and details;
  - `hub_model` field whitelist with labels and keys;
  - GPT-2 config → layers 12, width 768, heads 12, vocabulary 50257, context 1024;
  - an invalid repo is refused;
  - the 6th Hub call in one instance is refused with the limit stated;
  - unavailable or rate-limited gives a plain-words error;
  - abort;
  - hosted with no tenant is refused;
  - only `query`/`repo` leave the server.
- [X] T039 [US4] Add `huggingface` to `src/agent/mcp/servers.ts` (research R5). Implement `src/agent/tools/hub.ts`, mapping onto the tool names T002 recorded, with the draft descriptions verbatim.
- [X] T040 [US4] Register `hub_search` and `hub_model` for the teacher (`src/agent/tools.ts`, dropped when `model_hub === false`). For the researcher, pass them through `runResearcherAgent` options (`src/agent/subagents/researcher.ts`, wired from `src/server/jobs.ts` with the same toggle), and append INSTRUCTIONS item 6 verbatim from contracts/doctrine.md.
- [X] T041 [P] [US4] Opt-in live test `tests/hub-live.test.ts` (`LH_LIVE_HF=1`, skipped by default), per quickstart.md.

## Phase 7: User Story 5 — Explanations cite the paper's pages (P3)

**Goal**: `paper_search` and `paper_read` with a 10-page cap. **Requires T002.**
**Independent test**: spec US5. Stub search plus a fixture PDF; the 11th page is refused.

- [X] T042 [P] [US5] Add the fixture `tests/fixtures/papers/sample.pdf`: a small 12-page PDF generated by a committed script with known text per page (for example "Page 4: Scaled Dot-Product Attention"), so no third-party PDF is checked in.
- [X] T043 [P] [US5] Failing tests in `tests/papers-tools.test.ts`, with a stubbed `fetch`:
  - Semantic Scholar results parsed (title, authors, year, ids, abstract, open-access PDF);
  - S2 429 falls back to arXiv Atom;
  - the row source names whichever source answered;
  - `paper_read` extracts the requested pages from the fixture;
  - the citation hint format;
  - the cap: 7 then 4 pages → the second call is refused whole, naming 3 pages left;
  - no open-access PDF gives a plain-words error;
  - arXiv requests are spaced ≥ 3 s apart (fake timers);
  - abort;
  - tenant scoping of the temp dir;
  - the request URLs carry only the query or the paper id (FR-022), asserted on the stubbed `fetch` calls.
- [X] T044 [US5] Implement `src/agent/papers/semantic-scholar.ts`, `src/agent/papers/arxiv.ts` and `src/agent/tools/papers.ts` (contracts/lookups.md) with the draft descriptions verbatim. Download PDFs into a per-turn temp dir (size cap 25 MB, as `pdf-read.ts` does) and remove it after the turn.
- [X] T045 [US5] Register the tools for the teacher (dropped when `papers === false`) and the researcher, as in T040.
- [X] T046 [P] [US5] Opt-in live test `tests/papers-live.test.ts` (`LH_LIVE_PAPERS=1`), per quickstart.md.

## Phase 8: User Story 6 — Composed ML demos (P3)

**Goal**: the demo builder can use and link the six panels.
**Independent test**: spec US6.

- [X] T047 [US6] Document the six panel types in the demo builder's prompt (`src/agent/subagents/demo-builder.ts`, the kit section listing `plot3d` and the others). Use the same one-line JSON shape style. For tokens, say: "give `text` only; the server tokenizes". Call `withTokenizedPanels` in `write_kit_demo` before `kitDemoHtml`.
- [X] T048 [US6] Runtime linked highlight: panels sharing `link` exchange `{link, label}` on hover and focus, and highlight matching rows, columns, chips or points (research R2).
- [ ] T049 [P] [US6] Headless test: a spec with a `tokens` panel and a `heatmap` panel sharing `link` passes the self-test. Focusing a chip marks the matching heatmap header. Values survive a `lh-demo-theme` message.

## Phase 9: Polish and cross-cutting

- [ ] T050 Seed review sessions (`scripts/seed-review.mjs`, or a sibling `scripts/seed-ml.mjs` run by `npm run seed:review`), per quickstart.md: "UI review · ML panels", "UI review · ML lookups", "UI review · ML practice". Use synthetic records like the gradient example, with no network.
- [ ] T051 DESIGN.md: add "ML panels" (under Demos) and "Lookup rows" (under Math check), summarising ui-contract.md §A–§D with the canvas link. Update PRODUCT.md (one paragraph) and docs/ui-review.md (the three review sessions and what to check).
- [ ] T052 Browser check (ui-contract.md §E) at 320, 390 and 1440 px on a production build with the seeded data. Screenshots go to `~/agent-runs/<date>-feature-008/shots/`. Record the canvas comparison per board in `progress.md`. Time 5 inline panels from tool call to visible demo and record them against SC-007 (~3 s). Fix every difference, or list it for Oliver.
- [ ] T053 Accessibility pass: keyboard-only walkthrough of every panel and row, a screen-reader label spot-check (VoiceOver or NVDA if available, otherwise the accessibility tree via Playwright `page.accessibility.snapshot()`), and reduced motion.
- [ ] T054 Performance final: `perf.sh final` and the `runtime.js` size. Initial JS, sidebar readiness and startup must be within 5% of T001. Record the results.
- [ ] T055 Full gates: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `smoke-sidebar-ui`. Record pre-existing failures separately (main currently has 3 in auth UI tests).
- [ ] T056 Write the `progress.md` Report (what changed, how it was verified, what is left), and list every "draft, owner approval" string for Oliver's review in the PR description.

## Dependencies

- Setup T001–T003 → Foundational T004–T012 → stories.
- US1 (T013–T024) is the MVP and has no other story dependency.
- US2 and US3 depend only on Foundational, plus US1's T019/T020 for the inline route.
- US4 and US5 depend on T002 (probe) and Foundational (T009, T011, T012); they're independent of US1–US3.
- US6 depends on the panels it composes (US1–US3).
- Polish runs after the stories you ship.

## Parallel opportunities

- Foundational: T004, T006, T008 and T010 (test files) together; then T005, T007, T009 and T011.
- US1: T013, T014, T016, T018 and T022 together.
- US2 alongside US3 once T019 and T020 land (different runtime sections; coordinate edits in `runtime.ts`).
- US4 alongside US5 (different files), both after T002.

## Implementation strategy

1. MVP: Setup + Foundational + US1. Demo it, and stop for Oliver's review of the drafts if he asks.
2. Then US2 → US3 (panels), US4 → US5 (sources) and US6.
3. Each story ends with its tests green and a screenshot at the three widths.
