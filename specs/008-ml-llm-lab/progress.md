# Progress: 008 ML and LLM learning lab

## Stage

Implementation in progress: Phase 1 setup (T001–T003) complete; Phase 2 foundational work is next. Oliver supplied local interactive design exports and approved reconstructing the missing T001 benchmark.

Specified, clarified, designed, planned, tasked and analyzed on 2026-10-28. **Implementation started.** Binding handoff: see [handoff.md](handoff.md).

## Decisions

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

Preflight access blockers resolved by Oliver’s supplied HTML exports and approval to rebuild the benchmark. Evidence is under `~/agent-runs/2026-10-28-feature-008/`.

Pending implementation.
