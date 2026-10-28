# Data model: ML and LLM learning lab (008)

Nothing new is stored outside the transcript:
- Panels ride their tool result as demo HTML, like plots in 005.
- Lookups ride their tool result `details`, like math checks in 007.
- The tokenize route stores nothing.

## Kit panel specs (`src/core/demo-kit.ts`)

All data fields are kit expressions (strings evaluated in the sandbox), except `text` on `tokens`, which is a literal string. Common optional fields: `title`, `width` (`full` | `half`), `caption` (one sentence, muted, under the body), and `link` (a string that joins linked highlight).

| Panel | Data (expression results) | Limits | Label |
|---|---|---|---|
| `heatmap` | `rows: string[]`, `cols: string[]`, `values: number[][]` (rows × cols), `scale: "sequential" \| "diverging"`, optional `min`, `max`, `rowAxis`, `colAxis`, `digits` | ≤ 64×64, finite numbers, matching lengths | Illustrative numbers |
| `tokens` | literal `text` (≤ 2,000 characters), `encoding` default `o200k` \| `cl100k` \| `gpt2`; reserved `tokenized` written only by the server | text non-empty | none |
| `next_token` | `context: string`, `tokens: {text, logit}[]` or `{text, p}[]` (exactly one form), defaults `temperature` 1, `topK` 0 (off), `topP` 1 | ≤ 30 tokens; probabilities sum to 1 ± 0.01 if given | Illustrative numbers |
| `scatter` | `points: {label, x, y, z?, group?}[]`, `groups?: string[]`, `arithmetic?: {plus: string[], minus: string[]}` (labels), `metric: "cosine" \| "euclidean"` | ≤ 200 points, unique labels, all 2D or all 3D | Illustrative numbers |
| `network` | `layers: number[]` (sizes incl. input and output), `weights: number[][][]`, `biases: number[][]`, `input: number[]`, `target: number[]`, `activation: "sigmoid" \| "tanh" \| "relu"`, `loss: "mse" \| "bce"` | 2–5 layers, ≤ 8 per layer, weight shapes match layer sizes | none |
| `shapes` | `dims?: {name, meaning}[]`, `steps: {op, shape: {name, size?}[]}[]` | 1–24 steps, ≤ 6 dims per shape | none |

Validation (`validateDemoKitSpec`) checks shapes and limits after evaluating literal-only fields where it can. Expression-driven data is re-checked in the runtime: an invalid evaluated value renders the kit's `.k-error` line, which the headless self-test reports as a failure.

## Tokenized text (server → runtime)

`tokenized: { o200k: Token[], cl100k: Token[], gpt2: Token[] }`, where `Token = { id: number, text: string | null, bytes?: number[] }`. `text` is null when the token is a partial UTF-8 sequence; then `bytes` holds its bytes and the chip shows `<0xNN>`.

## Lookup results (tool result `details`)

- **HubLookup**:
  - `{ kind: "search", what: "models" | "datasets" | "papers", query, results: {id, title?, task?, downloads?, likes?, url}[], ms }`
  - `{ kind: "model", repo, url, fields: {label, key, value}[], params?: number, cardSummary?: string, ms }`
- **PaperSearch**: `{ source: "semantic-scholar" | "arxiv", query, results: {title, authors: string[], year?, arxivId?, s2Id?, abstract?, pdfUrl?, url}[], ms }`.
- **PaperRead**: `{ title, paper: {arxivId?, url}, pages: number[], pagesUsedThisTurn: number, cap: 10, ms }`. The extracted text goes to the model only, never into `details`, which keeps transcripts small.
- **Failure**: an `isError` result, its text in plain words starting "The Hugging Face lookup is unavailable: …", "The paper search is unavailable: …" or "The paper could not be read: …". No details.

## Per-turn counters (tool instances; registries are built per request)

`hub` 5 calls (search + model) · `paper_search` 5 calls · `paper_read` 10 pages · `ml_visual` none beyond the headless check · `tokenize` none.

## Settings (`settings.agent.tools`)

New keys `ml_visuals`, `model_hub` and `papers`, all booleans, default true. Absent means on. Existing saved settings need no migration.
