# Feature Specification: One motion language (ink in motion)

**Feature Branch**: `unified-redesign` (spec dir `specs/028-motion`)

**Created**: 2026-11-09

**Status**: Approved (gate 1 answered 2026-11-09; gate 2 `go` 2026-11-09)

**Input**: User description (owner, verbatim): "lets animate the website cooly somehow, as the reference lines are being drawn, lets have some cool load animations when loading the page / switching the notebook / non notebook mode/ switching between pages or tabs / opening sidebar or whatever else you suggest and think is appropriate to animate.. use the same styles and spring animation motions... be creative"

## Overview

Feature 024 gave Notebook a motion vocabulary taken from Riddled: words ink in wet and dry, threads unfold downward and settle, tethers draw themselves as a tie then a spine, pencil underlines stroke across a passage, and the blot splats with a small overshoot. Feature 025 made Notebook's paper the only look, but most of the app still arrives with no motion at all; dialogs, popovers and tooltips carry shadcn fade and zoom classes that do nothing, because `tw-animate-css` is not installed. This feature extends the 024 vocabulary to the whole app, so that a page load, a mode switch, a route change, a tab, the sidebar, a dialog, a list and a demo all move the way ink and paper move, and nothing else does.

**Motion thesis.** Everything that arrives is *written* onto the paper. Lines are **drawn** (stroke from start to end, like the tether and the pencil underline), text and rows **ink in** (wet to dry, 2px rise, in reading order), containers **unfold** downward from their top edge like a thread opening (clip reveal), and the one moment that marks a new thing as alive is a **blot** landing with a small spring overshoot. Chrome (☰, wordmark, corner hint) is the desk; it never moves when the page under it changes. Exits are quick and quiet: ink does not un-write itself, it lifts (short fade).

**Focal moment.** The cold page load: the app mark's ring draws itself as one pen stroke, its dot lands as a blot, and the page inks in heading-first in reading order. It is the only authored sequence; everything else is routine motion at routine speed.

## Clarifications

### Session 2026-11-09

Owner gate 1, answered 2026-11-09 (every recommended option):

- Q: How strong should the motion be? → A: B, expressive at arrivals, quiet in routine: one cold-load signature; route and tab changes take at most 300ms.
- Q: What carries route changes and the Notebook ⇄ Study switch? → A: A, the platform's view transitions (React `<ViewTransition>`, Link `transitionTypes`) for routes and the mode switch, with on-arrival keyframes as the fallback; clicks stay live during a transition (the transition overlay never takes pointer events).
- Q: What is the load signature? → A: A, the wordmark mark's ring draws as one stroke, the dot splats, then the content inks in in reading order.
- Q: How often does the signature play? → A: A, once per tab session (kept in the tab's session storage); later navigations, reloads included, use the short route ink-in.
- Q: What does reduced motion keep? → A: A, opacity fades of at most 150ms and colour changes; no movement, no strokes drawing, no splats. DESIGN.md's reduced-motion rule is updated to say so (owner-approved change).
- Q: How does a theme change look? → A: A, an "ink soak": the new theme spreads from the toggle's position like ink into paper (about 450ms, a view transition with a clip-path or mask), replacing the .35s cross-fade; under reduced motion a fade of at most 150ms.
- Recorded default (owner, with gate 1): phones get the same motion, with shorter staggers.

### Session 2026-11-09 (gate 2)

Owner replied `go` to plan.md "Owner review at gate 2" and the analysis items, 2026-11-09:

- Signature retimed to finish by 600ms: the ring draws in 400ms; the dot splats from 280ms over 300ms; content inks in over 360ms with a 40ms stagger capped at 240ms; plot data starts at 240ms. Every row's arrival, rows 13, 15 and 19 included, ends by 600ms.
- Ink soak edge: a feathered mask edge (A).
- Phones (below 640px): stagger steps of 24ms, cap 160ms.
- The ring stroke starts at the spiral's open end (clockwise, finishing beside the dot).
- A lesson route inks in only its title and composer; the transcript stays still.
- Navigating to Home or the Library plays one route ink-in that includes the row stagger; the rows do not animate a second time.
- The "skip the signature if the page is not interactive in time" clause is dropped (no mechanism in the CSS-only design; input is never blocked anyway, FR-005).

Owner intent applied by the lead, 2026-11-09 (plan.md "Open after gate 2"):

- O1: SC-003's 300ms route budget counts the outgoing lift plus the heading's ink-in; the row stagger that follows is bounded by the 600ms cap (FR-006).
- O2: 024's streaming-word ink-in and the correct-answer pencil underline keep their durations (rows 17-18 are exempt from the 600ms cap because the text is readable throughout); everything else ends by 600ms.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The page writes itself on first load (Priority: P1)

Oliver opens the app (any route) in a fresh tab. The wordmark's ring draws as one stroke and its dot lands as a blot; the top bar settles; the page's heading inks in, then its sections and rows in reading order. Everything is readable within 600ms and he can type, click or press keys from the first paint.

**Why this priority**: it is the signature moment the owner asked for first and sets the language every other surface reuses.

**Independent Test**: cold-load Home, a lesson, the Library, Review and Settings at 1440 and 390px; record frames; check order (mark → heading → body), that all text is at full opacity by 600ms, and that a keypress at 50ms reaches the focused control.

**Acceptance Scenarios**:

1. **Given** a cold load of Home, **When** the first paint happens, **Then** the mark's ring draws, the dot splats, "Waiting for you" inks in, and its rows ink in top to bottom with a capped stagger; all are fully legible by 600ms.
2. **Given** the cold-load sequence is running, **When** Oliver presses Mod+K or clicks a row, **Then** the action happens immediately and the remaining animation finishes or is skipped without blocking it.
3. **Given** reduced motion, **When** the page loads, **Then** everything fades in within 150ms, finished, with no movement, no stroke drawing and no splat.
4. **Given** a lesson opened cold, **When** it renders, **Then** settled transcript history appears still (never inked in); only chrome and the composer arrive.

---

### User Story 2 - Switching Study and Notebook turns the page, not the desk (Priority: P1)

Oliver presses Mod+Shift+O. The ☰, wordmark and corner hint stay exactly where they are; the outgoing page lifts away quickly and the incoming page unfolds downward from its top edge, its first lines inking in.

**Why this priority**: 025's promise is "switching modes changes the content, not the look"; motion should say the same thing.

**Independent Test**: switch both ways from the sidebar, the palette and the shortcut; confirm chrome pixels do not move during the transition, the incoming page is interactive as soon as it is shown, and the total transition is at most 400ms.

**Acceptance Scenarios**:

1. **Given** Study at a lesson, **When** he switches to Notebook, **Then** the chrome stays still, the lesson lifts (fade ≤160ms), and the note unfolds and inks in (≤400ms total); the caret is placeable at once.
2. **Given** a browser without the needed platform support, **When** he switches, **Then** the incoming page still inks in on arrival; nothing breaks.
3. **Given** reduced motion, **When** he switches, **Then** the pages cross-fade within 150ms with no unfold or movement.

---

### User Story 3 - Moving between pages and tabs keeps your place visually (Priority: P2)

Navigating Home → lesson → Library → Review → Settings, or switching workspace tabs, the chrome holds still and only the content area changes: a quick lift of the old content and a short ink-in of the new one. The selected tab's marker slides to the new tab with a soft spring.

**Why this priority**: the most frequent motion in the app; it must feel continuous and never slow.

**Independent Test**: click through all routes and tabs ten times rapidly; no transition exceeds 300ms, no click is lost, no content flashes, and history (transcript, scroll position, drafts) is unchanged.

**Acceptance Scenarios**:

1. **Given** Home, **When** he opens Library, **Then** Home's content lifts and the Library's heading and first rows ink in within 300ms.
2. **Given** two tabs, **When** he switches, **Then** the tab marker slides with the soft spring and the pane content inks in once, without a stagger.
3. **Given** browser back or forward, **When** the route changes, **Then** content swaps with the plain ink-in only (no stagger, no signature), and scroll restoration is unaffected.

---

### User Story 4 - Layers open like paper (Priority: P2)

The overlay sidebar slides in on the soft spring with its rows inking in; menus, popovers and the palette drop in with the existing menu motion; dialogs and the settings modal rise onto the desk; the ☰ redraws into ✕.

**Why this priority**: layers are opened many times a session and today use generic shadcn zooms.

**Independent Test**: open and close every layer by pointer and keyboard; Escape always closes the innermost layer immediately; focus moves on open, not after the animation.

**Acceptance Scenarios**:

1. **Given** the sidebar is closed, **When** he presses ☰, **Then** the sheet arrives within 340ms, focus is in the sidebar at once, and the rows ink in (first open per page load only).
2. **Given** an open dialog, **When** he presses Escape, **Then** it lifts in ≤120ms and focus returns to the opener immediately.

---

### User Story 5 - Lists, threads, demos and small parts arrive as ink (Priority: P3)

Home rows, Library folders, a check thread, a demo or graph, the Back pill, reference chips, status lines and pill presses each get one motion from the vocabulary, played once on arrival.

**Why this priority**: completes one language across the app; each item is small and independent.

**Independent Test**: per catalogue row (below), trigger the arrival once and re-render the component (refresh data, resize, theme change); the animation plays on arrival only.

**Acceptance Scenarios**:

1. **Given** a folder in the Library, **When** he expands it, **Then** its children unfold downward; collapsing lifts them in ≤160ms.
2. **Given** a demo becomes ready, **When** it mounts, **Then** its frame unfolds once; a later theme change or re-render does not replay it and never reloads the demo.
3. **Given** a correct graded answer, **When** the grade arrives, **Then** a pencil stroke draws under the result once.

### Edge Cases

- Rapid repeated navigation: a new transition interrupts the running one at its current state; the newest content is always shown, never a queued backlog.
- Long lists (Library with hundreds of rows, Home with many waiting rows): stagger applies only to rows in the first viewport, capped in total delay; rows below the fold are already finished.
- Scroll-back and virtualised rows remounting: never animate (history never re-animates).
- Background refresh replacing data with equal data: no animation. A genuinely new row unfolds; a removed row lifts.
- Tab hidden / window in background: nothing animates off-screen; on return the page is in its final state.
- Hosted auth screens and the Electron shell: same language; the Electron window's first paint uses the same signature.
- Slow devices / long main-thread tasks: animations may drop frames but must never delay input or content.
- Print and export: no motion state ever leaks into print (everything finished).
- Platform without view transitions or `linear()` easing: falls back to on-arrival keyframes and the nearest cubic-bezier; behaviour identical.
- Theme change while an animation runs: colours update in place; nothing restarts.

## Motion catalogue

Tokens in the Duration/easing column are defined in "Motion tokens" below. "Once" means once per arrival of that content in this page load; re-renders, data refreshes with unchanged content, scroll-back and theme changes never replay it.

| # | Surface | Trigger | What moves | Duration / easing | Reduced motion |
|---|---|---|---|---|---|
| 1 | Wordmark (signature) | Cold page load (once per tab session, see Assumptions) | Mark ring draws as one stroke; dot lands as blot splat at the stroke's end; harness spiral fades in | `--motion-mark` 400ms `--ease-draw` from the spiral's open end; dot `--motion-mark-dot` 300ms `--ease-splat` from 280ms; done by 580ms | Mark shown finished; fades in ≤150ms |
| 2 | Page content (signature) | Cold page load | Top bar settles; heading inks in, then sections and rows in reading order (first viewport only) | `--motion-arrive` 360ms `--ease-ink`; stagger `--motion-stagger` 40ms, cap 240ms (phones 24ms, cap 160ms); all done ≤600ms | Fades in ≤150ms, no rise, no stagger |
| 3 | Notebook ⇄ Study | Mode switch (sidebar, palette, Mod+Shift+O) | Chrome stays still; old page lifts; new page unfolds from its top edge, first lines ink in | lift `--motion-lift` 140ms `--ease-out`; unfold `--motion-unfold` 340ms `--ease-unfold`; ≤400ms total | Cross-fade ≤150ms, no unfold |
| 4 | Routes: Home, lesson, Library, Review, Settings | In-app navigation | Chrome still; content lifts, new content inks in (heading then body, one 40ms step). Home and Library: this one ink-in includes the row stagger; the rows do not play row 13/15 again. A lesson inks in only its band title and composer; the transcript stays still | lift 140ms; ink-in `--motion-route` 280ms `--ease-ink` | Fade ≤150ms |
| 5 | Routes | Browser back/forward | New content plain ink-in, no stagger | 200ms `--ease-ink` | Fade ≤150ms |
| 6 | Workspace tabs | Tab select | Selected-tab marker slides to the new tab; pane content inks in once | marker 280ms `--spring-soft`; pane 200ms `--ease-ink` | Marker jumps; pane fades ≤150ms |
| 7 | Overlay sidebar | Open | Sheet slides in 16px and fades; page wash fades (Notebook page moves aside as today); rows ink in on first open per load | `--motion-sheet` 340ms `--spring-soft`; rows `--motion-arrive` 360ms, 24ms stagger cap 200ms | Sheet and wash fade ≤120ms, no slide; rows shown at once |
| 8 | Overlay sidebar | Close | Sheet lifts | 160ms `--ease-out` | Fades ≤120ms |
| 9 | ☰ ⇄ ✕ | Sidebar open/close | Glyph's lines redraw into the other glyph | 200ms `--ease-draw` | Glyphs cross-fade ≤150ms |
| 10 | Menus, popovers, palette, tooltips | Open / close | Existing `nb-menu-in` (3px drop, .98 scale) replaces shadcn zoom; palette results settle without stagger | 160ms `--ease-menu`; close 100ms fade | Fade ≤150ms, no drop or scale |
| 11 | Dialogs, settings modal, export, link-repo | Open / close | Scrim fades; sheet rises 6px onto the desk, scale .98→1 | 220ms `--spring-soft`; close 120ms `--ease-out` | Scrim and sheet fade ≤150ms, no rise or scale |
| 12 | Right pane (outline, context, note chat) | Open / collapse | Existing `nb-chat-in` (24px from right) on open; collapse lifts | 280ms `--ease-menu`; 160ms | Fade ≤150ms, no slide |
| 13 | Home sections and rows | Arrival; refresh adds/removes a row | Section heading inks in, rows ink in staggered (first viewport); new row unfolds; resolved row lifts and the gap closes | ink `--motion-arrive` 360ms, stagger 40ms cap 240ms (phones 24/160); new 340ms `--ease-unfold`; remove 160ms | Fade in/out ≤150ms; no unfold, no stagger |
| 14 | Home "Your turn" kind / Flashcards due | Row first appears | Bulb-ink label gets one small blot dot splat beside it | 460ms `--ease-splat` | Dot static |
| 15 | Library rows, grid cards | Arrival; upload lands | Rows ink in (first viewport); new upload row settles with its status dot splatting | `--motion-arrive` 360ms, stagger 24ms cap 160ms; settle 200ms | Fade ≤150ms; dot static |
| 16 | Library folders | Expand / collapse | Chevron turns (as today); children unfold downward / lift | 280ms `--ease-unfold`; 160ms | Children fade ≤150ms |
| 17 | Lesson transcript | Opening a lesson; new turn | Settled history never animates; streaming words ink word by word (as today); a sent learner turn settles; the composer settles on arrival | as 024 (`nb-ink-word` .64s); settle 200ms | No animation, words appear |
| 18 | Check threads | First pose; open; graded | Teaser settles, body unfolds, tether draws tie then spine (as 024); "Your turn" dot splats; a correct grade draws a pencil underline under the result | 024 timings; pencil `--motion-pencil` 800ms `--ease-pencil` | Finished strokes, no splat |
| 19 | Demos, graphs, plots, ML panels | Ready after load | Frame unfolds once; plot axes draw as pencil strokes then data inks in (our own panels only, not inside the sandbox) | unfold 340ms; axes 600ms `--ease-pencil`; data `--motion-arrive` 360ms from 240ms (done by 600ms) | Frame fades ≤150ms, axes finished; never reloads |
| 20 | Expand demo / graph focus | Expand | Existing expand (≤160ms) unchanged | as today | as today |
| 21 | Back pill | Appears / leaves | Pops in with the sketch pop (5px rise, .92→1); leaves with a lift | `nb-sketch-pop-in` 380ms; 120ms | Fade ≤150ms |
| 22 | Reference chips | In a streaming reply; hover | Ink in as one word unit (as 027); on hover/focus a pencil underline draws under the label | ink-word; underline 200ms `--ease-pencil` | Underline shown, no draw |
| 23 | Theme change | Customize → Appearance (the chosen option card) | Ink soak: the new theme spreads from the control's position like ink into paper (view transition, clip-path or mask on the new snapshot), replacing the .35s cross-fade | `--motion-soak` 450ms `--ease-unfold`, feathered mask edge (24px) | Fade ≤150ms |
| 24 | Status lines (Saved, All notes saved, Syncing…, Linking…, errors) | Text changes | New text settles; old text lifts; no layout shift | settle 200ms; lift 120ms | Text cross-fades ≤150ms |
| 25 | Waiting / thinking | Pending work | Breathing blot (as 024) everywhere a spinner remains outside tool rows | `nb-ink-wait` | Static at .7 |
| 26 | Pills and toolbar words | Hover / press / release | Hover: shelf fill (as today); press: scale .97; release: springs back; ink pill press darkens | hover 150ms; press `--motion-press` 100ms `--ease-out`; release 220ms `--spring-pop` | Colour only, no scale |
| 27 | Segmented controls, radio pills (Customize, filters) | Selection | Ink pill slides under the chosen option (landing's sliding pill) | 300ms `--spring-soft` | Jumps |
| 28 | Review cards | Reveal back; rate | Back unfolds under the front; next card inks in; rating pills press | 340ms `--ease-unfold`; `--motion-arrive` 360ms | Fade ≤150ms |
| 29 | Skeleton → content | Data arrives | Skeleton lifts, content inks in (no stagger past first viewport) | 120ms; 280ms | Fade ≤150ms, skeletons static |
| 30 | Empty states | First shown | One blot glyph splat beside the sentence | 460ms `--ease-splat` | Static |

## Motion tokens

New custom properties on `html.lh-paper` in app/paper.css, named after the 024 motions they come from. Existing keyframes keep their names; existing literal timings are rewritten to these tokens with identical values. Values approved at gate 2.

| Token | Value | Origin |
|---|---|---|
| `--ease-ink` | `cubic-bezier(0.2, 0.7, 0.2, 1)` | `nb-ink-in` |
| `--ease-word` | `cubic-bezier(0.25, 0.6, 0.3, 1)` | `nb-ink-word` |
| `--ease-unfold` | `cubic-bezier(0.22, 1, 0.36, 1)` | `nb-unfold` |
| `--ease-draw` | `cubic-bezier(0.3, 0.7, 0.3, 1)` | tether draw |
| `--ease-pencil` | `cubic-bezier(0.4, 0.1, 0.5, 1)` | pencil underline |
| `--ease-splat` | `cubic-bezier(0.2, 0.9, 0.25, 1.12)` | blot splat (overshoot) |
| `--ease-menu` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | menus, chat panel, dialogs |
| `--ease-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | hovers, lifts |
| `--spring-soft` | `linear(0, 0.053, 0.175, 0.324, 0.473, 0.609, 0.723, 0.814, 0.883, 0.934, 0.968, 0.991, 1.005, 1.012, 1.015, 1.015, 1)`; fallback `--ease-menu` | damped spring ζ≈0.8 (1.5% overshoot): sheets, dialogs, sliding markers |
| `--spring-pop` | `linear(0, 0.094, 0.302, 0.539, 0.751, 0.913, 1.019, 1.076, 1.094, 1.089, 1.07, 1.048, 1.027, 1.011, 1, 0.994, 1)`; fallback `--ease-splat` | ζ≈0.6 (9% overshoot): pill release, small pops |
| `--motion-press` | 100ms | feedback |
| `--motion-lift` | 140ms | every exit |
| `--motion-quick` | 160ms | menus |
| `--motion-settle` | 200ms | `nb-settle` |
| `--motion-route` | 280ms | route and pane ink-in |
| `--motion-unfold` | 340ms | `nb-unfold` |
| `--motion-sheet` | 340ms | sidebar |
| `--motion-splat` | 460ms | blot |
| `--motion-ink` | 520ms | `nb-ink-in` |
| `--motion-arrive` | 360ms | arrival ink-in for the signature, lists, cards and plot data (gate 2) |
| `--motion-draw` | 560ms | tether tie |
| `--motion-mark` | 400ms | signature ring stroke (gate 2) |
| `--motion-mark-dot` | 300ms (delay 280ms) | signature dot splat (gate 2) |
| `--motion-pencil` | 800ms | pencil underline |
| `--motion-soak` | 450ms | theme ink soak (gate 1 Q6) |
| `--motion-stagger` | 40ms (cap 240ms); phones below 640px 24ms (cap 160ms) (FR-025, gate 2) | reading-order steps |

## Requirements *(mandatory)*

### Functional Requirements

**Language**

- **FR-001**: Every animation in the app MUST be one of the vocabulary's five verbs (draw, ink in, unfold, blot, lift) or an existing 024/025 motion, using the tokens above. Generic zoom, bounce, slide-from-far, parallax or scroll-reveal effects MUST NOT be used; the shadcn zoom/slide animations on dialogs, popovers and tooltips MUST be replaced.
- **FR-002**: The catalogue above MUST be implemented as listed; any change of what moves, duration or easing needs the owner's approval.
- **FR-003**: Shared chrome (☰/✕, wordmark, corner hint, top bar) MUST stay visually still during mode switches, route changes and tab switches.
- **FR-004**: Exits MUST be shorter than entrances (≤160ms) and use opacity only.

**Never in the way**

- **FR-005**: Input MUST stay live during every animation: typing, clicks, shortcuts and Escape act immediately; focus moves when a layer opens, not when its animation ends.
- **FR-006**: No animation MAY keep content from being readable for more than 600ms after it is requested; the cold-load signature MUST complete within 600ms of first paint. Every catalogue arrival ends within 600ms, except rows 17-18's existing 024 strokes (the streaming-word ink-in, `nb-ink-word` .64s, and the pencil underline under a correct grade, 800ms), which keep their durations because the text is readable throughout (owner, O2). A route's row stagger on Home and the Library is bounded by this 600ms cap (owner, O1).
- **FR-007**: A newer transition MUST interrupt a running one; transitions never queue.
- **FR-008**: Content MUST be visible in its final state if scripts fail or the animation does not start (the default state is the finished state).

**Once per arrival**

- **FR-009**: Each animation MUST play once per arrival of its content in a page load. Re-renders, refreshes with unchanged data, resize, theme changes, scroll-back and remounts of already-seen content MUST NOT replay it.
- **FR-010**: Settled history (transcript turns, answered checks, saved notes and threads) MUST never animate; only new content does (as DESIGN.md "Ink-in runs only on new text").
- **FR-011**: Staggers MUST apply only to items in the first viewport and MUST be capped (total delay ≤240ms; ≤200ms in the sidebar; ≤160ms in the Library and on phones).
- **FR-012**: The cold-load signature (rows 1-2) MUST play at most once per tab session, remembered in the tab's session storage; a reload, a new route and every later in-app navigation in that tab use the route motion (row 4). A new tab or window plays it again.

**Accessibility**

- **FR-013**: Under `prefers-reduced-motion: reduce`, every row MUST use its listed fallback: opacity fades of at most 150ms and colour changes only; no movement (no translate, scale or clip reveal), strokes shown finished, splats static, states still changing (gate 1 Q5).
- **FR-014**: Hidden scrollbars, focus visibility, scroll anchors and scroll restoration MUST be unchanged; no animation may shift layout or move content the reader is looking at.
- **FR-015**: Nothing loops off-screen or in a hidden tab; existing loops (breathing blot, caret) keep their current rules.
- **FR-016**: Touch and coarse pointers get the same language; pill press feedback MUST appear on touch.

**Performance and scope**

- **FR-017**: Animations MUST move only transform, opacity, clip-path, stroke-dashoffset and colour; no animation of width, height, top, left, margin or other layout properties.
- **FR-018**: The motion work MUST be CSS keyframes and transitions on the existing paper.css keyframes first; script is used only to mark "arrived once" and to start platform transitions. No new runtime dependency without owner approval; the `motion` package stays limited to demos and approved animations (constitution, Technology).
- **FR-019**: Initial JavaScript and app startup MUST NOT regress by more than 5% (constitution VIII).
- **FR-020**: Demos MUST never reload or remount because of a transition (constitution VII); the live iframe keeps its state through mode switches, route changes and theme changes as today.
- **FR-021**: Print and export output MUST show final states only.
- **FR-022**: DESIGN.md's Motion section MUST be updated to describe this one language, the tokens and the catalogue, so it stays the single source of UI rules, including the new reduced-motion rule (FR-013) and the ink soak replacing the theme cross-fade (owner-approved, gate 1 Q5 and Q6).

**Platform transitions**

- **FR-023**: Route changes (rows 4-5) and the Notebook ⇄ Study switch (row 3) MUST use the platform's view transitions where available, tagged by navigation kind (in-app route, mode switch; browser back/forward carries none), with the same motion delivered by on-arrival keyframes where view transitions are missing. The transition layer MUST NOT take pointer events: clicks, typing and shortcuts reach the live page while it runs.
- **FR-024**: A theme change MUST play the ink soak (row 23), a growing circle with a feathered 24px edge, from the centre of the control that made it; a change with no control (the OS switching while the theme follows the system) changes at once as today. It MUST NOT restart other animations, reload demos or move content.
- **FR-025**: Phones (viewports below 640px) MUST get the same catalogue, with stagger steps of 24ms and a cap of 160ms (desktop 40ms / 240ms; the sidebar and Library keep their own caps when lower); nothing is removed for phones.

### Key Entities

- **Motion token**: a named duration or easing curve on the paper root, with its origin motion.
- **Catalogue entry**: surface, trigger, what moves, token(s), reduced-motion fallback; the contract implementation and tests check against.
- **Arrival**: the first time a given piece of content is shown in a page load; the unit that "plays once" counts.
- **Signature flag**: the per-tab record that the cold-load signature has played (session storage); never learner data, never synced.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On cold load of each primary route at 1440 and 390px, all text in the first viewport is at full opacity within 600ms of first paint.
- **SC-002**: A key press or click issued at any moment during any catalogued animation takes effect in the same frame budget as with motion off (no lost or delayed input in 20 scripted trials per surface).
- **SC-003**: Route, tab and mode transitions each complete within 400ms (routes and tabs within 300ms). A route's 300ms counts the outgoing lift and the heading's ink-in; the row stagger that follows on Home and the Library is bounded by FR-006's 600ms cap (owner, O1).
- **SC-004**: Re-rendering a settled surface 10 times (data refresh, resize, theme change) starts 0 new animations.
- **SC-005**: With reduced motion on, a frame capture of every catalogue trigger shows 0 transforms or stroke draws in progress.
- **SC-006**: Initial JavaScript and startup stay within +5% of the recorded baseline on the throttled desktop and mobile benchmark.
- **SC-007**: No catalogued animation causes a layout shift (CLS contribution 0) or a long task over 50ms on the throttled mobile profile.
- **SC-008**: The owner, watching side-by-side recordings of all 30 catalogue rows, accepts that they read as one language derived from Notebook.

## Assumptions

- Intensity is "expressive at arrivals, quiet in routine": one authored sequence (cold load), routine motion ≤300ms. (Gate 1 Q1, decided.)
- Route and mode transitions use the platform's view transitions where available, with on-arrival keyframes as the fallback; clicks pass through during a transition. (Gate 1 Q2, decided.)
- The signature is the mark drawing plus reading-order ink-in. (Gate 1 Q3, decided.)
- The signature plays once per tab session, kept in session storage; not on every reload and not once ever. (Gate 1 Q4, decided.)
- Reduced motion keeps opacity fades ≤150ms and colour changes, and drops movement, strokes and splats; DESIGN.md changes accordingly. (Gate 1 Q5, decided.)
- Theme change is the ink soak from the control (about 450ms); reduced motion fades ≤150ms. (Gate 1 Q6, decided.)
- Phones get the same language; staggers are shorter there (24ms steps, 160ms cap) because fewer rows fit the first viewport, and nothing is removed for phones. (Recorded default with gate 1; values gate 2.)
- Toasts as such do not exist in the app; "status lines" (save, sync, link, error lines) are the toast-like surface.
- Inside the sandboxed demo iframe, motion stays the demo kit's own; this feature animates only the frame and our own panels.
- The 024 Notebook note page's motions are already approved and stay as they are; this feature only re-expresses their literal values as tokens.
- Desktop (Electron) and hosted auth screens use the same CSS and are covered; Clerk's own widgets are not animated beyond their appearance hooks.
