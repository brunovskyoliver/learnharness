# Progress: 008 ML and LLM learning lab

## Stage

Implementation in progress: T001–T046 complete. Hub and paper tools, registration and opt-in source checks are implemented. The arXiv phrase-search decision is resolved and the unchanged live paper test passes. Continue at T047. Full story gates and production UI checks remain pending.

Specified, clarified, designed, planned, tasked and analyzed on 2026-10-28. **Implementation started.** Binding handoff: see [handoff.md](handoff.md).

## Decisions

- **Oliver, 2026-10-29, T046:** arXiv fallback searches the submitted query as a quoted phrase across all fields. No title-first branch or broad-keyword retry.
- T046 technical: escape literal backslashes and double quotes inside the phrase, leaving all other submitted text unchanged and preserving the original query in details/S2 requests. The [arXiv API manual §5.1](https://info.arxiv.org/help/api/user-manual.html#51-details-of-query-construction) documents quoted phrases; the [official classic API parser](https://github.com/arXiv/arxiv-search/blob/develop/search/domain/classic_api/query_parser.py) accepts ESCAPED_STRING and retains its escaped content. Source copies are in the evidence directory.

- **Oliver, 2026-10-29, T044:** when citation authors or year are missing, keep successful page extraction and replace the citation hint with “Citation metadata is incomplete. Cite the paper title and page link.” Supply the real title and page URLs; never fabricate authors/year.
- T044 technical: temporary PDFs use a new core PaperFiles port and lazy src/store/papers.ts adapter rooted in the current tenant's data directory. Server composition injects the port; teacher settlement/start-failure cleanup and researcher finally dispose it, including pending writes. New filesystem mutation remains in the store adapter. Existing researcher PDF tools remain outside the new ten-page cap.
- T044 technical: arXiv API/PDF requests share only process timing reservations, spaced three seconds apart with one retry on 429. Abort cancels waits. Existing linkedom and pdfjs are dynamically imported for Atom/PDF work; no dependency was added. Failed reads release reserved pages; published pagesUsedThisTurn counts only completed reads. Source author names are preserved verbatim.

- **Oliver, 2026-10-29, T039:** additional config labels are “Intermediate width”, “Key/value heads”, “Model type”, “Dtype”. Preserve rounded source download counts verbatim, widening HubLookup.downloads to number | string; never turn 24.1M into an exact integer.
- T039 technical: expose MCP structuredContent through an additional helper while retaining callMcpTool's text API, to consume the probed paper entries without parsing a Markdown table. Reject dot/dotdot repo path segments before URL normalization. Optional cardSummary stays absent because the probed server supplies README source, not a summary; no model-generated or invented excerpt. Exact parameter counts come only from the public model API's safetensors.total. Existing math MCP callers remain unchanged.
- T040 technical: the researcher runner owns the actual runResearcherAgent call, so its dependency options must carry the same toggle from server/jobs.ts. Insert the approved item 6 verbatim and renumber the existing synthesis item to 7 without changing its wording.

- **Oliver, 2026-10-29, T036:** initially select the first shape step. Changed dimensions compare name and size as a multiset, so reordering unchanged dimensions does not mark them changed and adding a repeated dimension marks the new occurrence.

- T035 technical: Plotly's WebGL points need a semantic keyboard equivalent for UI contract §A6. Roving point buttons are hidden until focused; keyboard focus has a visible chart outline/button, selected-point trace and the same readout as pointer hover. No permanent extra controls or copy. Scatter calls the existing `plot3d` path with a data callback, retaining its loading/theme/camera behavior. Arithmetic displays first plus operand, minus operands, remaining plus operands, preserving the board's “king − man + woman”.

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

- T046 complete: the exact outgoing phrase and embedded quote/backslash regressions failed first (`t046-query-red.log`), then passed. Final offline paper/row checks pass 27/27 with the one opt-in live test skipped (`t046-offline.log`). Scoped ESLint and full typecheck pass. The unchanged real paper test now passes 1/1 in 6.94 s (`t046-live-green.log`), finding Attention Is All You Need and extracting the expected page-4 text. No model calls, dependency changes or next-env.d.ts rewrite. The earlier live failure is resolved by Oliver's approved query mapping.

- T046 live check failed at exact-title search (`t046-live.log`): S2 throttled and the unquoted arXiv all-fields query returned five related papers, omitting the original. Read-only diagnostics identify arXiv as the source (`t046-live-diagnostic.json`); quoting the same query returns the original as the second result (`t046-quoted-probe.json`). Parent asked Oliver to choose fallback query semantics. No test assertion was weakened and no query change was made while approval is pending. T046 reopened.
- T046 independent direct-read diagnostic passed: paper_read 1706.03762 page 4 contains “Scaled Dot-Product Attention”, returns the correct title/page URL, and reports 1 of 10 pages in 3.63 s (`t046-page-probe.json`). Temp files were disposed in finally. This verifies extraction, not the unresolved end-to-end live test.

- T046: added the opt-in live paper title search and arXiv page-4 extraction test with finally cleanup. Its default invocation skips the one network test (`t046-default.log`).

- T045: teacher/researcher paper registration and fresh job-toggle/storage wiring tests failed before implementation, then passed. All 95 tool/researcher/job tests pass (`t045-green.log`); scoped lint and full typecheck pass. Teacher and researcher own separate counters and temp storage; existing researcher web/PDF tools are unchanged. Parent independently reran all 16 paper-tool tests, passing in about 27.24 s.

- T044: implemented S2/arXiv clients, paper tools and lazy tenant temp storage/cleanup. Citation-fallback, terminal cleanup and committed-page regressions failed first (`t044-cleanup-red.log`, `t044-committed-red.log`), then passed. All 69 paper, researcher, tenant and chat-flow tests pass (`t044-green.log`); scoped lint and full typecheck pass. Existing PDF extraction is used, requested pages never silently clamp, downloads enforce 25 MB while streaming, and failed/aborted reads refund reservations.

- T043: 14 offline paper tests fail on the absent papers.ts (`t043-red.log`). Cases cover source parsing/fallback, requested pages and citation hints, whole-call/concurrent caps, invalid/closed PDFs, five-search cap, abort, 25 MB limit, privacy, lazy tenant temp files and fake-timer arXiv spacing/backoff.
- Parent T041 live verification: anonymous HF search and exact GPT-2 config passed 1/1 in about 1.09 s; no model calls.

- T042: committed a reproducible 12-page synthetic PDF and dependency-free generator based on the existing researcher PDF fixture pattern. Existing pdfInfo/pdfExtract verified 12 pages and the known page-4 text. No third-party paper is checked in.

- T041: added the opt-in live GPT-2 search/config test exactly per quickstart; default invocation skips its one network test (`t041-default.log`). No live call made in this task.

- T040: teacher/researcher registration and toggle tests failed before wiring; 92 tool, researcher and job tests now pass (`t040-green.log`), as does full typecheck. The actual server composition is chat-handler.ts, so it supplies fresh agent toggles through subagents/runner.ts; jobs.ts has no corresponding factory to modify. Approved researcher item 6 is pasted verbatim, old synthesis item renumbered to 7.

- T039: added anonymous HF server and both tools with exact draft descriptions. The decision/structured-content regressions failed first; 39 Hub/MCP/math/row tests pass (`t039-green.log`). Covers model/dataset/paper routes, rounded counts, config whitelist, exact parameters, shared cap, privacy, abort and tenancy. Optional-card/metadata failure tests failed first and now retain exact config fields without invented data; abort still propagates (`t039-optional-red.log`). Scoped lint and full typecheck pass. Typecheck initially found two test-only argument typing errors; corrected before commit.

- T038: seven offline Hub tests fail on the absent hub.ts module (`t038-red.log`), covering source text/details, exact GPT-2 fields, input/privacy checks, the shared five-call cap, service failures, abort and hosted tenancy. Additional label/count representation decisions are pending Oliver.

- T037 / Phase 5 verification: all eight complete-document checks pass (`t037-green.log`), including network, 2D/3D scatter and shapes through the inline headless path. Final targeted regression passes **38/38**, zero skipped (`phase5-targeted-green.log`), including existing token/sampling/heatmap browser regressions. Targeted ESLint and full typecheck pass (`phase5-lint.log`, `phase5-typecheck.log`). Runtime bundle is 67,503 bytes, outside startup JS. No full suite/build rerun and no `next-env.d.ts` change. Parent independently reran nine network/scatter/shapes browser tests, all passing, and inspected network/2D/3D scatter/shape phone screenshots. All 24 new screenshots were inspected by the implementer; final production-theme/composed-demo review remains T048/T052–T054. Web Interface Guidelines checked for focus, labels, scrolling, touch targets and reduced motion; no animations added.

- Phase 5 final arithmetic regression: a cancellation case exposed a difference between core's plus-first accumulation and the approved displayed arrow sequence (`t035-arithmetic-order-red.log`). Core now evaluates first plus operand, minus operands, remaining plus operands, matching the displayed path; the final 38-test run passes. A negative-first expression starts its drawn path at the origin.

- Remaining T048/convergence contract work: optional common `caption` is present in the six ML panel schemas but is not rendered by the existing runtime mount. Parent will add caption rendering for the new ML panels, without changing unrelated existing panel types.

- T036: three browser tests first failed on absent shape steps (`t036-red.log`), then passed (`t036-green.log`). Covers first-step default, selection/aria/readout, derived transitions, name+size/multiplicity changes, scalar tensors, limits, retained selection through theme/Expand, phone wrapping and touch targets. All six Shapes screenshots inspected at 320/390/1440 inline/expanded. Owner-approved derived transitions replace the board's authored semantic change text; dimensions and selected-row layout follow the board. Neutral kit theme/system font remain the T052 production comparison. Targeted lint and full typecheck pass (`phase5-typecheck.log`); all declared panel renderers now exist.

- T035 follow-up: keyboard-tested every 3D point, asserting its visible label, named Plotly highlight trace and matching aria/readout, plus Plotly hover/unhover restoring the pinned point. Passed (`t035-3d-labels-green.log`). Base 3D labels use hover/focus to avoid unreadable overlapping WebGL text; the selected point label remains visible.

- T035: four browser tests failed on absent scatter rendering (`t035-red.log`), then passed (`t035-green.log`). Covers 2D arithmetic/rings/arrows, readout/aria equality, keyboard roving/pinning, overlap-hidden labels, real Plotly 3D with visible keyboard focus, camera preservation, invalid expressions, no eligible candidate and zero-vector cosine refusal. Screenshot review found a clipped arithmetic label and unnecessary controls without arithmetic; regressions failed (`t035-label-red.log`, `t035-empty-controls-red.log`) then passed. All 12 scatter screenshots (2D/3D, inline/expanded, 320/390/1440) inspected. Board differences: third data group is red under the no-amber override; plot background/borders omitted under the contract; arithmetic annotation stays inside the plot and overlapping point labels reveal on focus; phone plots scroll internally. 3D uses the existing Plotly view, with its camera retained. Neutral kit theme/system font and production composition remain T052. Targeted lint passes; typecheck reports only scheduled Shapes renderer exhaustiveness.

- T034: browser tests first failed on absent neurons (`t034-red.log`); both now pass (`t034-green.log`). Hand-fixture values, gradients, undo/reset, roving arrows, pinning, state through expansion/theme, finite-data refusal and 44px touch controls covered. Screenshot review exposed edges crossing text with translucent kit surfaces; a regression failed (`t034-edge-red.log`) before edges were shortened to neuron boundaries. All six network screenshots at 320/390/1440 inline/expanded compared to Network/Phone: structure, sign legend and step copy retained; contract forbids board's unselected neuron borders and button borders, so they are absent. Wide graphs scroll inside the panel on phones. Neutral default theme/system font remains a T052 app-bridge comparison. Targeted lint passes; interim typecheck found and corrected vector array-index and browser-test element typing, leaving scheduled renderer exhaustiveness pending. Existing kit primitives follow shadcn guidance; manual DESIGN.md review substitutes for absent impeccable. Parent independently reran 22 core/schema tests, all passing.

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

Implementation is complete through T046. Phases 6–7 add Hugging Face search/config tools and Semantic Scholar/arXiv paper search and PDF page reading, with exact approved descriptions/doctrine, teacher/researcher toggles, per-instance call/page limits, turn aborts and tenant-scoped temporary PDFs. Hub config numbers come from config.json, parameters from exact safetensors metadata when available, and rounded download counts remain source strings. New filesystem writes are confined to the store adapter. No new dependency, UI component, amber or model call was introduced.

Verification: 39 Hub/MCP/math/row tests passed; 69 paper/researcher/tenant/chat-flow tests passed; 95 final registration/job regressions passed. Scoped ESLint and full typecheck passed after all implementation changes. Parent independently passed 13 Hub tests and 16 paper tests. Teacher cleanup tests cover success, abort and settlement failure; researcher cleanup covers success/failure. Default live tests are skipped. Parent's actual anonymous Hub test passed in about 1.09 s. Direct live arXiv page-4 extraction passed in 3.63 s, including the expected source text.

T046 is complete: Oliver approved a quoted phrase across all fields for the arXiv fallback. Exact-query/escaping regressions pass, with 27 final offline paper/row tests passing and one default live skip. The unchanged opt-in live paper test passes 1/1 in 6.94 s, including the exact title and page-4 source text. Final scoped lint and full typecheck pass. Logs, primary-source references and earlier diagnostics are in `~/agent-runs/2026-10-28-feature-008/`.

No broad npm test/build or final UI/performance review was run in these phases; the parent owns those gates. Earlier Phase 3 full suite passed 2,742 tests, zero skipped. Phase 5 screenshots and runtime bundle measurement remain in the preceding log: 67,503 bytes versus T001's 19,804 bytes, outside startup JavaScript. T001 startup baseline remains unchanged; final comparison is T054. No next-env.d.ts rewrite occurred.

Continue T047–T056. T048/convergence must also render approved common ML captions. Final production-theme screenshots, composed-demo review and broad gates remain. The ten-page cap applies only to the new paper_read; existing researcher PDF tools remain unchanged.

Publication: draft PR https://github.com/brunovskyoliver/learnharness/pull/8 targets the unmerged spec branch `claude/confident-edison-h092l5`. The parent published the earlier phase commits with identical trees and remapped SHAs; this query fix remains local for parent review/publication. No push, merge or deployment performed.
