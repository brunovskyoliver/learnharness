# Motion contract (feature 028)

The catalogue the implementation and the tests check against. Spec rows keep their numbers. "Arrival CSS" is a class or attribute that plays a keyframe once on the live DOM (research R6); "VT" is a view transition (R1-R2). Values marked **(gate 2)** wait for the owner (plan.md, "Owner review at gate 2").

## 1. Tokens (app/paper.css, on `html.lh-paper`)

| Token | Value | Fallback |
|---|---|---|
| `--ease-ink` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | |
| `--ease-word` | `cubic-bezier(0.25, 0.6, 0.3, 1)` | |
| `--ease-unfold` | `cubic-bezier(0.22, 1, 0.36, 1)` | |
| `--ease-draw` | `cubic-bezier(0.3, 0.7, 0.3, 1)` | |
| `--ease-pencil` | `cubic-bezier(0.4, 0.1, 0.5, 1)` | |
| `--ease-splat` | `cubic-bezier(0.2, 0.9, 0.25, 1.12)` | |
| `--ease-menu` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | |
| `--ease-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | |
| `--spring-soft` | `linear(0, 0.053, 0.175, 0.324, 0.473, 0.609, 0.723, 0.814, 0.883, 0.934, 0.968, 0.991, 1.005, 1.012, 1.015, 1.015, 1)` | `--ease-menu` without `linear()` support |
| `--spring-pop` | `linear(0, 0.094, 0.302, 0.539, 0.751, 0.913, 1.019, 1.076, 1.094, 1.089, 1.07, 1.048, 1.027, 1.011, 1, 0.994, 1)` | `--ease-splat` |
| `--motion-press` | 100ms | |
| `--motion-lift` | 140ms | |
| `--motion-quick` | 160ms | |
| `--motion-settle` | 200ms | |
| `--motion-route` | 280ms | |
| `--motion-unfold` | 340ms | |
| `--motion-sheet` | 340ms | |
| `--motion-soak` | 450ms | |
| `--motion-splat` | 460ms | |
| `--motion-ink` | 520ms | |
| `--motion-draw` | 560ms | |
| `--motion-pencil` | 800ms | |
| `--motion-stagger` / `--stagger-cap` | 40ms / 240ms (desktop); **(gate 2)** 24ms / 160ms below 640px | |
| `--motion-fade-reduced` | 150ms (ceiling for every reduced-motion fade) | |

Literal timings that equal a token are rewritten to it; literals that equal none keep their value (the `ease-out` keyword on `nb-settle`, `nb-side-in`, `nb-fade-in`; `nb-code-in` .42s; the sketch pops' curves; `nb-desk-catch-in`). Existing keyframe names never change.

New keyframes: `lh-lift` (opacity 1 → 0), `lh-fade` (0 → 1), `lh-dialog-rise` (opacity 0, `translateY(6px) scale(.98)` → none), `lh-sheet-in` (opacity 0, `translateX(-16px)` → none), `lh-soak` (gate 2 shape), `lh-mark-draw` (`stroke-dashoffset` 1 → 0). Only transform, opacity, clip-path, mask and stroke-dashoffset are animated (FR-017).

## 2. Signature (rows 1-2)

Trigger: `html[data-lh-arrival="signature"]` (data-model). Order: mark → top band → heading → sections and rows (first viewport, staggered).

| Part | Spec values | Ends at | Proposed to meet FR-006 **(gate 2)** | Ends at |
|---|---|---|---|---|
| Ring stroke (mask, clockwise from the spiral's open end) | 560ms `--ease-draw` | 560ms | 400ms | 400ms |
| Dot splat | 460ms `--ease-splat` from 380ms | 840ms | 300ms from 280ms | 580ms |
| Spiral | `nb-fade-in` 200ms from 0 | 200ms | same | 200ms |
| Heading ink-in | 520ms `--ease-ink`, delay 0 | 520ms | 360ms | 360ms |
| Rows ink-in | 520ms, step 40ms, cap 240ms | 760ms | 360ms, step 40ms, cap 240ms | 600ms |

As specified, the dot and the last rows finish after 600ms, which FR-006 and SC-001 forbid; the proposal keeps the order and the curves and shortens durations so every part finishes by 600ms. A lesson (US1 AS4) inks only its band title and composer; the transcript is still.

## 3. Catalogue implementation

| # | Mechanism | Hook (selector / component) | Keyframe / transition | Tokens | Reduced motion |
|---|---|---|---|---|---|
| 1 | Arrival CSS | `html[data-lh-arrival=signature] .nb-wordmark-mark` (components/lh-mark.tsx, components/paper/chrome.tsx) | `lh-mark-draw`, `nb-blot-splat`, `nb-fade-in` | §2 | mark finished, `lh-fade` 150ms |
| 2 | Arrival CSS | `[data-lh-arrive=signature] [data-ink-order]` with `--i` (route-content.tsx; pages mark heading, sections, rows) | `nb-ink-in` | §2 | `lh-fade` 150ms, no delay |
| 3 | VT exit + arrival CSS | `router.push(href, { transitionTypes: ["lh-mode"] })` in `switchInterface` callers; old content `::view-transition-old(.lh-lift)`; new `[data-lh-arrive=mode]` | old `lh-lift`; new `nb-unfold` on the content box, first lines `nb-ink-in` | lift 140ms `--ease-out`; unfold 340ms `--ease-unfold`; ≤400ms | VT pair 150ms fade; new `lh-fade` |
| 4 | VT exit + arrival CSS | `Link`/`router.push` with `["lh-route"]` (helper `navigateTo` in components/paper/navigate.ts); new `[data-lh-arrive=route\|cold]` | old `lh-lift`; new heading `nb-ink-in`, body one 40ms step | 140ms; `--motion-route` 280ms `--ease-ink` | 150ms fade |
| 5 | Arrival CSS only | `[data-lh-arrive=history]` (popstate) | `nb-ink-in`, no stagger | 200ms `--ease-ink` | `lh-fade` |
| 6 | Transition + arrival CSS | tab-strip marker (`.lh-tab-marker`, transform), pane `[data-lh-arrive=tab]` | marker transform; pane `nb-ink-in` | 280ms `--spring-soft`; 200ms `--ease-ink` | marker jumps; pane `lh-fade` |
| 7 | Arrival CSS | overlay sidebar (components/paper/overlay-sidebar-dialog.tsx) `data-[state=open]`; rows `useArrival("sidebar-rows")` | `lh-sheet-in`; wash `nb-fade-in`; rows `nb-ink-in` step 24ms cap 200ms | `--motion-sheet` 340ms `--spring-soft` | sheet and wash fade ≤120ms; rows at once |
| 8 | Radix exit | same, `data-[state=closed]` | `lh-lift` | 160ms `--ease-out` | ≤120ms fade |
| 9 | Transition | `MenuGlyph` ⇄ `CloseGlyph` paths (stroke-dashoffset) | draw | 200ms `--ease-draw` | cross-fade ≤150ms |
| 10 | Radix open/close | components/ui/popover.tsx, tooltip.tsx, `.nb-menu`, palette | `nb-menu-in`; close `lh-lift` 100ms | `--motion-quick` `--ease-menu` | `lh-fade` ≤150ms |
| 11 | Radix open/close | components/ui/dialog.tsx (overlay + content), `.nb-settings`, export, link-repo | `lh-dialog-rise`; scrim `nb-fade-in`; close `lh-lift` 120ms | 220ms `--spring-soft` | scrim and sheet `lh-fade` ≤150ms |
| 12 | Arrival CSS | right pane (components/workspace-pane.tsx) | `nb-chat-in`; collapse `lh-lift` 160ms | 280ms `--ease-menu` | `lh-fade` |
| 13 | `useArrival` + `useNewRows` | components/waiting-section.tsx, components/home.tsx | heading/rows `nb-ink-in` staggered; new row `nb-unfold`; removed row `lh-lift` | ink 520ms, step 40 cap 240; 340ms; 160ms | `lh-fade` in/out |
| 14 | `useArrival` | "Your turn" / Flashcards due label dot | `nb-blot-splat` | 460ms `--ease-splat` | dot static |
| 15 | `useArrival` + `useNewRows` | components/library/library-row.tsx, page-row.tsx, grid cards; upload status dot | `nb-ink-in` step 24 cap 160; `nb-settle` + splat | 520ms; 200ms | `lh-fade`; dot static |
| 16 | Arrival CSS | components/library/folder-row.tsx children | `nb-unfold`; collapse `lh-lift` | 280ms `--ease-unfold`; 160ms | children `lh-fade` |
| 17 | unchanged + arrival | transcript (no wrapper on history); sent turn `nb-settle`; composer `nb-settle` on arrival | `nb-ink-word` (024) | as 024; 200ms | no animation, words appear |
| 18 | unchanged + `useArrival` | components/study/check-thread.tsx; correct grade pencil (`nb-pencil-draw`) | 024; pencil | `--motion-pencil` `--ease-pencil` | strokes finished, no splat |
| 19 | `useArrival("demo:{id}")` | components/artifacts/demo-card.tsx, plot-card.tsx, ML panels (frame and our own axes only) | `nb-unfold`; axes `nb-pencil-draw`; data `nb-ink-in` | 340ms; 600ms; 520ms | frame `lh-fade`, axes finished |
| 20 | unchanged | expand demo / graph focus | as today | as today | as today |
| 21 | Arrival CSS + exit | components/library/back-pill.tsx | `nb-sketch-pop-in`; leave `lh-lift` 120ms | 380ms | `lh-fade` |
| 22 | unchanged + hover | components/reference-chip.tsx underline (stroke or `background-size`) | ink-word; underline draw | 200ms `--ease-pencil` | underline shown |
| 23 | VT `lh-theme` | `withThemeFade(apply, origin)` (components/paper/appearance.tsx); settings-modal theme cards pass their rect | `lh-soak` on `::view-transition-new(root)`; old `animation: none` | `--motion-soak` 450ms `--ease-unfold` | root pair 150ms fade |
| 24 | Arrival CSS | status lines (components/library/repo-status-line.tsx, notebook save line, link/sync lines): old and new in one grid cell | new `nb-settle`; old `lh-lift` 120ms | 200ms | text cross-fades ≤150ms |
| 25 | unchanged | `nb-ink-wait` replaces remaining non-tool spinners | `nb-ink-wait` | as 024 | static at .7 |
| 26 | Transition | `.nb-pill`, toolbar words, components/ui/button.tsx `:active` scale .97; release | press/release | `--motion-press` `--ease-out`; 220ms `--spring-pop` | colour only |
| 27 | Transition | components/paper/option-cards.tsx and filters: one sliding ink pill | transform | 300ms `--spring-soft` | jumps |
| 28 | Arrival CSS | components/review/queue-panel.tsx card back and next card | `nb-unfold`; `nb-ink-in` | 340ms; 520ms | `lh-fade` |
| 29 | Arrival CSS | components/ui/skeleton.tsx exit, content arrival | `lh-lift` 120ms; `nb-ink-in` 280ms | | `lh-fade`, skeletons static |
| 30 | `useArrival` | components/ui/empty.tsx blot glyph | `nb-blot-splat` | 460ms `--ease-splat` | static |

## 4. View-transition rules (app/paper.css)

```css
::view-transition { pointer-events: none; }
html:active-view-transition-type(lh-route, lh-mode) { view-transition-name: none; }
::view-transition-old(.lh-lift) { animation: var(--motion-lift) var(--ease-out) both lh-lift; }
html:active-view-transition-type(lh-theme)::view-transition-old(root) { animation: none; }
html:active-view-transition-type(lh-theme)::view-transition-new(root) { animation: var(--motion-soak) var(--ease-unfold) both lh-soak; }
```

Types: `lh-route` (in-app link or push; a tab select adds `lh-tab`), `lh-mode` (mode switch), `lh-theme` (theme change). Back/forward and `router.refresh()` carry none. The wrapper: `<ViewTransition exit={{ "lh-route": "lh-lift", "lh-mode": "lh-lift", default: "none" }} enter="none" update="none" share="none" default="none">`. Nothing else is named.

## 5. Interruption and input

- A newer navigation or theme change skips the running transition (the platform's behaviour) and its content mounts with its own arrival; arrival CSS restarts only on a new mount (FR-007).
- `::view-transition` takes no pointer events; the incoming page is live from its first frame (R2). Layers move focus on open and back to the opener on close in the same task (R7).
- Hidden documents start no view transition (the platform refuses) and finish CSS on the document timeline; the signature never starts in a hidden tab.

## 6. Reduced motion (FR-013)

Every row's last column above. Mechanism: one `@media (prefers-reduced-motion: reduce)` block (R10). Ceiling: opacity only, ≤`--motion-fade-reduced`, no delay, no stagger; strokes at `stroke-dashoffset: 0`; splats and transforms off; loops as 024.

## 7. Print and failure

`@media print` and `html[data-lh-printing]`: `animation: none !important; transition: none !important` on everything; `data-arrive` states finished. With no script or no CSS support every element is in its final state (FR-008, FR-021).

## 8. Test hooks

`data-lh-arrival` (html), `data-lh-arrive` (content wrapper), `data-arrive` (once-per-arrival elements), `data-ink-order` + `--i` (reading order), `.lh-tab-marker`, `data-testid="nb-wordmark"` (existing).
