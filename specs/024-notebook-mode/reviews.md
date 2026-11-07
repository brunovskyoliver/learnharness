# Feature 024: UI reviews (T049)

Scope: `components/notebook/**`, `app/(app)/notebook/**` (`notebook.css`, `notebook-fonts.ts`, the route). Authority: DESIGN.md "## Notebook"; where a rule disagrees with DESIGN.md or an exact Riddled value (contracts/visual-reference.md), DESIGN.md / Riddled wins and the finding is recorded as kept by design. Run 2026-11-07, in order: `impeccable` (audit), then `web-design-guidelines`.

Evidence beyond reading the code: the impeccable detector (`impeccable detect --json`), a reduced-motion probe (every layer opened under `prefers-reduced-motion: reduce`, `document.getAnimations()` read after each), a keyboard focus probe (computed outline of each focused control), contrast computed from the tokens, and the T046 compare run (`~/agent-runs/2026-11-06-notebook-mode/compare/`). The impeccable skill asks for one interview probe before inferring; this session has no question tool, so the brief (this task and DESIGN.md) stood in for it.

## 1. impeccable audit

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Faint text and the focus ring sat under AA contrast (Riddled's values); raised to pass by the owner's decision 2026-11-07, see Resolution |
| 2 | Performance | 3 | Animations are transform/opacity/stroke only; layout reads batched in layout effects |
| 3 | Responsive | 3 | Phones fall back to Marks only; coarse targets 44 px; phones are out of focus by the owner |
| 4 | Theming | 4 | Every colour is a token with light, dark and system values; hex only in Riddled's own sheen/thumb/backdrop |
| 5 | Implementation integrity | 3 | Coherent and specific; two state bugs found and fixed |
| **Total** | | **16/20** | **Good** |

Integrity verdict: pass. The mode is one product-specific system (paper, grain, two voices, ink-on-paper motion), scoped under `.nb-root`, traceable line by line to visual-reference.md.

Findings:

- **[P1] Hovering the chosen option card hid its state.** `button.nb-option-card:hover` (0,3,1) outranked `[data-state=checked]` (0,3,0), so the chosen card's 1.5 px ink ring became the 1 px faint hover ring under the pointer (Settings, Export). The frame sidebar-and-settings has the pointer on the chosen card with its ring. Fixed.
- **[P1] Notes changed sides while the sidebar opened.** Margin widths were measured from the column's on-screen box, which includes the sheet's slide (`translateX(288px)`); the right margin shrank below a note's minimum and right notes jumped into the left margin (seen in the sidebar-open strip). Fixed: `columnSpace()` measures without the sheet and page transforms; new e2e "opening the sidebar slides the page but keeps every note on its side" (fails without the fix).
- **[P1, owner] `--faint` under 4.5:1.** `#8e8a83` on paper `#f8f7f4` is 3.21:1 (3.01:1 on shelf); dark `#7a776f` on `#1a1a19` is 3.89:1. It carries meta, hints, placeholders, reply counts, Resolve / Dismiss, the corner hint and the toolbar labels. `--text-gray` is 3.62:1. Kept: Riddled's exact tokens (DESIGN.md says so); changing them needs the owner.
- **[P2, owner] Focus ring under 3:1.** Riddled's `outline: 2px solid var(--riddle-line)` (ink at 32%) is 2.0:1 against paper and 2.77:1 in dark (WCAG 1.4.11). Kept by design; owner decision.
- **[P2, owner] Keyboard-active row in the slash and [[ menus** is only the `--shelf` fill (1.06:1 against paper), Riddled's hover fill; focus stays in the editor (active descendant), so no outline shows. Kept; owner decision whether such rows also get the ring.
- **[P3] Detector: 8 × "bounce or elastic easing"** (`cubic-bezier(.2,.9,.25,1.12)`, `(.2,.9,.25,1.2)`, `(.3,1.4,.5,1)`, `(.2,1.4,.4,1)`): the blot splat, sketch pops and the pointer catch. Kept by design: Riddled's exact curves (visual-reference §10.1, §10.4, §16.3, §21).
- Reduced motion: pass. With `reduce`, no animation or transition is running after opening the sidebar, the chat, Export, the selection menu, or during and after a Think run; the theme cross-fade is instant.
- Positive: every scroller hides its track; text fields show their caret instead of an outline (Riddled's); live regions cover runs, refusals, failures and saves; every icon is `aria-hidden` with a named button; Escape closes one layer at a time (a11y.spec).

## 2. web-design-guidelines

```text
## components/notebook/overlay-sidebar.tsx
overlay-sidebar.tsx:82 - note rows were <button> + router.push → no Cmd/Ctrl-click, middle-click → fixed: <a href> with plain click handled in place
## app/(app)/notebook/notebook.css
notebook.css:133 - Study's html stays color-scheme dark and rubber-bands its dark canvas behind a light notebook → fixed: html:has(.nb-root) overscroll-behavior none (fine pointers) and color-scheme light for light/system-light
notebook.css - `text-wrap: balance` not on the title → kept (Riddled sets none)
## components/notebook/*.tsx (copy)
corner-hint.tsx:87, note-chat.tsx:241, thread.tsx:54, export-dialog.tsx:135, chrome.tsx:22 - straight apostrophes (Study's, it's) → fixed after review at the owner's request: typographic ’ “ ” in every Notebook string and in ui-contract.md
overlay-sidebar.tsx:156 - placeholder "Find or start a note" has no "…" → kept (Riddled's string)
selection-menu, toolbar, footer - sentence case, not Title Case → kept (Riddled and ui-contract)
## components/notebook/sketch.tsx, inline-reply.tsx, note-chat.tsx, thread.tsx
✓ pass (named controls, aria-live captions and statuses, decorative icons hidden, no div/span click handlers, no transition: all, no autoFocus, no onPaste)
## forms (thread.tsx:132, note-chat.tsx:255, instruction-line.tsx:89, note-view.tsx:111, reviewers.tsx:79, overlay-sidebar.tsx:156)
✓ labelled (aria-label or label[for]); the search and reviewer name set autoComplete off; textareas need none
## destructive actions
✓ Resolve / Dismiss and reviewer Delete have a 6 s Undo
## theme
<meta name="theme-color"> is not set for Notebook → not changed: the owner deprioritised phones (spec Clarifications); listed for later
```

## Resolution

| Finding | Source | Resolution |
|---|---|---|
| Chosen card ring hidden on hover | impeccable | Fixed (notebook.css) |
| Notes change sides while the sidebar opens | impeccable (compare strip) | Fixed (`columnSpace`, margin.tsx, thinking.tsx) + e2e |
| Sidebar note rows not links | web-design-guidelines | Fixed (`<a href>`, overlay-sidebar.tsx) |
| Dark html canvas and rubber band behind light paper | web-design-guidelines | Fixed (notebook.css) |
| `--faint` 3.2:1 / 3.9:1, `--text-gray` 3.6:1 | impeccable | Fixed (owner 2026-11-07, "Raise to pass"): faint `#716d67` / `#858279`, gray `#716d66` (dark `#9a968e` already 5.9:1); ≥4.5:1 on paper and shelf in both themes, lightness only; `tests/notebook-contrast.test.ts` |
| Focus ring 2.0:1 / 2.8:1 | impeccable | Fixed (owner 2026-11-07): new `--nb-focus` `#8c8a88` / `#676661`, ≥3:1 on paper and shelf; `--riddle-line` kept for marks, links and tethers |
| Slash / [[ menu active row only a shelf fill | impeccable | Fixed (owner 2026-11-07): the row adds a 2px `--nb-focus` ring inset -2px over the fill (≥3:1 on paper and shelf) |
| Bounce easings (8) | impeccable detector | Kept by design (Riddled's curves); approved by owner 2026-11-07 |
| Straight apostrophes in strings | web-design-guidelines | Fixed (owner asked): ’ in every Notebook string and ui-contract.md |
| Placeholder without "…", sentence case, no text-wrap balance | web-design-guidelines | Kept by design (Riddled); approved by owner 2026-11-07 |
| No theme-color for Notebook | web-design-guidelines | Deferred (phones out of focus); approved by owner 2026-11-07 |

## Re-review 2026-11-07 (after contrast raise)

Scope and authority as above, on 930a170 (the tighter frame match: no clamp, offsets, hover tether, selection menu rows) plus the Markdown subset and math from the T047 pass (c8595e5). Run in order: `impeccable` (audit), then `web-design-guidelines` (guidelines fetched fresh from vercel-labs/web-interface-guidelines). Evidence: `impeccable detect --json` over components/notebook and app/(app)/notebook, reading every file changed since 729f10c, token contrast computed from notebook.css, and the compare re-run.

### impeccable audit

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | The AI's math rendered as KaTeX HTML only, so a screen reader read glyph fragments; fixed |
| 2 | Performance | 3 | Unchanged: transform/opacity/stroke animation only; layout reads batched in layout effects |
| 3 | Responsive | 3 | Unchanged: Marks only on phones, 44px coarse targets; tap behaviour fixed under web-design-guidelines |
| 4 | Theming | 4 | Every colour a token in light, dark and system; contrast tokens pass (tests/notebook-contrast.test.ts) |
| 5 | Implementation integrity | 4 | One product-specific system; the detector's only findings are Riddled's own easings |
| **Total** | | **17/20** | **Good** (16/20 before) |

Findings:

- **[P1] AI math had no accessible text.** `ink-text.tsx` rendered `$…$` / `$$…$$` with KaTeX `output: "html"`; with no MathML a screen reader reads the HTML's glyph spans. Fixed: `output: "htmlAndMathml"` (katex.min.css, loaded by the app layout, hides the MathML visually), as Study's rehype-katex does; render-notebook-reading asserts the `<math>` with its TeX annotation.
- **[P2] A faded note reached by the keyboard stayed at .38.** While a thread is open the other notes fade (DESIGN.md, frame); the pointer un-fades the note it is on, the keyboard did not, so a focused note read at ≈2.2:1. Fixed: `[data-faded="true"]:focus-within { opacity: 1 }`; notebook-contrast asserts it.
- **[P3, resolved under the owner's contrast ruling (2026-11-07, "Raise to pass")] Faded notes at rest were ≈2.2:1 light / 3.1:1 dark** (`--riddle` at .38; light orange 1.63:1). Raised to the smallest opacity at which every AI ink blended over paper reaches 4.5:1: `--nb-faded` .97 light (worst orange 4.55:1) / .82 dark (worst red 4.53:1). Light orange `--text-orange` itself was 4.14:1 at full strength, so it moved along lightness to `#a9580e` (4.79 paper / 4.50 shelf). DESIGN.md, visual-reference §1.1 and §8.1 record the deviation; tests/notebook-contrast.test.ts asserts every ink at full strength and faded, and that one step lower fails. Note: the faint "{n} replies" line inside a faded note is 4.52:1 light but 3.48:1 dark at .82 (faint text reaches 4.5:1 only near full opacity); the ruling's brief covered the AI ink, so this is listed, not changed.
- **[P3, kept by design, approved 2026-11-07] Detector: 8 × bounce easing**, the same eight as the first review (Riddled's curves, visual-reference §10.1, §10.4, §16.3, §21).
- Checked and passing: the hovered note's spine-only tether is `aria-hidden` decoration; removing the clamp leaves the collapsed note one button whose accessible name is the whole question; the open thread's new 8px bottom space sits inside its focus ring; reduced motion still draws tethers at once.

### web-design-guidelines

```text
## app/(app)/notebook/notebook.css
notebook.css - buttons, links, menu items, radios, tabs: no touch-action: manipulation → fixed (taps act at once)
notebook.css - no intentional -webkit-tap-highlight-color (browser blue flash on paper) → fixed: ink at 8%
notebook.css:1104 - corner hint's running cost changes in place without tabular-nums → fixed
## components/notebook/chrome.tsx
chrome.tsx:22 - wordmark name machine-translatable → fixed: translate="no"
## components/notebook/ink-text.tsx
ink-text.tsx:58 - KaTeX html-only output (no text alternative) → fixed (see impeccable P1)
## copy (overlay-sidebar.tsx, reviewers.tsx, instruction-line.tsx, note-chat.tsx)
placeholders without "…", sentence case, no text-wrap balance on the title → kept (Riddled's strings and ui-contract; approved by owner 2026-11-07)
## theme
<meta name="theme-color"> not set for Notebook → kept (phones out of focus; approved by owner 2026-11-07)
## components/notebook/*.tsx (everything else)
✓ pass (every button typed and named, decorative icons aria-hidden, no div/span click handlers, no transition: all, no autoFocus, no onPaste, live regions for runs, captions and saves, Undo on Resolve / Dismiss / Delete, overscroll contained in sidebar, chat, settings and dialogs)
```

### Resolution

| Finding | Source | Resolution |
|---|---|---|
| AI math without accessible text | impeccable | Fixed (ink-text.tsx, MathML) + test |
| Faded note stays faded on keyboard focus | impeccable | Fixed (notebook.css `:focus-within`) + test |
| No `touch-action: manipulation`, default tap highlight | web-design-guidelines | Fixed (notebook.css) + test |
| Running cost without tabular digits | web-design-guidelines | Fixed (notebook.css) + test |
| Wordmark name translatable | web-design-guidelines | Fixed (chrome.tsx) + test |
| Faded notes ≈2.2:1 at rest | impeccable | Resolved under the owner's contrast ruling: `--nb-faded` .97 light / .82 dark, light orange `#a9580e`; every AI ink ≥4.5:1 faded on paper + test |
| Bounce easings; placeholders, sentence case, title balance; theme-color | both | Kept by design, approved by owner 2026-11-07 |

No open findings remain. Every finding is fixed or resolved under the owner's rulings, except the items kept by design and approved above. The faded-notes fade was resolved under the contrast ruling ("Raise to pass") on 2026-11-07 with the frame column offset (5.5px, owner's "copy exact geometry").
