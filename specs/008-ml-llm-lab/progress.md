# Progress: 008 ML and LLM learning lab

## Stage

Implementation in progress: T001–T029 complete. T030 has a hand-computed fixture and partial failing tests; it remains unchecked pending the multi-output loss reduction and BCE compatibility decisions. No T031 implementation started. US1 implementation is built; full story gates remain pending the later runtime renderers and production UI checks.

Specified, clarified, designed, planned, tasked and analyzed on 2026-10-28. **Implementation started.** Binding handoff: see [handoff.md](handoff.md).

## Decisions

- T033 technical: undefined cosine comparisons (zero result or eligible candidate vector), overflow and no eligible nearest candidate refuse through the existing error path. Distance ties preserve source point order; operands stay excluded. This follows honest invalid-data handling without inventing distances or changing eligibility.

- **Oliver, 2026-10-29, T036:** keep the shapes schema unchanged. Always derive the previous-shape → current-shape transition; use the board's “start” and “no change” text where applicable. Do not add a `change` field.

- T030 technical: the binding UI contract §A5 and Network board combine the output activations and loss into one step, followed by “Start backward”. This controls the step list over T031's shorthand that lists loss separately. Generalize to one forward step per layer, then output and hidden deltas in reverse layer order, then weight gradients.

- **Oliver, 2026-10-29, T030/T031:** sum output losses: MSE is the sum of ½(y−t)² and BCE is the sum of binary cross entropies. BCE requires sigmoid activation and targets in [0, 1].

- **Oliver, 2026-10-29:** omitted heatmap bounds derive from the data minimum/maximum, including zero for the diverging scale. Query/Key defaults use the binding contract readout pattern.

- **Oliver, 2026-10-29:** T027 retains a supplied title as the heading and displays `After “{context}”` immediately above the bars; without a supplied title that context line becomes the heading. Both T027 decisions are resolved.

- **Oliver, 2026-10-29:** T027 sliders extend their bounds to include schema-valid supplied values outside temperature 0.1–2 and Top-p 0.05–1, preserving those values without clamping. The title/context decision was subsequently approved below.

- T026 technical: the approved NextToken board applies top-k and top-p against the original temperature distribution, then renormalises once. Probability inputs use log(p), preserving zero mass. Stable softmax subtracts the maximum before temperature division.

- T023 technical: the server barrel re-exports tokenize because app routes may import only core/server barrels under the existing lint import law. This is required route wiring, not an additional feature or owner design decision.

- **Oliver, 2026-10-29:** all six ML panels have Expand buttons, including tokens and shapes (matching the canvas; overrides the incomplete A2 list).

- T015 technical: finalized token-panel types are separate from agent input; validation always rejects agent-written tokenized. Public compressed ranks provide byte pieces, while the pinned reference fixture uses the package byte map. Imports and per-encoding instances are lazy and cached.

- **Oliver, 2026-10-29:** failed/unfinished tokenize results reuse the generic tool row; successful tokenization uses raw encoding names `o200k`, `cl100k`, `gpt2` in the approved headline and the existing generic Input/Output expanded contents. arXiv zero/multiple results use `arXiv · {n} papers for '{query}'`.
- **Oliver, 2026-10-29:** T011 may add the minimal lookup-failure exception in `components/chat.tsx`, analogous to the math-check exception, with a transcript-rendering regression. Invalid-input retry behavior remains unchanged.

- Schema implementation: share literal data schemas and cross-field validation from `src/core/demo-kit.ts` between inline inputs and future evaluated runtime data. Server validation uses JSON.parse for literal expressions, otherwise syntax-checks without execution. Scalar enums remain literal choices as constrained by the contract.

- **T002 live mapping:** anonymous HF MCP server 0.4.31, protocol 2025-11-25. Models/datasets use `hub_repo_search` with `repo_types: ["model"]` or `["dataset"]`, query and limit; papers use `hf_fs` with `operations: [{cmd: "search", args: ["hf://papers", query, "--limit", String(limit)]}]`. A model card is available through `hf_fs` `cat hf://models/{repo}/README.md`. No REST fallback was needed. Search model/dataset replies are prose (download counts rounded), while paper search also carries structuredContent. Exact architecture remains sourced from HTTPS config.json as planned.
- **T002 paper access:** Semantic Scholar returned two HTTP 200 and eight HTTP 429 responses in ten calls; anonymous access works but throttles under load, matching R6. The existing planned arXiv fallback remains required. arXiv API and PDF both returned HTTP 200; extracted page 4 contains “Scaled Dot-Product Attention”. Neither story is blocked by anonymous-access refusal.

- **Oliver, implementation thread (2026-10-28):** reconstruct the absent feature-005/007 `perf.sh` from existing repository tooling and use the same replacement harness for baseline and final measurements. The replacement lives in `~/agent-runs/2026-10-28-feature-008/`; results are a new same-machine comparison, not directly comparable to 005/007 numbers.
- **Oliver, implementation thread (2026-10-28):** T020 may also extend `components/artifacts/demo-panel-context.ts` `plotArtifactOf` to accept `tool-ml_visual`, with a regression test, so workspace presentation works through the existing demo path.
- **Current explicit constraint:** no amber anywhere in feature 008, including data series; this overrides the older canvas/contract amber-series allowance.

- **Oliver's answers** (12, spec Clarifications):
  - both routes (inline tool + demo builder);
  - illustrative numbers labelled "Illustrative numbers";
  - tokenizers o200k, cl100k and GPT-2, with the `js-tiktoken` dependency approved;
  - Hugging Face anonymous only;
  - automatic paper reading capped at 10 pages per turn;
  - lookups for teacher and researcher;
  - editable token text;
  - toggle names "ML visuals", "Model hub" and "Papers";
  - size and call limits;
  - row copy "Source · what";
  - the 4 analyze fixes, applied.
- **Agent decisions** (technical, within the spec; research.md R2–R6):
  - panels as kit types with expression data;
  - tokens filled server-side;
  - `ml_visual` follows the `plot` pattern;
  - a tokenize bridge plus an API route;
  - `config.json` over HTTPS beside the HF MCP server;
  - papers over plain HTTPS (Semantic Scholar → arXiv);
  - per-instance counters.
- **Drafts approved verbatim by Oliver in the implementation thread (2026-10-28)**: tool descriptions (contracts/ml-visual-tool.md, lookups.md), doctrine (contracts/doctrine.md), and the running-row labels, the "Tokenized · …" row and "Editing works in the app" (ui-contract.md, tasks T012 and T021).
- **Open question for Oliver**: does the 10-page cap also cover the researcher's existing `web_fetch_pdf` and `pdf_*` tools? Until he answers, it covers only the new `paper_read`, and the existing tools are unchanged.

## Log

- T033: implemented pure labelled vector arithmetic and Euclidean/cosine nearest search. All five tests pass (`t033-green.log`); targeted ESLint passes. Normalizing coordinates before cosine norms avoids avoidable overflow without changing the metric.

- T032: five vector tests fail on the absent module (`t032-red.log`), covering 2D/3D arithmetic, both distance metrics, operand exclusion, source-order ties and invalid inputs. Undefined cosine comparisons and an empty eligible candidate set must refuse through the existing error path.

- T031: pure forward/backward computation and board-ordered step list implemented. BCE uses the equivalent stable logits formula and sigmoid delta; loss sums preserve the approved scalar fixture. Shared schema/tool validation enforces BCE compatibility. All 22 targeted network/schema tests pass (`t031-green.log`); targeted ESLint passes. No runtime implementation yet.

- T030 complete: added analytic multi-output MSE/BCE cases, saturated sigmoid BCE, finite-difference gradient checks, and invalid-data/BCE compatibility checks. The full eight-test file fails on the absent `ml-net.ts`, as expected (`t030-red.log`). The independently calculated fixture is unchanged.

- T030 partial: wrote the independent scalar worksheet into `tests/fixtures/ml-net-2-3-1.json`, with explicit equations and 40-decimal-place arithmetic before the production module exists. Four tests cover all sigmoid fixture values/gradients, hand-solvable tanh and ReLU examples, and the binding board step order. `npx tsx --test tests/ml-net.test.ts` fails on the absent `src/core/ml-net.ts` as expected (`t030-partial-red.log`). BCE and multi-output tests await Oliver's decisions; T030 remains unchecked and T031 has not started. No runtime edits or screenshots in this partial task.

- Parent Phase 4 verification: independently reran 12 sampling and interactive browser tests after T029; all 12 pass.

- T029 / Phase 4 verification: **22/22** targeted tests pass with explicit Chrome, zero skipped (`t029-green.log`): pure maths, complete-document checks, interactive browser checks and existing token/plot regressions. Both panels pass the kit self-test; illustrative labels and heatmap cell/readout aria values are asserted. Runtime rejects expression-driven >30-token and >64-row inputs. First T029 run exposed a test assertion against the headless wrapper’s summary shape, corrected to its documented `{panels, steps}` (`t029-harness-shape.log`); no runtime failure. Targeted ESLint and diff whitespace checks pass; typecheck has only the pending Phase 5 renderer exhaustiveness error (`phase4-final-typecheck.log`). No full test/build rerun or next-env.d.ts change. Runtime bundle is 40,764 bytes, outside app startup JS. All 12 screenshots inspected; production theme, composition with global kit parameters in focus mode, and final accessibility review remain T048/T052–T054. Web Interface Guidelines reviewed for labels, focus, scrolling, touch targets and reduced motion; no transitions introduced.

- T028: heatmap browser tests failed on absent cells (`t028-red.log`); all five sampling/heatmap browser tests now pass (`t028-green.log`). Covered readout/aria equality, roving arrows, row/column emphasis, pinning, both scales, approved derived bounds, constant data, invalid evaluated data and 64×64 scrolling/touch targets. Six `shots/heatmap-{inline,expanded}-{320,390,1440}.png` screenshots compared with Heatmap/Phone: same grid/legend/readout structure, no board-only example switch, contract colour endpoints retained, horizontal scrolling on touch preserves 44px cells. Neutral kit theme/system font differs from the app bridge and remains T052. Targeted lint passes; typecheck has only the pending Phase 5 renderer return. A T027 endpoint regression caught native range rounding 1 to 0.9625 with an extended Top-p minimum; it failed first (`t027-endpoint-red.log`) and passes after using continuous stepping when bounds do not fit the board step.

- T027: resumed browser tests first failed on absent sampling rows/context (`t027-resumed-red.log`); both pass after implementation (`t027-green.log`). Controls, cut reasons, seeded Sample, Reset, approved title/context layout, exact out-of-board initial values, 320/390/1440 overflow, coarse-pointer targets and Parameters collapse covered. Targeted lint passes. Screenshots `shots/next_token-{inline,expanded}-{320,390,1440}.png` compare with NextToken/Phone: board rows/copy/ink primary retained; supplied titles add the approved context line; focus controls move to the sidebar or phone Parameters section. Neutral kit defaults/system font differ from board appearance because the app appearance bridge is absent; production theme/font review remains T052. shadcn existing kit primitives reused; manual DESIGN.md review substitutes for absent impeccable per contract §E.

- Parent verification/publication: independently reran all seven sampling tests (64 parameter combinations), all passing. Published completed work through T026 to draft PR #8, preserving each local commit tree exactly through the GitHub connector. Local original commits remain at refs/archive/008-local-through-t026; current branch matches the published tree. PR #7 remains open, so #8 still targets its spec branch. No merge or main push.

- T036 decision requested early, pending Oliver: the Shapes board supplies semantic change text but the approved steps schema has no field for it. Proposed optional `change` text with a derived previous-shape → current-shape fallback; alternative is always deriving that transition without changing the schema. No schema or UI change made while pending.

- Phase 4 pause before T027: no next-token or heatmap runtime edits. Owner decisions pending through the parent: (1) mapping required context plus optional title when both are supplied, since the board uses context as its heading; (2) handling schema-valid initial temperature/top-p values outside the board slider bounds (0.1–2 and 0.05–1), proposed extending bounds to preserve values. Do not infer approval or skip to T028. A T027 browser-test draft failed on absent rows as expected (`t027-red.log`); it is preserved only in evidence as `t027-pending-headless.test.ts`, not committed.
- Phase 4 completed-work verification: T025–T026 tests pass 7/7 (`phase4-paused-test.log`), targeted ESLint passes (`phase4-paused-lint.log`), typecheck reports only the existing pending runtime renderer return at runtime.ts:565 (`phase4-paused-typecheck.log`). No full test/build rerun, no next-env.d.ts changes, no runtime/UI changes. Sampling commit `4cd99dd`.

- T025–T026: sampling tests failed on the absent module (`t025-red.log`), then all seven passed (`t026-green.log`), including the 64-case parameter sweep, cut reasons, original-mass nucleus filtering, probability input, stability, ties and seeded sampling.

- Phase 3 verification: full `npm test` with explicit Chrome passes **2,742/2,742**, zero skipped (`phase3-full-test.log`); the old auth failures did not reproduce. Full lint passes with `NODE_OPTIONS=--max-old-space-size=4096` (`phase3-final-lint.log`). Typecheck and build fail only on the expected pending five-panel renderer exhaustiveness error at runtime.ts:565 (`phase3-final-typecheck.log`, `phase3-build.log`); the production bundle compiled successfully in 7.8 s before typechecking. No placeholders were added. Build emitted existing filesystem-tracing warnings in unchanged files. Restored next-env.d.ts after build. Runtime bundle is 26,820 bytes versus T001's 19,804 bytes; this iframe-only bundle is outside startup JS. Final startup/performance comparison remains T054.

- T024: copied teacher ML doctrine and practice paragraph verbatim from the approved contract. Existing prompt discovery requires no list pin changes; all 43 prompt/practice regressions pass (`t024-green.log`).

- T022–T023: bridge/route tests first failed on the missing route (`t022-red.log`); 57 bridge, demo and tenant regressions pass (`t023-green.log`). Pure source+payload validation, local-only POST, success/error replies, exact route tokens, malformed/oversized bodies and hosted refusal covered. Read bundled Next.js route-handler guide before implementation. Full lint passes with a 4 GB Node heap after the default 2 GB heap exhausted (`phase3-lint-retry.log`).

- T021 follow-up: document-reload stale-reply regression failed with deterministic request ids, then passed with a fresh bounded crypto nonce; both real-Chrome tests also verify coarse-pointer target heights and offline timeout (`t021-navigation-red.log`, `t021-navigation-green.log`).

- T021: token renderer passes two real-Chrome tests after the initial missing-renderer failure (`t021-red.log`, `t021-green.log`). Covered exact bytes, encodings, keyboard roving/pinning, debounce, malformed/foreign/stale replies, last-good split, limits, read-only offline mode and widths. Screenshots `shots/tokens-{inline,expanded}-{320,390,1440}.png` compared to TokenStrip/Phone: real ids/splits replace sample data; four non-amber series follow owner override; controls scroll sideways on phones and move to the focus sidebar/phone Parameters section. Isolated screenshots use neutral kit defaults and system font because the app appearance/font bridge is absent; production theme/font comparison remains T052. No overflow. shadcn existing kit primitives reused; web-design-guidelines pass after adding live error/count announcements and field metadata. Impeccable is absent, so manual DESIGN.md review used as ui-contract §E allows. Full production/a11y review remains T052–T053.

- T020: transcript regressions failed without ML artifact recognition, then all six ML/plot regressions passed, including result ids, allow-scripts frames, quiet failures and session workspace inclusion (`t020-red.log`, `t020-green.log`). Parent tokenizer timings: cold o200k 385.0 ms, warm mean 0.0311 ms (100 calls), within research targets.

- T018–T019: ml_visual tool tests failed on its absent module, then passed with finalized token HTML, checked-document identity, approved failure text and input rejection. Teacher/practice registry pins and toggle removals pass; combined 61 tests green (`t018-red.log`, `t019-green.log`).

- T016–T017: tokenize tool tests failed on the missing module, then both passed; model text uses byte markers, details retain exact bytes, and invalid inputs return retryable problems (`t016-red.log`, `t017-green.log`). Description copied verbatim.

- T014–T015: tokenizer tests first failed on the absent module (`t014-red.log`), then all four passed (`t015-green.log`): 60 fixture comparisons, exact partial UTF-8 bytes, limits, lazy imports and immutable server finalization with agent-token rejection.

- T013: generated and committed 20 reference strings × three encodings using pinned js-tiktoken 1.0.21. Reference bytes come from its source-verified textMap, with fatal UTF-8 decoding and complete-text round trips; production will use public rank data.

- T012: six running-row tests failed on generic Working labels, then passed with the exact approved labels and input-hiding branch (`t012-red.log`, `t012-green.log`). Combined foundations/settings/lookup/math/live regressions: 185/185 pass (`phase2-all-tests.log`). Changed-file lint passes; typecheck now reports only the expected pending runtime renderer exhaustiveness error (`phase2-final-typecheck.log`).

- T011: implemented typed lookup details/headline helpers, the exact math-check row skeleton, approved source fields/links and tokenize behavior, and five registry entries. A real Chat SSR regression failed before the chat exception and passed after it; 20 lookup/math-check tests pass (`t011-transcript-red.log`, `t011-green.log`).

- Phase 2 verification through T010: changed-file ESLint passes (`phase2-lint.log`). Typecheck has exactly the expected pending renderer exhaustiveness error and missing T011 lookup-row module (`phase2-typecheck.log`). Baseline headless tests were retried by the parent with explicit CHROME_PATH: all four pass (`baseline-headless-retry.log`), so the initial ETXTBSY errors were environmental.

- T010: added five render tests covering the specified Hub/paper row skeleton, headlines, failures, metadata and links. They fail on the absent lookup-row module as expected (`t010-red.log`); T011 implementation waits for owner decisions on unspecified tokenize and arXiv row states.

- T009: added ML visuals, Model hub and Papers after Math check using existing settings rows/toggles and exact approved copy; accessible names use replaceAll. Updated toggle-list pins; 119 settings/teacher/practice regression tests pass (`t009-green.log`). Tool-registry membership pins remain unchanged until T019/T040/T045 actually register their tools.
- Phase 2 typecheck interim: extending DemoKitPanel exposes the expected missing renderer cases in runtime.ts:438; parent directed leaving this pending until the renderer tasks rather than adding a placeholder.

- T006: inline-input tests failed on the missing module (`t006-red.log`).
- T007: literal inline schema and single-panel JSON expression conversion implemented; 23 combined schema/input tests pass (`t007-green.log`).
- T008: new settings tests fail because the three toggles and their approved copy are not present (`t008-red.log`).

- T004: added 14 schema behavior tests; initial run failed because the six panel kinds were absent (`t004-red.log`).
- T005: added six kit schemas, shared literal-data checks, safe JSON-only literal inspection and expression syntax checks without server evaluation; all 14 tests pass (`t005-green.log`). Existing panels unchanged.

- 2026-10-28 T003 complete: installed only `js-tiktoken@1.0.21`, exact in package.json and lockfile. `npm ls js-tiktoken --depth=0` and an import/encode smoke (`cl100k_base`, hello → [15339]) passed. Restored the build-generated `next-env.d.ts` rewrite before committing.

- 2026-10-28 T002 complete: full anonymous live probe recorded in `~/agent-runs/2026-10-28-feature-008/probe.md` (raw JSON also in `probe-results.json`). HF initialize 327 ms, list 136 ms; model/dataset/paper search and all 20 rapid calls succeeded. GPT-2 config returned HTTP 200 with 12 layers, width 768, 12 heads and vocabulary 50,257. S2 throttling and successful arXiv fallback sources recorded under Decisions. PDF page 4 verified through the existing `pdfExtract`.

- 2026-10-28 T001 complete: replacement `perf.sh baseline` passed 10 cold trials/device (1440×900 and 390×844; 150 ms latency, 200,000 B/s download, 100,000 B/s upload, 4× CPU; isolated 81-session fixture). Medians: desktop startup 4,844.9 ms, keyboard-proven sidebar 4,891.0 ms, FCP 966 ms; mobile startup 4,827.3 ms, sidebar 4,987.5 ms, FCP 964 ms. Both transferred 612,829 JS bytes and 35,237 API bytes. Startup means load plus visible composer; sidebar means session rows plus keyboard search focus. Raw runs and harness retained in the evidence directory.

- 2026-10-28 preflight: 16/16 requirements checked; no before/after implementation hooks. Prerequisites pass with `SPECIFY_FEATURE_DIRECTORY`. Local design exports unpacked into nine ML boards and three math-check boards under the evidence directory; six panel controls exercised. The Phone board Sample button is static reference content.
- 2026-10-28 T001 preparation: initial build found stale local dependencies (missing the already-pinned MCP package); `npm ci` restored the lockfile set and production `npm run build` passed. Demo runtime baseline: 19,804 bytes.

- 2026-10-28 implementation preflight: created `feat/008-ml-llm-lab` from `c087c9c`; Oliver approved all draft strings verbatim. PR #7 remains open. No implementation tasks completed yet.

- Spec, then 5 clarify questions. Checklist 16/16.
- Design canvas: https://claude.ai/artifact/EmWdcYcnZrXu5Ng1VyHiA6 (9 boards; panel boards are interactive).
- Network probes from this environment were blocked (403) for huggingface.co, arxiv.org and semanticscholar.org. Hence task T002.
- js-tiktoken 1.0.21 was measured locally (research R1).
- speckit-analyze: 0 critical, 1 high (the drafts; resolved by the PR review), 4 medium fixed.

## Report

Phase 4 adds stable sampling distributions, next-token bars/controls and accessible sequential/diverging heatmaps. Approved title/context and extended slider bounds are preserved. New Phase 4 verification: 22 targeted tests pass, targeted lint passes, 12 screenshots inspected at 320/390/1440 inline and expanded. Typecheck remains blocked only by scheduled Phase 5 renderers. No full suite/build rerun in this phase; no deployment or publication by the implementer.

Implementation complete through T029: foundations, US1 tokenization, tools, transcript, renderer, tenant-gated editing bridge, approved doctrine and US2 sampling/heatmaps. T030–T056 remain. T030's fixture and partial tests are committed in their expected failing state; BCE and multi-output behavior await Oliver's decisions. US1 is not claimed to have passed the full story gate: other declared panel kinds still need their scheduled runtime renderers before typecheck/build can pass.

Changed: pinned tokenizer fixtures (20 strings × three encodings), lazy per-process tokenizers with exact partial UTF-8 bytes, checked ml_visual/tokenize tools under the shared toggle, existing PlotCard/workspace integration, accessible token chips and controls, local-only editing route and validated source-window bridge. Request nonces reject stale replies across document reloads. No model calls or token persistence added. Only js-tiktoken@1.0.21 was added; lookup-row.tsx remains the only new UI component. Approved wording was preserved.

Verified: Phase 3 full suite passed 2,742 tests, zero skipped, with explicit Chrome; T025–T026 then added seven sampling tests covering 64 parameter combinations, independently rerun successfully by the parent. Full lint passes at 4 GB heap; its first default-heap attempt exhausted memory. Typecheck/build report only future-panel renderer exhaustiveness. The production compilation itself succeeds. Real browser checks cover keyboard pinning/roving, stale/foreign/malformed responses, encodings, debounce, errors, offline mode, no overflow and 44px coarse-pointer targets. Six token runtime screenshots at 320/390/1440 widths are in `~/agent-runs/2026-10-28-feature-008/shots/`; canvas differences and neutral-theme limitation are recorded under T021. Final production seeded-card comparison, full accessibility walkthrough, startup benchmark and smoke-sidebar checks remain T052–T055.

Tokenizer measurements from the parent: cold o200k 385.0 ms, warm 100-call mean 0.0311 ms. Runtime is 40,764 bytes after Phase 4; no final app performance claim. Evidence remains under `~/agent-runs/2026-10-28-feature-008/`.

Continue at T030 after the loss/BCE decisions; the later T036 Shapes question is also pending. Parent independently verified 12 Phase 4 sampling/browser tests, all passing. T030 currently fails by design on its missing production module; no full suite/build rerun after adding this partial test task. No merge or deployment performed. The parent published the completed commits and updated draft PR #8.

Publication: draft PR https://github.com/brunovskyoliver/learnharness/pull/8 targets the unmerged spec branch `claude/confident-edison-h092l5`. Feature branch published through the GitHub connector because local Git lacked push credentials; each published commit tree was checked against its local counterpart. Original local commit history is preserved at `refs/archive/008-local-commits`. No merge, deployment or push to main performed.
