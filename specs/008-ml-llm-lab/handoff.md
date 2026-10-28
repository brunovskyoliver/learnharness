# Handoff: implement feature 008 (ML and LLM learning lab)

You are implementing an approved plan. Every decision has been made. Your job is mechanical execution of `tasks.md`, task by task, in this repository. If something isn't decided here or in the files below, **stop and ask Oliver**. Do not choose for him. A wrong guess costs more than a question (constitution Principle I, AGENTS.md "No guessing").

## 0. Before you write any code

1. **Read, in this order:**
   1. `AGENTS.md`
   2. `.specify/memory/constitution.md`
   3. `DESIGN.md`
   4. `specs/008-ml-llm-lab/spec.md` (Clarifications first)
   5. `plan.md`
   6. `research.md`
   7. `data-model.md`
   8. `contracts/ui-contract.md`
   9. the other three contracts
   10. `tasks.md`
   11. `quickstart.md`
2. **Open the design canvas** https://claude.ai/artifact/EmWdcYcnZrXu5Ng1VyHiA6 and press Play on the panel boards (TokenStrip, NextToken, Heatmap, Network, Scatter, Shapes, Phone). These are the target. The data on them is sample data; the layout, controls, copy, states and keyboard behaviour are binding.
3. **Read the reference implementations you'll copy:**
   - `src/agent/tools/plot.ts` (inline tool pattern);
   - `src/agent/tools/math-check.ts` and `src/agent/mcp/` (MCP and per-turn limits);
   - `components/artifacts/math-check-card.tsx` (row skeleton);
   - `components/artifacts/live-tool-card.tsx` (running rows);
   - `src/demo-kit/runtime.ts` (kit panels and CSS);
   - `src/core/demo-kit.ts` (schemas);
   - `components/artifacts/demo-card.tsx` (bridge);
   - `components/settings/agent-section.tsx` (toggles).
4. **Confirm with Oliver** that the PR's draft strings are approved:
   - the tool descriptions in `contracts/ml-visual-tool.md` and `contracts/lookups.md`;
   - the doctrine in `contracts/doctrine.md`;
   - the running labels, "Tokenized · …" and "Editing works in the app".

   If he edited them in the PR, use his text. Never write your own.
5. **This is Next.js 16 with breaking changes.** Read `node_modules/next/dist/docs/` on route handlers before writing `app/api/tokenize/route.ts`.

## 1. Scope

- **In scope:** tasks T001–T056, nothing else. No refactors, renames, or "while I'm here" changes outside the files the tasks name.
- **Out of scope:** an in-browser model, a Hugging Face token or setting, in-browser Python, new MCP servers beyond `huggingface`, and changes to existing panels or rows.
- **Dependencies:** the only new one is `js-tiktoken@1.0.21`, exact. Any other dependency needs Oliver's approval first.

## 2. Process rules

- **Task flow:** one task at a time, in `tasks.md` order (respect the Dependencies section). Write the test task first, run it, and see it fail for the right reason. Then implement, then see it pass. Tick the box in `tasks.md` and add one line to the `progress.md` Log.
- **T002 (live probe) gates US4 and US5.** If a service refuses anonymous access, or behaves differently from research.md R5/R6, record what happened and **stop that story and ask Oliver**. US1–US3 and US6 don't depend on T002.
- **Recording decisions:** log a technical choice that the spec and contracts already constrain under Decisions in `progress.md`. Anything else is a question for Oliver.
- **Tests:** no network and no model requests. Live tests are opt-in (`LH_LIVE_HF=1`, `LH_LIVE_PAPERS=1`) and skipped by default.
- **Gates** before you say a story is done: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. Main currently has 3 pre-existing failures in auth UI tests (`chatgpt-connection-ui`, `subscription-auth`, `subscription-connection-ui`). Record them separately and don't fix them here.
- **Commits:** commit per task or per small group, with clear messages. Don't commit the `next-env.d.ts` rewrite that `npm run build` produces; restore that file before committing. Open a PR when asked; never merge, deploy or push to `main` yourself.

## 3. UI rules: strict, no exceptions without Oliver

`contracts/ui-contract.md` is binding. The short version below is a checklist you must satisfy literally. DESIGN.md outranks everything.

### Panels (inside the demo iframe)

1. **Tokens and controls**
   - Colours and fonts only through the kit variables (`--lh-*`). No hex literals and no Tailwind in `runtime.ts`.
   - Reuse `.k-panel`, `.k-panel-head`, `.k-icon-button`, `.k-field`, `.k-label`, `.k-seg`, `.k-btn`, `.k-btn.k-primary` and `.k-error`. Add new classes only for things that don't exist yet (chips, cells, neurons, readout line, illustrative label). Prefix them `k-` and put them in the existing `STYLE` string.
2. **Panel head:** the title on the left. On the right, "Illustrative numbers" (exact text, `.8em`, weight 500, muted, plain text, not a badge) for `heatmap`, `next_token` and `scatter` only, then the Expand icon button. Below 560px the label moves under the title.
3. **No amber for state or emphasis, anywhere.** The primary button is the kit's ink fill. Amber appears only as the third data series.
4. **No borders, cards, shadows or gradients** inside panels. The only edges are the text field, focus outlines and the selected-item outline.
5. **Readout line:** every panel has one live (`aria-live="polite"`) readout line in muted `.8em`, using the copy patterns in ui-contract.md §A4. Pointer hover and keyboard focus produce the same readout.
6. **Dense views are one tab stop** (roving tabindex) with arrow keys inside: heatmap cells (`role=grid`), chips, points and neurons. Every item has an `aria-label` that matches the readout.
7. **Numbers:** tabular numerals. Monospace (`--lh-mono`, 12px) only for token ids, gradients and tensor shapes.
8. **Colour is never the only cue:** cut tokens say "cut by top-k" or "cut by top-p", changed tensor dims are written out, weight sign is in the legend, and gradients carry their sign.
9. **Layout:** no page overflow at 320, 390 and 1440 px. Wide content scrolls inside the panel with hidden scrollbars (`DEMO_SCROLLBAR_CSS`). Touch targets are ≥ 44px on coarse pointers.
10. **Motion:** ≤ 160ms. `prefers-reduced-motion` removes transitions but keeps the state changes.
11. **Copy:** use the canvas and contract strings exactly. No new strings.

### Transcript rows

12. `components/artifacts/lookup-row.tsx` is a clone of `math-check-card.tsx`'s skeleton: same wrapper classes (`group lh-reading my-1`), summary classes, chevron, panel classes and `Row` labels. Only the headline and panel contents differ.
13. Headlines exactly as in spec FR-014/FR-018 and the Rows board ("Hugging Face · gpt2 config", "Semantic Scholar · 4 papers for 'LoRA'", "Read · Attention Is All You Need · pp. 3–5"). Failures: "Hugging Face · lookup failed", "Papers · search failed", "Read · failed", with the reason in sans in destructive ink.
14. While running, show only the spinner, the shimmer and the label. Never the input.
15. Links: ink with a 40% underline, `target="_blank" rel="noreferrer"`, never amber. Only the summary is `select-none`.

### Inline panels and settings

16. A checked `ml_visual` result renders through the existing `PlotCard` and demo card. **Do not create a new card component.** A failed check shows only the quiet tool row, like a failed plot.
17. Settings: three rows after Math check, using the existing `SettingsRow` and `Toggle` with the exact labels and hints from spec FR-020. Accessible names "tool ml visuals", "tool model hub" and "tool papers".

### Review gate (T052, T053)

18. Take screenshots at 320, 390 and 1440 px of every panel (inline and expanded), every row state and the settings rows. Compare each to its canvas board and list the differences in `progress.md`. Fix them, or ask Oliver. A UI task isn't done until this comparison is recorded.

## 4. Behaviour rules (Principles II, IV, V, VII)

- **Token data:** token splits come only from `src/agent/tokenizer.ts`. The model never supplies tokens, and the schema refuses an agent-written `tokenized`.
- **Network maths:** the network panel computes its own forward and backward pass from `src/core/ml-net.ts`, and the T030 fixture must be computed by hand, not by the code under test.
- **What leaves the server:** only queries, repo ids and paper ids. Never learner text, answers or thinking. The learner's edited token text goes only to `/api/tokenize`, which doesn't call a model or store anything.
- **Limits:** 5 Hub calls, 5 paper searches and 10 PDF pages per turn per agent. Over a limit, refuse with the limit stated. Never truncate silently.
- **Failures:** every failure is an error result in plain words, and the turn continues. Abort follows the turn. Hosted mode is tenant-scoped (`tenantScoped`).
- **Sandbox:** the iframe stays `allow-scripts` only. The new bridge message is accepted only from the card's own iframe window, with a validated payload.

## 5. Open question (ask Oliver; don't decide)

- Does the 10-page cap also cover the researcher's existing `web_fetch_pdf` and `pdf_extract`/`pdf_search` tools? Default until he answers: no. Only the new `paper_read` is capped.

## 6. When you finish

- Fill in the `progress.md` Report: what changed, how it was verified (commands and results, screenshots path, perf numbers against T001), and what's left (the live-model run, deployment, anything Oliver must decide).
- List every draft string with its final text in the PR description for Oliver.
- Say plainly what you didn't verify.
