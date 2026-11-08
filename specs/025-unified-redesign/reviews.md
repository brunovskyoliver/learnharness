# Feature 025: UI reviews (T069)

Scope: every surface in the spec, in light and dark: Home, the overlay sidebar (both modes), tabs, the palette, the lesson transcript, check threads and the bottom bar, practice, demos and the right pane, the Library, page editor, notes, held edits, PDF and diagrams, Review, the settings modal, dialogs, menus and toasts, empty, loading and error states, sign-in, and phones. Code: `components/**`, `app/**`, `app/paper.css`. Authority: DESIGN.md. Where a review rule disagrees with DESIGN.md or an owner ruling recorded there or in 024's or 025's progress.md, DESIGN.md wins and the finding is recorded as kept by design with its ruling. Run on 2026-11-08 against 18da79f, in order: `impeccable` (audit, with its detector), `web-design-guidelines` (guidelines fetched fresh from vercel-labs/web-interface-guidelines), then an accessibility pass. The impeccable skill asks for one interview probe before it infers anything. This session has no question tool, so the brief (the task and DESIGN.md) stood in for it, as it did in 024.

Evidence beyond reading the code. Scripts and raw results are in `~/agent-runs/2026-11-07-unified-redesign/reviews/`. Every probe ran on `next build` + `next start` with the seeded review data (`scripts/unified-screens.mjs`, `HOLD=1 SERVER=start`) and chrome-headless-shell 156.

- **Surface probe** (`probe.mjs`): 38 surfaces × light and dark × 1440 (also with `prefers-reduced-motion: reduce`), 390 and 320, with a coarse pointer on phones. 390 records. For each one it records:
  - controls with no accessible name (the name checker from tests/e2e/notebook/a11y.spec.ts, extended to the whole document and to options, comboboxes and sliders);
  - landmarks, the h1 count and skipped heading levels;
  - rendered text contrast (computed colour × ancestor opacity over the resolved ground, `::before` paper included);
  - visible scrollbar tracks;
  - page overflow;
  - targets under 44px;
  - running animations (`document.getAnimations()`).
- **Keyboard probe** (`focus.mjs`): 19 layers. Each is opened by keyboard. Up to 30 Tabs follow, and each stop is checked for a 2px `--nb-focus` ring, for not being covered or offscreen, and for focus staying inside the layer. Then Escape is checked to close the layer and return focus to the opener. 120 Tab stops in total.
- **Rendered-pixel contrast** (`pixel.mjs`): 17 targets × 2 themes, as element screenshots at 2× with the grain. The background is the commonest colour and the foreground is the pixel with the most contrast against it. `ground.mjs` measures the paper and the shelf as rendered.
- **Token contrast** for text (4.5:1) and non-text (3:1): ink, graphite, faint, red, green, bulb-ink, the focus ring, `--rule` edges, the switch, and the light demo series.
- **The detector**: `impeccable detect --json components app` (detect.json before, detect2.json after).

## 1. impeccable audit

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Names complete (0 nameless in 390 records), focus seen at all 120 stops. The new-diagram dialog dropped focus to `<body>`, lessons had no h1, Study's corner hint was silent, a focused dialog showed no ring. Control edges in `--rule` sit under 3:1 (owner) |
| 2 | Performance | 3 | Motion is transform/opacity except the turn-rail tick (width) and the check column shift (margin-left, kept). An unresolved dispatch keeps 40 SVG frame animations running |
| 3 | Responsive | 3 | 0 page overflow at 320/390 in Study, 44px coarse targets (switches through their hit area). Notebook overflows 6px at 1440 (owner) |
| 4 | Theming | 4 | Every colour is a token in light, dark and system. token-hygiene is green; the detector finds no hard-coded colour |
| 5 | Implementation integrity | 3 | One coherent paper system, with drift in a few corners: a shelf card for running jobs, 7 structural lines DESIGN.md doesn't name, empty states in graphite, a one-off disabled fade |
| **Total** | | **16/20** | **Good** |

Integrity verdict: **pass**. Study and Notebook are one product-specific system: paper and grain, two voices, ink pills, the bulb only for "your turn", the lift only on floating surfaces. The detector found no new tells. Its hits are Riddled's own easings, two border spinners, the 2px quote rule DESIGN.md asks for, and two layout transitions (one fixed, one kept). The drift below is local and was fixed.

Findings (severity, location, evidence, resolution):

- **[P1] New diagram dropped focus to `<body>` on Escape and Cancel.** `components/diagram/new-diagram-dialog.tsx:46`, `components/library/library-view.tsx:530`. Evidence: keyboard probe `diagram-new`: "focus on body after Escape" (focus-light2.json). The dialog was rendered with `open` always true and unmounted by its parent, so Radix never ran its close and the opener was lost. **Fixed** (8473e34): the dialog closes through Radix first (`onCloseAutoFocus` returns the focus to New diagram), then the parent unmounts it. e2e: `tests/e2e/study/a11y.spec.ts` "headings, live regions and focus return…".
- **[P2] Lessons had no h1.** Surface probe: `h1 0` on every lesson and practice surface at every width and theme. Home, the Library and Review each have one. The session title in the band was a plain rename button. **Fixed**: `components/chat.tsx:1458`. The title is the page's one h1 and the rename button sits inside it. Re-probe: `h1 1` on 12/12 lesson records (probe-after.json). The same e2e covers it.
- **[P2] Study's corner hint was never announced.** `components/activity-dock.tsx:531`. A background run (the graph's extraction, a researcher) appeared only visually. Notebook speaks its events through `nb-live`. **Fixed**: a polite `sr-only` live region carries the run's word, not its ticking cost. The same e2e covers it.
- **[P2] A dialog that takes the focus itself showed no ring.** `app/paper.css:2959` `.lh-dialog:focus { outline: none }`. Keyboard probe `cheat-sheet`: focus on `div[role=dialog]` with `outline: none`. **Fixed** (`app/paper.css:2962`): `:focus-visible` draws the 2px `--nb-focus` ring inset −2px, as settings panels do (DESIGN.md "Focus and scrolling"). e2e and `tests/paper-contrast.test.ts` cover it.
- **[P2] A running background job was a shelf card, not a quiet row.** `components/artifacts/dispatch-card.tsx:103` (`rounded-lg bg-shelf p-4`). Its "Set up models" link was a boxed button (`:80`). Evidence: the surface probe's 40 running animations on the knowledge-check lesson trace to this card's spinner. DESIGN.md "Quiet rows": "Running rows show only the spinner and shimmer with their activity label". **Fixed** (d7ef54d): `lh-quiet-line` with spinner, label, elapsed and activity. The link is `lh-text-action`. The research and PDF briefs lose their `border-t` rules and the red badge (`job-card.tsx`).
- **[P3] Structural lines where DESIGN.md names no exception** ("Separators": only the right pane's edge, the page editor's toolbar hairline and the "In Notebook" label). The lines were in:
  - `components/session-find.tsx:171` (find bar);
  - `components/stats-bar.tsx:191` (usage popover link);
  - `components/practice-cards.tsx:145` (model-solution divider);
  - `components/library/library-view.tsx:582` (upload row);
  - `components/diagram/diagram-editor.tsx:220` (tool row);
  - `components/library/pdf-reader.tsx:630` (tool row);
  - `components/artifacts/job-card.tsx:68,73,108`.

  **Fixed**: spacing groups them instead. Data-table rules, input edges and the PDF selection card's named hairline stay.
- **[P3] Empty states in graphite at body size.** DESIGN.md "Empty states: one sentence, text-md faint". The Library was already right. Affected: `waiting-section.tsx:108`, `calibration-section.tsx:50`, `review/card-lists.tsx:55,70,96,158`, `review/card-dialogs.tsx:203`, `review/queue-panel.tsx:27,35`, `diagram/diagram-list.tsx:34`, `diagram/diagram-editor.tsx:57`. **Fixed**: `text-md text-faint`. "All done for now." stays the queue's ink message.
- **[P3] The check's disabled submit had its own .45 fade.** `app/globals.css:1744`, over the shared pill's `.nb-pill:disabled` .6 (`app/paper.css:2841`); light 4.23:1 / dark 2.77:1. **Fixed**: it uses the shared state. The shared .6 itself is kept by design (see web-design-guidelines).
- **[P3] Detector: layout transition, the turn rail's hover tick** (`transition: width`, `app/globals.css:42`). **Fixed**: `transform: scaleX(2)` from the left end.
- **[P3] Detector: layout transition, `.lh-lesson-column` margin-left .34s** (`app/globals.css:1533`). **Kept by design**: DESIGN.md Motion fixes ".34s for the check column shift". `components/study/check-geometry.ts` places the margin thread from the column's layout box, so a transform would leave the thread and tether measured against a box that has not moved. It runs once when a check opens.
- **[P3] Detector: 8 × bounce easing** (`app/paper.css:530, 592, 679, 699, 746, 1216, 1514, 1613`). **Kept by design**: Riddled's exact curves (visual-reference §10.1, §10.4, §16.3, §21), approved by the owner 2026-11-07 in 024's review.
- **[P3] Detector: side-tab, the page editor's quote rule** (`app/globals.css:1292`). **Kept by design**: DESIGN.md "Page editor tools": "a 2px ink rule on quotes" (Notebook's note body, Changed by 025).
- **[P3] Detector: border accent on rounded** (`components/md-blocks.tsx:194`, `components/session-overlay.tsx:295`). **Not a defect**: these are round border spinners for loading states (`motion-reduce:animate-none`), not cards.
- **[P1, owner] Control edges in `--rule` sit under 3:1 (WCAG 1.4.11).** See Needs the owner N1.
- **[P1, owner] The light switch's off state is barely visible.** See N2.
- **[P2, owner] Dark faint misses 4.5:1 on the grained paper.** See N3.
- **[P2, owner] Notebook overflows 6px at 1440.** See N4.
- **[P2, owner] With a check waiting, Tab does nothing in a lesson.** See N5.
- Reduced motion: **pass**. Under `reduce`, 0 running animations after opening every layer on all 38 surfaces in light and dark at 1440: Home, the sidebar, the palette (empty and with a query), every lesson, the open check thread, practice, the right pane, the Library (list, grid, trash), the page editor, held edits, export, history, diagrams, Review (queue, answer, cards, drafts, editor), all seven settings pages, the setup dialog, the cheat sheet, not-found, the error state and Notebook.
- Positive: 0 controls without a name in 390 records. 0 visible scrollbar tracks anywhere, sidebar, palette, settings, dialogs and phones included. 0 page overflow in Study at 320, 390 and 1440. Every layer traps Tab and Escape returns focus: the sidebar (Mod+B and ☰), palette, settings, setup, Library menus and dialogs, export, history, held-edit review, card editor, expanded graph, delete session and the dismiss dialog. Focus is never covered by the bottom bar or a floating control. Light demo series are 3.0-3.2:1 on paper and shelf.

## 2. web-design-guidelines

```text
## components/paper/appearance.tsx
appearance.tsx:118 - no <meta name="theme-color">; phones' toolbars stayed the browser default over paper → fixed: theme-color follows the paper in use (3150a9b)
## app/(auth)/sign-in/[[...sign-in]]/page.tsx, sign-up/[[...sign-up]]/page.tsx
page.tsx:10 - no <main> landmark around Clerk's card → fixed
## components/diagram/new-diagram-dialog.tsx
new-diagram-dialog.tsx:46 - dialog closes without returning focus → fixed (impeccable P1)
## components/chat.tsx
chat.tsx:1458 - page without an h1 → fixed (impeccable P2)
## components/activity-dock.tsx
activity-dock.tsx:531 - async status (corner hint) without aria-live → fixed (impeccable P2)
## app/paper.css
paper.css:2959 - outline: none on a focusable dialog without a replacement → fixed: :focus-visible inset ring
paper.css:2841 - .nb-pill:disabled at opacity .6 (dark paper on ink ≈3:1) → kept: 024's shared pill; WCAG 1.4.3 exempts inactive controls; the button's name carries the state
## app/globals.css
globals.css:42 - transition: width → fixed: transform
globals.css:1744 - one-off .45 fade on the disabled submit → fixed
## copy (sidebar "Find a session", "Search your Library", "Type your answer", settings, Review)
placeholders without "…", sentence case instead of Title Case → kept: the strings are each feature's UI contract (025 ui-contract.md); the same rule was approved for Notebook by the owner 2026-11-07
## components/home.tsx:193, new-session.tsx:171, dialogs and rename fields
autoFocus → pass: each is the surface's single primary input or a dialog's first field
## transcript controls (plan chip, copy, disclosures)
not in the Tab walk → kept: Study's keyboard model replaces the browser's Tab walk outside dialogs with field cycling (owner, 2026-09-17 and 2026-10-06; DESIGN.md "Focus and scrolling"); see N5 for the one gap 025 opened
## Notebook on phones (components/notebook)
the "?" marks are 15×15 px at .55 (3.43:1, a non-text glyph) → kept: phones are not a focus for Notebook (owner, 024)
## prose links on phones (Streamdown links in tutor prose, ML lookups)
16px tall → kept: inline links in running text (WCAG 2.5.8's inline exception); DESIGN.md fixes the prose line heights (1.6 / 1.8), which a 44px link would break
## everything else in components/** and app/**
✓ pass: no transition: all, no outline-none without a replacement (line fields turn their rule ink, text fields show the caret), no onPaste, no user-scalable, decorative icons aria-hidden (lucide's default), overscroll contained in the sidebar, dialogs, palette and settings, touch-action manipulation and a paper tap tint on every control (app/paper.css:1119), color-scheme per theme on <html>
```

## 3. Accessibility pass

### Keyboard

Results are in focus-light.json, focus-light2.json and, after the fixes, focus-after-light.json. Light and 1440 for the layers, since the ring is the same token in dark.

| Layer | Opens by | Focus inside | Every stop ringed | Escape | Focus returns |
|---|---|---|---|---|---|
| Sidebar | Mod+B, ☰ | yes (21 stops) | yes | closes | to ☰ |
| Palette | Mod+K | field (combobox) | caret | closes | to the opener |
| Settings | Mod+, | yes | yes (tabpanel inset) | closes | to ☰ |
| Cheat sheet | Shift+? | the sheet | **no ring → fixed** | closes | opener |
| Setup dialog | Add a provider key | yes | yes | closes | opener |
| Library ⋯ menu, New folder, New diagram | Enter | yes | yes | closes | opener (**New diagram: body → fixed**) |
| Export, History, held-edit Review | Enter | yes | yes | closes | opener |
| Card editor, expanded graph, delete session, dismiss | Enter / Escape | yes | yes | closes (search first in the graph) | opener |
| Check thread | Enter | first choice | yes | collapses | the thread's button |
| Model menu | Enter | yes | yes | closes | trigger |

Escape closes the innermost layer first everywhere it was tried: the graph's search before the graph, settings search before the modal, the sidebar's menus before the sidebar. The last two are also asserted by tests/e2e/study/a11y.spec.ts and settings.spec.ts. No keyboard trap was found.

### Screen-reader semantics

- **Names**: 0 nameless controls in 390 surface records (buttons, links, inputs, textareas, selects, contenteditables, tabs, radios, switches, menu items, options, comboboxes, sliders).
- **Landmarks**: each page has one `main`, with the band as `header`. The sidebar is `nav "Workspace"`, the right pane `aside`, the Library's views `nav`, settings `nav "Settings sections"`, the turn rail `nav "Turn navigation"`, and the check thread `section "Your turn: …"`. Sign-in now has a `main`.
- **Headings**: one h1 on Home, the Library, Review, not-found and (after the fix) every lesson. No skipped levels on any surface (`skips` empty in every record).
- **Live regions**: streaming replies and check results land in the transcript's `role="log"` (polite). Check problems, compaction and queued-steer notes use `role="status"`. Settings, palette and Library failures use `role="alert"` and searches `role="status"`. Page saves, exports and "Updated by the agent" have their live lines. The corner hint now has one in Study; Notebook uses `nb-live`.

### Contrast

Tokens:

| | light paper | light shelf | dark paper | dark shelf |
|---|---|---|---|---|
| faint (text) | 4.80 | 4.51 | 4.53 | 4.76 |
| bulb-ink (text) | 4.64 (rendered) | ≥4.5 (test) | 9.73 | ≥4.5 |
| focus ring | 3.21 | 3.02 | 3.03 | 3.18 |
| chosen ring / switch on (ink) | 15.89 | 14.93 | 14.09 | 14.79 |
| `--rule` edge | **1.29** | **1.21** | **1.36** | **1.43** |
| switch off: track / thumb on track / thumb on paper | **1.29 / 1.38 / 1.07** | | 1.36 / 5.27 / 7.16 | |
| check box border (faint) | 4.80 | 4.51 | 4.53 | 4.76 |
| demo series (light) | 3.19-3.22 | 3.00-3.03 | kit palette | |

Rendered pixels (pixel.json, 2×, with the grain). Light paper renders `#f4f3ef` under the grain's multiply. Dark paper renders `#1b1b1a` under its soft-light.

- Light passes everywhere it was measured:
  - bulb-ink "Your turn" and Home's kind labels 4.64;
  - faint meta, "You", the corner hint, Library meta and settings hints 4.63;
  - the focus ring on ☰ and on a choice card, sampled at the ring;
  - the chosen ring 15.8.
- Dark faint renders at **4.48-4.49:1** on the same five targets (N3). Everything else in dark passes.
- Edges: option card 1.25 (light) / 1.34 (dark); reply-line underline 1.11 / 1.15 (N1).
- The check box's 1.5px faint border renders as an antialiased 1px circle at 1× (1.9-2.2:1 sampled). Its specified colour is faint (4.5-4.8:1), which is what WCAG measures, so it passes.

### Motion, scrolling, targets, overflow

- Reduced motion: 0 running animations after every layer (see §1).
- Hidden scrollbars: 0 tracks on every scroller in all 390 records.
- Coarse targets (390 and 320, `hasTouch`):
  - Study: every control ≥44px. Switches draw 36×20 with a 44px `::after` hit area. Search inputs sit in 44px label rows.
  - Prose links: see web-design-guidelines.
  - Notebook marks: kept (owner).
- Overflow: 0 at 320 and 390 everywhere and 0 at 1440 in Study. Notebook is 6px at 1440 (N4).

## Needs the owner

All five were ruled by the owner on 2026-11-08 and are implemented; see "Owner rulings 2026-11-08" at the end. The text below is the question as it was put.

The review cannot settle these without a design decision. Nothing was changed for them.

**N1. Control edges in `--rule` sit under WCAG 1.4.11's 3:1.**

- What: the reply-line and line-field underlines (check answers, search, rename, the Library's field), the unchosen option-card edge, the rule-ringed triggers and boxes in settings, and the rating cards. Token values are 1.29 / 1.21 (light paper / shelf) and 1.36 / 1.43 (dark). Rendered values are 1.11-1.34.
- What already passes: the chosen state (1.5px ink ring, 14-16:1) and the focus states (ink line, `--nb-focus`). The fields also show a 4.5:1 placeholder while empty. So what fails is the boundary of an idle field or unchosen card, not its state.
- Options:
  1. A new `--nb-edge` token for control edges only: `--rule` moved along lightness by the smallest step to 3:1 on paper and shelf, `#938a73` light / `#68665f` dark. Hairlines (tables, the pane edge, the toolbar rule) keep `--rule`.
  2. Raise `--rule` itself. Every hairline darkens, including Riddled's quiet table rules.
  3. Keep Riddled's edges, and rely on the state rings and placeholders.
- Recommendation: 1. It follows "Raise to pass" (lightness only, smallest step) and touches only what identifies a control.

**N2. The light switch's off state is close to invisible.**

- What: the track is `--rule` (1.29:1 on paper), the white thumb is 1.38:1 on the track and 1.07:1 on paper, and only a faint thumb shadow separates them. Dark passes, with a graphite thumb at 5.27:1 on the track. Every settings toggle uses this switch, and so do the figure and invert toggles.
- Options:
  1. Track off in `--nb-edge` (from N1), thumb white.
  2. A 1px faint ring on the off track (Notebook's locked switch already uses a ring).
  3. Keep Riddled's switch.
- Recommendation: 1 if N1 takes 1, otherwise 2.

**N3. Dark `--faint` misses 4.5:1 on the grained paper.**

- What: `#858279` is 4.53:1 on the token paper `#1a1a19`. The dark grain (soft-light .4) lifts the rendered paper to about `#1b1b1a`, where it measures 4.48-4.49:1 on Home's meta, "You", the corner hint, Library meta and settings hints.
- Options:
  1. Apply "Raise to pass" to the rendered ground: `#868379` (one lightness step, 4.54:1). Re-check the dark `--nb-faded-*` table (ink .51 and red .82 have the least margin) and update DESIGN.md and both contrast tests.
  2. Measure against the token ground, as the tests do now, and keep `#858279`.
- Recommendation: 1. The change is invisible, and the owner's ruling is that the text passes as he sees it.

**N4. Notebook overflows the page by 6px at 1440.**

- What: a right margin note's hover ⋯ (`.nb-thread-more-hover`, `right: -22px`, `app/paper.css:1339`) ends at x 1446. `documentElement.scrollWidth` is 1446, so the note page scrolls sideways by 6px. This contradicts constitution VI (no overflow at 1440). The geometry is Riddled's (owner: copy exact geometry).
- Options:
  1. `overflow-x: clip` on the note page. The geometry is kept, but at 1426-1446px wide up to 6px of the hover button (2px of its glyph) is cut.
  2. Put the right notes' ⋯ inside the note's box (`right: 0`, as inline notes do).
  3. Keep it.
- Recommendation: 2. It's the smallest change that keeps the whole control visible, and the note's own geometry is unchanged.

**N5. With a check waiting, Tab does nothing in a lesson.**

- What: Study's Tab cycles the surface's fields (owner, 2026-10-06). Since 025 the answer field lives in the margin thread, and it is closed until opened. With nothing open, the bottom bar has no field either ("Answer the check beside the lesson" + Go to it), so Tab from the page leaves focus on `<body>` with nothing shown. Enter opens the check (DESIGN.md), so the path exists, but Tab gives no sign of it. Before 025 the dock's answer well was a field, so Tab reached it.
- Options:
  1. Tab focuses "Go to it" in the bottom bar when no field exists.
  2. Tab does what Enter does (opens the thread, focuses its field or first choice).
  3. Keep Enter as the only path.
- Recommendation: 1. It is visible and changes nothing until he presses Enter.

## Resolution

| Finding | Source | Resolution |
|---|---|---|
| New diagram loses focus on close | impeccable, keyboard probe | Fixed 8473e34 + e2e |
| Lessons without an h1 | impeccable, surface probe | Fixed 8473e34 + e2e |
| Study corner hint silent | impeccable, wdg | Fixed 8473e34 + e2e |
| Focused dialog without a ring | impeccable, keyboard probe | Fixed 8473e34 + e2e + unit |
| Sign-in/up without `main` | wdg | Fixed 8473e34 |
| Running job as a shelf card; boxed setup link | impeccable | Fixed d7ef54d |
| 7 structural lines DESIGN.md doesn't name | impeccable | Fixed d7ef54d |
| Empty states in graphite | impeccable | Fixed d7ef54d |
| One-off .45 disabled fade | impeccable, surface probe | Fixed d7ef54d + unit |
| Turn-rail tick animates width | detector | Fixed d7ef54d |
| No theme-color | wdg | Fixed 3150a9b |
| Check column shift animates margin-left | detector | Kept by design (DESIGN.md Motion; geometry reads layout boxes) |
| 8 bounce easings | detector | Kept by design (Riddled; owner 2026-11-07) |
| Quote side rule | detector | Kept by design (DESIGN.md page editor body) |
| Border spinners as "accent on rounded" | detector | Not a defect (loading spinners) |
| Shared disabled pill .6 | wdg, surface probe | Kept by design (024's pill; WCAG 1.4.3 inactive exemption) |
| Placeholders without "…", sentence case | wdg | Kept by design (UI contracts; owner 2026-11-07) |
| Transcript controls outside the Tab walk | wdg | Kept by design (owner keyboard model 2026-09-17 / 2026-10-06) |
| Notebook phone marks 15px | wdg, surface probe | Kept by design (owner: phones not a focus for Notebook) |
| Prose links under 44px on phones | wdg, surface probe | Kept by design (inline links; DESIGN.md prose line heights) |
| `--rule` control edges <3:1 | a11y (tokens, pixels) | Fixed under the owner's ruling 2026-11-08 (N1, option 1): `--nb-control-edge` |
| Light switch off state | a11y (tokens) | Fixed under the owner's ruling 2026-11-08 (N2, option 1): off track in the control edge |
| Dark faint 4.49 on grain | a11y (pixels) | Fixed under the owner's ruling 2026-11-08 (N3, option 1): `#868379`; faded notes rechecked on the grained paper |
| Notebook 6px overflow at 1440 | a11y (surface probe) | Fixed under the owner's ruling 2026-11-08 (N4, option 2): ⋯ inside right notes |
| Tab does nothing with a check waiting | a11y (keyboard) | Fixed under the owner's ruling 2026-11-08 (N5, option 1): Tab to "Go to it" |

Counts: 26 findings. 11 fixed by the review, 5 fixed under the owner's rulings of 2026-11-08, 10 kept by design (one of them not a defect). (First pass: 11 fixed, 10 kept, 5 for the owner.)

## Re-review 2026-11-08 (after the fixes)

On 3150a9b, rebuilt (`next build`, `next start`, the same seed). Run in order: `impeccable` (audit, detector), `web-design-guidelines` on the changed files, then the probes again on the changed areas.

- Detector: 12 findings (detect2.json): the 8 easings, 2 spinners, the quote rule and the column shift, all kept above. The turn-rail width transition is gone.
- Keyboard probe (focus-after-light.json), 19 layers: every layer is clean. New diagram returns focus to its opener. The cheat sheet's ring shows inset. The cheat sheet and dismiss dialogs return focus to `<body>` only because the probe opened them from `<body>`. "plan-popup" is the owner's Enter model at work (Enter with a check waiting opens the check), not a defect.
- Surface probe on the changed areas (probe-after.json): Home, every lesson, the open check, practice, the right pane, the Library and its views, diagrams, Review, the cheat sheet, the error state; light and dark; 1440 (with reduce) and 390. 108 records:
  - 0 nameless controls, 0 scrollbars, 0 overflow, 0 errors;
  - h1 1 on every lesson;
  - the only text under 4.5:1 is the disabled submit in dark (the shared pill, kept);
  - under reduce, 0 animations.
- web-design-guidelines on the changed files (dispatch-card, job-card, new-diagram-dialog, library-view, chat, activity-dock, appearance, the auth pages, the separators, the empty states): ✓ pass.

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Focus return, the lesson heading, the corner hint's live region and the dialog ring are fixed. Control edges, the light switch and dark faint on the grain wait for the owner (N1-N3) |
| 2 | Performance | 4 | Only the documented check column shift animates layout. Everything else is transform and opacity |
| 3 | Responsive | 3 | Study 0 overflow at 320/390/1440 with 44px targets. Notebook's 6px at 1440 waits for the owner (N4) |
| 4 | Theming | 4 | Unchanged: tokens only, theme-color now follows the paper |
| 5 | Implementation integrity | 4 | The drift is gone: quiet rows, named separators only, empty states and pills as DESIGN.md says |
| **Total** | | **18/20** | **Excellent** (16/20 before) |

After this re-review five findings waited for the owner. They were ruled and fixed on 2026-11-08 (below).

## Owner rulings 2026-11-08 (N1-N5)

The owner ruled on all five the same day. Each is implemented as ruled, recorded in DESIGN.md and in progress.md under Decisions. Commit: `fix(025): owner rulings N1–N5`.

| | Ruling | Implementation |
|---|---|---|
| N1 | Option 1: a control-edge token on control boundaries only | `--nb-control-edge` (Tailwind `edge`): light `#938a73` (3.20 paper / 3.01 shelf / 3.09 grained paper), dark `#686660`. Dark is one lightness step past `#68665f`, which measured 2.9996:1 on the grained paper `#1b1b1a`; the new value is 3.03 / 3.18 / 3.00. Both are `--rule` moved along lightness only, by the smallest step. It goes on reply-line and line-field underlines (`.nb-write .nb-reply-line`, `.lh-line-field`, `.lh-check-field`, `.nb-settings-search`, `.nb-set-input`, the model menu's search, the Library, palette and chain-table fields, diagram and PDF fields, components/ui Input), unchosen option cards (`.nb-option-card`, the FieldLabel card), choice pills (`.nb-set-pill`, the confidence pills), ratings, rule-ringed fields and boxes (`.nb-set-trigger`, `.nb-set-textarea`, `.lh-box-field`, Textarea, InputGroup, the selects) and `--input`. Hairlines, table rules, dividers, the menu separator, the pane edge, cards and the locked switch keep `--rule`. Found on the way: the unlayered `* { border-color: var(--rule) }` beat every Tailwind border-colour utility, so `border-edge` (and `border-ink`, `border-red` and the rest) never showed. It now sits in `@layer base`. |
| N2 | Option 1: the off switch's track in the control edge | `.nb-switch` background `--nb-control-edge`; rendered 3.09:1 (light) and 3.00:1 (dark) against the grained paper. The white thumb is 3.43:1 on the light track. |
| N3 | Raise dark faint one step (Raise to pass on the paper as rendered) | `#858279` → `#868379`: 4.59 paper, 4.82 shelf, 4.54 grained paper. Rendered pixels: 4.54:1 on Home's meta, "You", the corner hint, Library meta and settings hints (pixel-after.json). Rechecking the faded notes on the grained paper moved dark red .82 → .83 and light blue .91 → .93, green .95 → .97, red .89 → .91, purple .89 → .90, brown .91 → .93, orange .97 → .99. These are the smallest two-decimal values that reach 4.5:1 over light `#f4f3ef` / dark `#1b1b1a`. The tests: notebook-contrast measures the fades on the grained paper; paper-contrast checks faint there. Dark faint also changed in `src/core/demo-theme.ts` (the demo bridge's `--lh-muted`). |
| N4 | Option 2: the right note's ⋯ inside the note | `.nb-note[data-side="right"] .nb-thread-more-hover { right: 0 }`, as inline notes have it. The overflow probe now reads 0 at 1440 for Notebook in both themes (it was 6). threads.spec "layouts" asserts the ⋯ stays in the note's box and that the page doesn't scroll sideways. |
| N5 | Option 1: Tab reaches "Go to it" | When the chat has no field (a check waits and its thread is closed), the field cycle's chain is the visible "Go to it" (`components/chat.tsx`). Enter there opens the thread and focuses its field or first choice. study/a11y.spec checks the ring on Go to it, then Enter, the open thread and the first choice focused. |

Re-run after the rulings, on a fresh `next build` and `next start`:

- **Rendered contrast** (pixel-after.json): light and dark text all pass, dark faint 4.54.
- **Rendered control edges** (`edge.mjs`, edge-after.json, the strongest pixel row on the edge against the paper beside it):
  - switch off track 3.09 / 3.00;
  - unchosen option card 3.09 / 3.00;
  - settings trigger 3.09 / 3.00;
  - Library search underline 3.09 / 3.00.
  - Inside the open check thread the reply line and the confidence pills sit at fractional y, so their 1px line anti-aliases across two device rows. The strongest row then measures 1.65:1 at 2×, while the line's colour is the 3:1 edge (computed `rgb(147,138,115)` / `rgb(104,102,96)`). WCAG measures the specified colour.
- **Overflow probe** (probe-rulings.json: Notebook, lessons, the open check, Customize, the Library; light and dark; 1440 with reduce, and 390): 0 overflow, 0 nameless controls, 0 scrollbars.
- **Keyboard walk** (focus-rulings.json): 19 layers clean. The cheat sheet and dismiss dialogs return focus to `<body>` only because the probe opened them from `<body>`, as before.

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 4 | Text 4.5:1 and control edges 3:1 on the paper as rendered, names complete, focus seen and returned, Tab never dead in a lesson |
| 2 | Performance | 4 | Unchanged |
| 3 | Responsive | 4 | 0 overflow at 320/390/1440 in both modes; 44px coarse targets |
| 4 | Theming | 4 | One more token (`--nb-control-edge`), used only on control boundaries |
| 5 | Implementation integrity | 4 | Border-colour utilities apply again (the default moved into the base layer) |
| **Total** | | **20/20** | **Excellent** (18/20 after the first fixes, 16/20 at the start) |

No open review findings remain.

## Owner approvals 2026-11-08 (second batch)

| Item | Owner answer |
| --- | --- |
| N3 dark `--faint` #858279 → #868379 (raise to pass on the grained paper; light faded-note opacities nudged by the same rule) | Approved |
| N4 Notebook right-note hover ⋯ moved inside the note (removes 6px sideways scroll at 1440) | Approved |
| Electron title-bar colours and macOS traffic-light position: verified headless on Linux only (check-electron-shell passes) | Approved as unverified; the owner checks on a Mac |
| Hosted Clerk sign-in widget: not rendered (no Clerk keys here); styled only through paper variables | Approved as unverified; the owner checks on a hosted deploy |
| Math check against a live Wolfram call (no App ID here) | Approved exception: verified with seeded rows in every state (screenshots, render tests, e2e), not a live call |
| Notebook vs Study side-by-side pairs (`~/agent-runs/2026-11-07-unified-redesign/pairs/`) | "Yes, one product" |

With these, no review finding is open and every exception is owner-approved.
