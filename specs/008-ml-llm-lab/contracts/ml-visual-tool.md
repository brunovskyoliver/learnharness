# Contract: `ml_visual` and `tokenize` tools

Both tools are on the teacher and the practice agent, under the "ML visuals" toggle (`ml_visuals`). Tool descriptions are model-facing prompt wording. The drafts below need Oliver's approval in the PR (Principle I). Don't reword them during implementation.

## `ml_visual`

Input (typebox, `src/core/ml-visual.ts`):

```text
{
  kind: "heatmap" | "tokens" | "next_token" | "scatter" | "network" | "shapes",
  title: string (1–80 chars),
  caption?: string (≤ 200 chars),
  data: <per-kind object, literal JSON; see data-model.md, same fields without expressions>
}
```

Execution, mirroring `plotTool` (`src/agent/tools/plot.ts`):
1. Check the input against the shape and limits (`mlVisualInputProblems`). On problems, return `invalidInputResult`, which shows the "Retrying…" line, as for plot.
2. `mlVisualKitSpec(input)` builds a one-panel kit spec, turning the literal data into expressions with `JSON.stringify`.
3. For `tokens`, `withTokenizedPanels(spec)` fills `tokenized`.
4. `validateDemoKitSpec(spec)`.
5. `kitDemoHtml(spec)`, then the headless `runDemo` with settle 1500 ms and the kit self-test. Errors throw: "The panel failed its check and was not shown:\n- …".
6. Return `{ text: "Panel shown: {title}.", details: { kind: "demo", result: { title, html, tested: true } } }`.

Transcript: `components/artifacts/index.ts` maps `ml_visual: PlotCard`, and `src/core/view.ts` sets `resultMessageId` for `tool-ml_visual` as it does for `tool-plot`. The live row label is "Drawing a panel…" (`ACTIVITY_LABELS`). Copy: canvas, pending owner review.

Draft description (owner approval pending):
> Show one interactive ML panel right now, in this reply: `heatmap` (attention weights, weight matrices, confusion matrices), `tokens` (how a tokenizer splits text — you give the text, the server tokenizes it; never write tokens yourself), `next_token` (next-token probabilities with temperature, top-k and top-p controls), `scatter` (labelled embedding points in 2D or 3D, optionally one vector-arithmetic expression), `network` (a small network the panel computes forward and backward from your weights) or `shapes` (tensor shapes through a sequence of operations). Heatmap, next_token and scatter values you write are shown as "Illustrative numbers"; say so in words too. Never put a question's answer in a panel posed with that question. The panel is checked in a headless browser before it shows; if the check fails you get the reason. For several linked panels, use `demo`.

## `tokenize`

Input: `{ text: string (1–2,000 chars), encoding: "o200k" | "cl100k" | "gpt2" }`.
Output text to the model: `"{count} tokens with {encoding}: " + JSON of [{id, text}]` (partial bytes as `<0xNN>`).
Details: `{ encoding, count, tokens }`. Row: "Tokenized · {count} tokens ({encoding label})" (canvas copy, pending owner review). Live label: "Tokenizing…".

Draft description (owner approval pending):
> Tokenize text exactly as a model sees it, with o200k (GPT-4o and later), cl100k (GPT-4, GPT-3.5) or gpt2. Returns the token ids and pieces. Use it whenever you state a token count or a split; never guess one. To show the split to the learner, use `ml_visual` with kind `tokens`.

## `POST /api/tokenize` (bridge backend)

- Request: `{ text: string ≤ 2000, encoding: "o200k" | "cl100k" | "gpt2" }`, JSON.
- 200: `{ encoding, tokens: Token[] }`. 400 for an invalid body (an honest message). Hosted: requires a tenant, like other routes; 401 or 403 as today. No model call and no storage. Runtime `nodejs`.

## Bridge messages (`components/artifacts/demo-card.tsx`)

- iframe → parent `demo-tokenize`: `{ type, requestId: string ≤ 40, text: string ≤ 2000, encoding }`. Accepted only from the card's own iframe `contentWindow`. Anything else is ignored.
- parent → iframe `lh-demo-tokens`: `{ type, requestId, encoding, tokens }` or `{ type, requestId, error: string }`.
- Add both to the `DemoBridgeMessage` contract (`src/core/contracts.ts`) and to the pure reducer's tests.
