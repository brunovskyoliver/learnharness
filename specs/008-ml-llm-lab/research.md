# Research: ML and LLM learning lab (008)

Date: 2026-10-28. This environment's network blocked `huggingface.co`, `export.arxiv.org`, `api.semanticscholar.org` and their docs pages (HTTP 403 from the session proxy). So the decisions for those services rest on published documentation found by web search, and **T002 (live probe) must run before any lookup code is written**. The tokenizer was measured locally.

## R1 — Tokenizer library

- **Decision**: `js-tiktoken@1.0.21`, server-only, through its `lite` entry plus per-encoding rank files loaded with dynamic `import()`: `js-tiktoken/ranks/o200k_base`, `.../cl100k_base` and `.../gpt2`. Each loaded encoding is cached for the life of the process. Approved by Oliver, 2026-10-28 (Clarifications).
- **Measured 2026-10-28** (node 22, this container) on `"Tokenizers split unbelievably long words. 🙂 Ünïcode\n"`:
  - o200k_base: first load 941 ms, 12 tokens: `Token|izers| split| unbelievably| long| words|.| 🙂| Ün|ï|code|\n`.
  - cl100k_base: first load 431 ms, 14 tokens: `… unbelie|vably …| Ü|n|ï …`.
  - gpt2 ranks (r50k): first load 163 ms, 13 tokens.
  - After the first load, encoding takes well under a millisecond. The package is pure JS, 22 MB unpacked (mostly rank tables), with no native code and no network.
- **Byte pieces**: decoding a single token that covers part of a multi-byte character yields U+FFFD. For such tokens the panel shows the token's bytes as `<0xE2>` hex (FR-004, edge case), using `encodeSingleToken`/`decode` on the token's byte array.
- **Rationale**: it's the reference implementation's JS port, so it's exact for these encodings (SC-001), needs no GPU and no Python, and stays out of the client bundle.
- **Alternatives**: `@huggingface/transformers` tokenizers (rejected by the owner's choice of encodings, and much larger); `gpt-tokenizer` (similar, but fewer encodings verified here); calling the OpenAI API (cost, network, no GPT-2).

## R2 — How the six panels fit the demo kit

- **Decision**: add six panel types to `DemoKitSpecSchema` (`src/core/demo-kit.ts`) and render them in `src/demo-kit/runtime.ts`:
  - `heatmap`, `tokens`, `next_token`, `scatter`, `network` and `shapes`;
  - data fields are kit expressions (strings), like every existing panel, so the demo builder can drive them from `params`/`state`;
  - the inline tool turns literal JSON into expressions with `JSON.stringify`, as `plotKitSpec` does (feature 005).
- **Tokens never come from the agent**: the `tokens` panel schema takes `text` and an optional default `encoding`. A server-side finalizer (`withTokenizedPanels(spec)`, agent layer) tokenizes the text with all three encodings and writes them into a reserved `tokenized` field before `kitDemoHtml`. `validateDemoKitSpec` rejects a spec that already carries `tokenized` (FR-004, FR-007). The same finalizer runs in `write_kit_demo` (demo builder) and in the inline tool.
- **Labels are set by type, not by the spec**: `heatmap`, `next_token` and `scatter` always render "Illustrative numbers". There is no schema field to turn it off (FR-011).
- **Linked highlight (FR-003)**: an optional `link` string on a panel. Panels with the same `link` share hover and focus by label text through a small in-runtime event (`k-link`, details: `{link, label}`).
- **Pure maths in core**: softmax with temperature, top-k, top-p and renormalisation (`src/core/ml-sampling.ts`), forward and backward for the small network (`src/core/ml-net.ts`), and vector arithmetic with nearest neighbour (`src/core/ml-vectors.ts`). The runtime bundle imports them (`scripts/build-demo-kit.mjs` already bundles from `src`), so tests check the exact numbers the learner sees (SC-002, SC-003).
- **Rationale**: one renderer for both routes (Clarification: both routes), headless self-test included, and the theme bridge and download keep working.

## R3 — The inline tool

- **Decision**: one tool, `ml_visual`, for teacher and practice. It takes `{ kind, title, caption?, data }` with `kind` ∈ the six panels and `data` shaped per kind (contracts/ml-visual-tool.md). Execution follows `plot` exactly:
  1. validate;
  2. build the kit spec;
  3. tokenize if needed;
  4. `kitDemoHtml`;
  5. run it in headless Chrome with the self-test;
  6. return `details: { kind: "demo", result: { title, html, tested: true } }`.

  Failures go back to the model as error results. Registered under the "ML visuals" toggle (`ml_visual` and `tokenize`).
- **Transcript**: same as plot, registered under `ml_visual: PlotCard` in `components/artifacts/index.ts`, and `view.ts` sets `resultMessageId` for `tool-ml_visual` as it does for `tool-plot`. A failed check is a quiet tool row (`tool-call-card` path), and the agent explains in words.
- **`tokenize` tool**: returns `{ encoding, count, tokens: [{ id, text }] }` to the model for counting questions. Its transcript row is a generic quiet tool row, "Tokenized · {n} tokens ({encoding})". The canvas proposes this copy, pending owner review in the PR.

## R4 — Editable token text (Clarification)

- **Decision**: a new bridge request from the iframe, `demo-tokenize` `{ requestId, text, encoding }`.
  - `components/artifacts/demo-card.tsx` validates it: the source is the card's iframe window, `text` is a string ≤ 2,000 characters, `encoding` is one of three, and `requestId` is a short string. It then calls `POST /api/tokenize` and replies `lh-demo-tokens` `{ requestId, encoding, tokens } | { requestId, error }`.
  - The runtime debounces edits by 300 ms, keeps the last split at 60% opacity while updating, and shows the error inline (canvas TokenStrip board).
  - The route needs a tenant in hosted mode (like other `/api` routes), never calls a model, and stores nothing.
- **Without a bridge** (headless check, downloaded HTML): the field is read-only, the precomputed splits for all three encodings still switch, and a muted line says "Editing works in the app" (canvas copy, pending owner review).
- **Rationale**: the iframe stays sandboxed (`allow-scripts` only, Principle VII), and the parent validates every message (existing bridge rules).
- **Alternative rejected**: tokenizing in the iframe would ship megabytes of rank tables into every demo and break the startup budget.

## R5 — Hugging Face Hub

- **Decision (pending T002)**: add `huggingface: { label: "Hugging Face", url: "https://huggingface.co/mcp", transport: "streamable-http", timeoutMs: 25_000 }` to `MCP_SERVERS`. Expose two LearnHarness-shaped tools, never raw MCP tools (007's rule):
  - `hub_search { kind: "models" | "datasets" | "papers", query, limit ≤ 10 }`: maps to the server's search tools.
  - `hub_model { repo }`: the model card summary through MCP, plus the model's `config.json` fetched over plain HTTPS from `https://huggingface.co/{repo}/resolve/main/config.json`. The JSON is parsed into a fixed whitelist of architecture fields (`n_layer`/`num_hidden_layers`, `n_embd`/`hidden_size`, `n_head`/`num_attention_heads`, `vocab_size`, `n_positions`/`max_position_embeddings`, `intermediate_size`, `num_key_value_heads`, `model_type`, `torch_dtype`), with a parameter count from safetensors metadata when the API reports it.
- **Known from Hugging Face's published material** (search, 2026-10-28):
  - the server at hf.co/mcp supports anonymous access with a default tool set, and a READ token only customizes it;
  - documented capabilities include model search, dataset search, paper search, and docs search;
  - Spaces apps are excluded here.
  - Exact anonymous tool names and limits are unverified.
- **T002 probe must record**: `initialize` result; `tools/list` (anonymous); one call each to model search, dataset search and paper search; one `config.json` fetch; latency; and the response to 20 quick calls (rate limiting).
  - If anonymous search tools are missing, `hub_search` falls back to the public Hub REST API (`/api/models?search=`, `/api/datasets?search=`). The server entry stays for whatever it does offer, and the fallback is recorded under Decisions.
- **Rationale for config over HTTPS**: the numbers must be exact (FR-015, SC-006), and `config.json` is the source. An MCP tool's prose summary might round or omit fields.

## R6 — Papers: arXiv and Semantic Scholar

- **Decision**: plain HTTPS clients in `src/agent/papers/`, not MCP. There is no official arXiv or Semantic Scholar MCP server, and community servers would put a third party's code between us and the data. The spec allowed either (FR-016).
  - `paper_search { query, limit ≤ 10 }`: Semantic Scholar Graph API `/graph/v1/paper/search` with fields `title,authors,year,externalIds,abstract,openAccessPdf`. If Semantic Scholar fails or rate-limits, it falls back to the arXiv API `export.arxiv.org/api/query` (Atom XML). The row names the source that answered.
  - `paper_read { paper, pages }`: `paper` is an arXiv id or an `openAccessPdf` URL from a prior search in the same turn. The PDF downloads into a per-turn temp dir and pages come through `pdfExtract` (`src/agent/subagents/pdf-ops.ts`, pdfjs, no native code). A per-instance page counter enforces the 10-page cap (Clarification).
  - Citation links use `https://arxiv.org/pdf/{id}#page={n}`, or the open-access URL with `#page={n}`.
- **Known from published material** (search, 2026-10-28):
  - Semantic Scholar: most endpoints work without a key, under a shared unauthenticated rate limit that can throttle under load.
  - arXiv: its API terms require respecting rate limits, and the team said in May 2026 that it isn't raising them now.
  - Exact numbers are confirmed in T002. Until then, the clients space arXiv requests at least 3 s apart per process and back off once on HTTP 429.
- **Researcher**: gains `hub_search`, `hub_model`, `paper_search` and `paper_read`, with the same caps. Its existing `web_fetch_pdf` and `pdf_*` tools stay unchanged.

## R7 — Settings, limits and doctrine

- **Settings**: `TOGGLEABLE_TOOLS` (`src/core/pending.ts`) and `TOGGLE_TOOLS` (`components/settings/agent-section.tsx`) gain `ml_visuals`, `model_hub` and `papers`, in that order after `math_check`. Copy is as clarified. Each toggle filters its tools in `createTeacherTools`, the practice registry and the researcher run options.
- **Per-turn limits**: counters on tool instances, as in `mathCheckTool` (instances are built per request): 5 for `hub_search` + `hub_model` combined, 5 for `paper_search`, and 10 pages for `paper_read`.
- **Doctrine**:
  - new teacher fragment `src/agent/prompts/teacher/36-ml-lab.md`: when to use each panel; illustrative versus computed; look up model numbers before stating them; cite pages; never reveal a question's answer in a panel.
  - practice base: panels may illustrate, but never the committed answer.
  - researcher: may use the lookups and must cite the Hub page or paper page.
  - Exact wording is drafted in contracts/doctrine.md for owner approval in the PR.

## R8 — Performance

- **Startup and client bundle are untouched**:
  - the tokenizer, the lookup clients and pi-mcp are server-only, behind dynamic imports;
  - panel code goes into `public/demo-kit/runtime.js`, which loads only inside demo iframes;
  - the 3D scatter reuses the kit's lazily loaded Plotly.
- **Runtime size**: measure the size of `public/demo-kit/runtime.js` before (T001) and after. It isn't part of the startup budget, but report it.
