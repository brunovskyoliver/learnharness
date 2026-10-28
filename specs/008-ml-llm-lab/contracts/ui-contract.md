# Contract: UI (binding for implementation)

Design source: canvas **https://claude.ai/artifact/EmWdcYcnZrXu5Ng1VyHiA6** ("008 ML and LLM lab — designs"), boards Main, TokenStrip, NextToken, Heatmap, Network, Scatter, Shapes, Rows and Phone. DESIGN.md wins over everything, then this file, then the canvas. Where the canvas shows sample data, the layout is binding and the data is not.

Every "MUST" below is checked in review. A deviation needs Oliver's approval first; don't decide it yourself.

## A. Panels (inside the demo iframe, `src/demo-kit/runtime.ts`)

1. **Only kit tokens.** Colours, fonts and sizes come from the kit's CSS variables: `--lh-bg`, `--lh-surface`, `--lh-surface-2`, `--lh-border`, `--lh-text`, `--lh-muted`, the series `--lh-blue`, `--lh-teal`, `--lh-amber`, `--lh-red`, `--lh-green`, plus `--lh-font`, `--lh-mono` and `--lh-demo-size`. MUST NOT hard-code hex values (the canvas hexes are the dark theme's values of these tokens). MUST NOT import app CSS or Tailwind into the runtime.
2. **Panel head** reuses `.k-panel-head`: the title is the existing `h3` (1em/600, `--lh-text`). The right side holds, in this order:
   - "Illustrative numbers" for `heatmap`, `next_token` and `scatter`: a `<span class="k-illustrative">` at `.8em`, weight 500, `--lh-muted`, never amber, never a pill or badge, text exactly as written;
   - the existing Expand `.k-icon-button` (add `heatmap`, `next_token`, `scatter` and `network` to the expandable list).
   - On widths < 560px, the label moves under the title (canvas Phone board).
3. **No borders or cards inside a panel.** The body is transparent on the demo ground, like existing panels. The only edges allowed are the text field's `--lh-border`-based input edge, and the focus or selected outline.
4. **Readout line**: every panel except `shapes` has one `<p class="k-readout-line" aria-live="polite">` under the body, at `.8em` in `--lh-muted`. It describes the focused or hovered item in words and numbers, using the canvas copy patterns:
   - tokens: "Token 4 of 9 · “ized” · id 1143";
   - heatmap: "Query “mat” → key “cat” · 0.48";
   - next_token: "Sampled “mat” · 6 tokens could be drawn";
   - network: "Hidden h2 · value {4 decimals} · gradient {sign and 4 decimals}" ("not computed yet" before its step);
   - scatter: "king − man + woman lands nearest “queen” · Euclidean distance 0.04".
   - The shape tracer's readout is its selected step: "Step 3 of 7 · Split into heads · (B, H, T, D) · split C into H × D".
5. **Controls** use only the existing kit control classes: `.k-field` with range input, `.k-label` with `<b>` value (tabular numerals), `.k-seg` for encoding and scale choices, and `.k-btn` / `.k-btn.k-primary`. The single primary action per panel:
   - next_token: **Sample**;
   - network: **Step forward**, which becomes **Start backward** at step 2, then **Step backward**, with secondary **Back a step** and **Reset**.
   - `k-primary` is the ink fill and MUST NOT use amber.
6. **Dense views are one tab stop** with arrow keys inside (roving `tabindex`): heatmap cells (`role="grid"`/`row`/`gridcell`), token chips, scatter points and network neurons. Enter or Space pins the item to the readout. Every focusable item has an `aria-label` that carries the same information as the readout. Focus outline: the kit's `button:focus-visible` rule.
7. **Numbers**: tabular numerals in the kit font. Monospace (`--lh-mono`, 12px) only for token ids, gradients shown under neurons, and tensor shapes.
8. **Colours by role**:
   - token chips cycle the five series at 20% over `--lh-surface` (34% and an inset 1px series outline when focused);
   - heatmap sequential is `--lh-bg` → `--lh-blue`; diverging is `--lh-blue` (negative) → `--lh-bg` → `--lh-red` (positive), with a legend showing min, mid and max;
   - next_token bars are `--lh-blue`. Cut rows are muted text and an outline-only bar, and the reason is written in the value column ("cut by top-k", "cut by top-p");
   - network edges: red for positive and blue for negative weight, width `1 + 4|w|` px, legend in words;
   - scatter groups use the series in order, with a legend in words; the arithmetic result is a 2px ring in `--lh-text`;
   - shapes: changed dims get `--lh-surface-2` plus an inset 1px `--lh-text` edge, and the change is written out. Colour is never the only cue.
9. **Token chips**: the piece at reading size with whitespace visible (`␣` for a leading space, `↵` for a newline), the id under it in mono 12px, and a byte piece as `<0xNN>`. The count line reads "{n} tokens · {m} characters", or "Updating…" while an edit is in flight; the old chips stay at 60% opacity meanwhile. Errors use `.k-error`: "Couldn't tokenize this text: {reason}. The last split stays shown." and "2,000 characters at most. Shorten the text to split it."
10. **Overflow**: a heatmap wider than the frame and long strips scroll inside the panel, with hidden scrollbars (`DEMO_SCROLLBAR_CSS`). Values print inside heatmap cells only when a cell is ≥ 44px wide. The page never overflows at 320, 390 and 1440 px.
11. **Motion**: stepping and slider changes animate at most 160ms. Under `prefers-reduced-motion: reduce` there is no transition.
12. **Focus mode** (Expand): panels follow the existing `.k-focus` layout. Controls move to the side column, and on phones they collapse under the existing parameters toggle.

## B. Transcript rows (`components/artifacts/lookup-row.tsx`, new)

1. **Clone the skeleton of `math-check-card.tsx`**, MUST keep it identical:
   - `SessionDetails` with `className="group lh-reading my-1"`;
   - `<summary className="flex cursor-pointer select-none list-none items-center gap-2 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden">`;
   - headline `font-medium` (destructive on failure), then the ChevronRight at `size-3 opacity-50`, rotating on open;
   - panel `mt-2 space-y-2 rounded-xl border bg-card p-3 text-sm`;
   - `Row` labels `mb-1 font-medium text-muted-foreground`.
   - No new tokens and no amber.
2. **Headlines** exactly as in spec FR-014/FR-018 and the Rows board. Running rows follow `live-tool-card.tsx`'s math-check branch (spinner + shimmer, input never shown), with labels "Looking up on Hugging Face…", "Searching papers…", "Reading a paper…", "Drawing a panel…" and "Tokenizing…" (canvas copy, pending owner review).
3. **Field grid for `hub_model`**: two columns. The label is in words ("Layers"), and the value is mono 12px as `key value` (`n_layer 12`). Then a link "Open on Hugging Face", then "Took {s} s".
4. **Paper results**: the title as a link (15px), then the meta line "{authors, up to 3, then et al.} · {year} · arXiv {id} · Open-access PDF" or "· No open-access PDF". Read rows list the page links ("p. 3", "p. 4", …) and "{n} of 10 pages this turn".
5. **Links**: `target="_blank" rel="noreferrer"`, ink colour with a 40% underline (`underline decoration-foreground/40 underline-offset-[3px] hover:decoration-foreground`). Accessible name includes the destination. Never amber.
6. **Failure reason** in sans (`Row mono={false}`), destructive ink.
7. **Everything in the panel is selectable**; only the summary is `select-none`.

## C. Citations in replies

These are ordinary markdown links the agent writes, so no new component: `([Vaswani et al., 2017, p. 4](https://arxiv.org/pdf/1706.03762#page=4))`. They render with the transcript's existing link style. If that style uses amber anywhere, stop and report it; don't restyle.

## D. Settings

Three `SettingsRow` + `Toggle` entries after Math check in `TOGGLE_TOOLS`, with copy exactly as clarified. Accessible names: "tool ml visuals", "tool model hub", "tool papers". Test ids: `toggle-tool-ml-visuals`, `toggle-tool-model-hub`, `toggle-tool-papers`.

## E. Review gate

- Before calling UI done, take screenshots at 320, 390 and 1440 px of each panel (inline and expanded), each row state (running, done, expanded, failed) and the settings rows, using the seeded sessions from quickstart.md. Compare them board by board with the canvas and note each difference in `progress.md`.
- Run the `shadcn`, `impeccable` and `web-design-guidelines` skills if installed; otherwise do the manual DESIGN.md review and record it (Principle VI exception, as in 005 and 007).
