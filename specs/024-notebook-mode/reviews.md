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
