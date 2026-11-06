# Quickstart: verify Notebook mode

## Automated

```bash
npm test                 # unit, store, server, render (faux models)
npm run test:e2e         # Playwright: tests/e2e/notebook/*.spec.ts, own server on :3124, LH_NOTEBOOK_FAUX=1
npm run lint && npm run typecheck && npm run build
```

## Real model, by hand (evidence in ~/agent-runs/2026-11-06-notebook-mode/)

1. `LH_DATA_DIR=$(mktemp -d) npm run dev`, then set up a provider key and the strong slot in Study → Settings.
2. Mod+Shift+O → Notebook opens a new note. Title "Forces on a ramp", write two claims, pause. Expect underline + blot, then a margin question with a tether; the corner hint shows Reading… with cost and Stop.
3. Expand it, Write back, get a reply; collapse ("1 reply"); Resolve another.
4. Select a sentence → Visualize; step through the sketch; See it larger; Escape.
5. Open chat, click a starter, send; answer streams.
6. Set Instructions and a reviewer; trigger Think about this; the reply follows both.
7. Just my words (Mod+Shift+H): nothing of the AI on the page.
8. Export PDF, Word, Markdown with the toggle on and off; open each file.
9. Settings: change every option; Appearance Light/Dark/System; reload; persists.
10. Mod+Shift+O to Study; the page is in the Library with identical text; back again; same note, threads intact. Repeat 20 times with edits (SC-002).
11. Repeat 2-9 at 390 px (Marks only, inline threads) and in both themes.
12. Side-by-side: run `node scripts/notebook-compare.mjs` (renders seeded notes matching the reference frames at 1440×1026 and writes pairs to the evidence folder).
