# Quickstart: validating feature 008

## Prerequisites

- `npm ci`. `js-tiktoken@1.0.21` is pinned by T003.
- A Chrome for headless checks (`CHROME_PATH`, or the system Chrome the plot check uses).
- Network to `huggingface.co`, `export.arxiv.org` and `api.semanticscholar.org`, only for the opt-in live tests (`LH_LIVE_HF=1`, `LH_LIVE_PAPERS=1`) and T002.

## Automated (no network, no model)

```sh
npx tsx --test tests/ml-*.test.ts tests/render-ml-*.test.tsx tests/tokenize*.test.ts tests/hub-*.test.ts tests/papers-*.test.ts
npm test && npm run lint && npm run typecheck && npm run build
```

Expected:
- Tokenizer ids equal the reference fixture: 20 strings × 3 encodings (SC-001).
- The 2-3-1 network matches the hand-checked fixture to 4 significant digits (SC-002).
- Sampling sums to 100% ± 0.1 at every tested setting, and top-k leaves k tokens (SC-003).
- Lookups work against stubbed servers and fixture PDFs, including cap refusals and failures (SC-006, SC-009).

## Seeded browser check

1. Seed with `node scripts/seed-review.mjs`, which includes 008's seed (T050): sessions "UI review · ML panels" (one reply per panel kind, plus a failed panel), "UI review · ML lookups" (every row state, including failures and a citation paragraph) and "UI review · ML practice" (a practice problem with a tokens panel).
2. Run `npm run build && npm start`, with `LH_DATA_DIR` set to the seeded dir.
3. At 1440, 390 and 320 px:
   - open each session;
   - expand every row;
   - Expand every panel;
   - tab through every panel (one tab stop per dense view, arrows inside, readout updates);
   - edit the token text (the bridge re-splits in ≤ 1 s);
   - switch encodings;
   - move the sampling sliders;
   - step the network forward and backward.
4. Settings → Agent shows the three new toggles after Math check. Turning one off removes its tools from the next turn (check the request's tool list in the server log).
5. Screenshots go to `~/agent-runs/<date>-feature-008/shots/`. Compare them with the canvas boards (ui-contract.md §E).

## Live (opt-in, after T002)

- `LH_LIVE_HF=1 npx tsx --test tests/hub-live.test.ts`: searches "gpt2" and reads `openai-community/gpt2`; expects 12 layers, 768 width, 12 heads and a 50,257 vocabulary.
- `LH_LIVE_PAPERS=1 npx tsx --test tests/papers-live.test.ts`: searches "Attention Is All You Need", reads page 4 of 1706.03762, and expects "Scaled Dot-Product Attention" in the text.
