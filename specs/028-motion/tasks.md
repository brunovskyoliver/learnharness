---
description: "Tasks for feature 028, one motion language"
---

# Tasks: One motion language (ink in motion)

**Input**: specs/028-motion/ (plan.md, spec.md, research.md, data-model.md, contracts/motion-contract.md, quickstart.md)

**Tests**: included. The spec's Independent Tests and SC-001…SC-007 ask for timing, input, reduced-motion, layout-shift and once-only checks; the constitution requires browser regressions for UI work.

**UI tasks** (T021-T028, T034-T035, T039-T043, T046-T054, T057-T074) are built with the `shadcn` skill (constitution VI) and checked in T079-T080.

**Gate 2**: answered `go` 2026-11-09. Tasks marked **(gate 2)** implement the approved versions in plan.md "Owner review at gate 2". Tasks marked **(O1)** or **(O2)** implement the resolutions of plan.md "Open after gate 2" (owner intent applied by the lead, 2026-11-09: O1 A, O2 A).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an unfinished task.
- **[Story]**: US1-US5 from spec.md.

---

## Phase 1: Setup

- [X] T001 Read `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`, `.../02-components/link.md` (`transitionTypes`) and `.../04-functions/use-router.md`; add `"react/canary"` to `compilerOptions.types` in tsconfig.json so `ViewTransition` type-checks; log any finding that changes R1-R2 under Decisions in specs/028-motion/progress.md
- [X] T002 Measure the startup baseline at HEAD `b0cdb1e` (`npm run build`, `next start`, fresh `LH_DATA_DIR`) with `~/agent-runs/2026-11-07-unified-redesign/startup-js/startup-js.mjs` for `/`, `/chat/new`, `/library`, plus a 390×844 copy of the script in `~/agent-runs/2026-11-09-motion/`; save `startup-base.json` and `startup-base-390.json` there
- [X] T003 Spike outside the repo (`~/agent-runs/2026-11-09-motion/spike/`, nothing committed): confirm on Chromium 157 and Electron 44 that (a) with `html:active-view-transition-type(lh-route) { view-transition-name: none }` and only the old content named, the ☰ and the new content take a click 50ms into the transition, (b) an Activity-cached route re-shown by navigation fires the wrapper's exit for the old route and does not replay arrival CSS that was already cleared, (c) `router.push(href, { transitionTypes })` from a keydown handler keeps its type; record results and any change to R2 under Decisions in specs/028-motion/progress.md
- [X] T004 [P] Add motion helpers to tests/e2e/study/helpers.ts: `runningAnimations(page)` (property names, durations, delays from `document.getAnimations()`), `layoutShiftDuring(page, action)` (sum without recent input), `withoutViewTransitions(context)` (init script deleting `Document.prototype.startViewTransition`), `boxFrames(page, selector, ms)` (screenshots of a box every frame)

---

## Phase 2: Foundational (blocks every story)

- [X] T005 Add every token of contracts/motion-contract.md §1 to `html.lh-paper` in app/paper.css, with the spring fallbacks behind `@supports (animation-timing-function: linear(0, 1))`
- [X] T006 Rewrite literal timings that equal a token to the token in app/paper.css and app/(app)/notebook/notebook.css (R11); leave literals that equal no token; no computed value changes (diff the computed `animation` of each 024 class before/after in the T003 spike page)
- [X] T007 Add keyframes `lh-lift`, `lh-fade`, `lh-dialog-rise`, `lh-sheet-in`, `lh-mark-draw` to the keyframes block of app/paper.css (contract §1)
- [X] T008 [P] Create src/core/motion.ts (pure): `signatureDecision({ visible, stored })`, `SIGNATURE_SCRIPT` (the inline string), `arrivalKind(pending, signature)`, `staggerDelay(index, { step, cap })`, `soakOrigin(rect, viewport)` → `{ x, y, r }`; export from src/core/index.ts
- [X] T009 [P] Create tests/motion-guards.test.ts: every function in src/core/motion.ts, including that evaluating `SIGNATURE_SCRIPT` against a fake `sessionStorage`/`document` matches `signatureDecision` for all four inputs and that the flag is written even when the signature is skipped
- [X] T010 [P] Create tests/motion-tokens.test.ts: app/paper.css defines every §1 token with its value; spring fallbacks present; the new keyframes animate only transform, opacity, clip-path, mask and stroke-dashoffset; the reduced-motion block names every arrival selector of contract §3
- [X] T011 Add the reduced-motion block (contract §6, R10) and the print/`data-lh-printing` rule (contract §7) to app/paper.css; rewrite the existing reduced-motion `animation: none` rules for arrival classes to `lh-fade` ≤150ms where the catalogue says fade
- [X] T012 Add the view-transition rules of contract §4 to app/paper.css (pointer-events, unnamed root for `lh-route`/`lh-mode`, `.lh-lift` old snapshot, reduced-motion 150ms pair)
- [X] T013 Create components/paper/motion-arrival.ts: per-page-load registry, `useArrival(key)` (sets `data-arrive`, clears on `animationend`), `useNewRows(listKey, ids)`, and the `MotionArrival` client component that clears `html[data-lh-arrival]` at the first navigation or 900ms
- [X] T014 Create components/paper/navigate.ts: `navigateTo(router, href, kind)` pushing with `transitionTypes` `["lh-route"]`, `["lh-mode"]` or `["lh-route"]` + tab, setting the pending arrival kind; a `popstate` listener that sets `history`
- [X] T015 Create components/paper/route-content.tsx: the `<ViewTransition>` wrapper of contract §4 that renders `data-lh-arrive` from `arrivalKind` once per mount and removes it on `animationend`
- [X] T016 Add arrival rules to app/paper.css for each `data-lh-arrive` kind and `[data-ink-order]` with `--i` (desktop 40ms step / 240ms cap; below 640px 24ms / 160ms **(gate 2)**; arrival ink `--motion-arrive` 360ms; first-N rows only, R6)

**Checkpoint**: tokens, guards, wrapper and rules exist; nothing visible changes until a surface opts in.

---

## Phase 3: User Story 1 - The page writes itself on first load (P1) 🎯 MVP

**Goal**: rows 1-2: the mark draws, the dot splats, the page inks in in reading order, once per tab session.

**Independent test**: cold-load Home, a lesson, Library, Review and Settings at 1440 and 390; order mark → heading → body; text solid by 600ms; a key at 50ms acts; reload shows no signature.

- [X] T017 [US1] Add to tests/e2e/study/motion.spec.ts: "plays once" (fresh context: `html[data-lh-arrival=signature]` and a running `lh-mark-draw`; reload: neither; a new context: plays again); "hidden tab skips it"
- [X] T018 [US1] Add to tests/e2e/study/motion.spec.ts: every text animation in the first viewport ends by 600ms after first paint on `/`, `/chat/{id}`, `/library`, `/review`, `/settings` at 1440 and 390 (SC-001); a lesson's transcript turns have no animation (US1 AS4)
- [X] T019 [US1] Add to tests/e2e/study/motion.spec.ts: Mod+K at 50ms opens the palette and a row click at 50ms navigates, 20 trials each at offsets spread over the signature (US1 AS2, SC-002); reduced motion: the signature is a ≤150ms fade with no stroke or splat (US1 AS3)
- [X] T085 [US1] Add to tests/e2e/study/motion.spec.ts: with JavaScript disabled (`javaScriptEnabled: false`) a cold load of `/` and `/library` shows every first-viewport element at opacity 1 with no transform (FR-008)
- [X] T020 [US1] Put `SIGNATURE_SCRIPT` first in `<body>` of app/(app)/layout.tsx and app/(auth)/layout.tsx, add `suppressHydrationWarning` to `<html>`, mount `<MotionArrival />` in app/(app)/layout.tsx
- [X] T021 [P] [US1] Add the signature mask mode to components/lh-mark.tsx: a `useId()` mask with a stroked circle on the ring's centre line (`pathLength="1"`), clockwise from the spiral's open end **(gate 2, items 1 and 4)**; static and complete without the attribute
- [X] T022 [US1] Add the signature rules for `.nb-wordmark-mark` (ring `lh-mark-draw` `--motion-mark` 400ms, dot `nb-blot-splat` `--motion-mark-dot` 300ms from 280ms, spiral `nb-fade-in`) and the band settle to app/paper.css **(gate 2, item 1)**, and pass the signature mode from `Wordmark` in components/paper/chrome.tsx
- [X] T023 [US1] **(O1)** Wrap Home's content in `RouteContent` and mark heading, sections and rows with `data-ink-order`/`--i` in components/home.tsx and components/waiting-section.tsx; a route arrival includes the row stagger in its one ink-in and rows do not replay row 13 **(gate 2, item 6)**; the lift and the heading fit 300ms, the stagger ends by 600ms (O1)
- [X] T024 [P] [US1] **(O1)** Same for the Library view in components/library/library-view.tsx (24ms step, 160ms cap; gate 2 item 6 as T023)
- [X] T025 [P] [US1] Same for Review in components/review/review-view.tsx
- [X] T026 [P] [US1] Same for the Settings route in app/(app)/settings/page.tsx (no surface: the route redirects to /chat/new, whose draft arrives through T027; Settings is the modal, US4)
- [X] T027 [US1] Lessons: wrap the band title and the composer only (transcript untouched) in components/chat.tsx and components/new-session.tsx **(gate 2, item 5)**
- [X] T028 [P] [US1] Notebook cold load: wordmark signature and the note's title and first lines in components/notebook/notebook-app.tsx
- [X] T029 [US1] Sign-in and sign-up pages use the same script and ink-in (app/(auth)/layout.tsx, app/(auth)/sign-in/[[...sign-in]]/page.tsx); Clerk's widget itself is not animated
- [X] T030 [US1] Live Electron check (`npm run desktop:dev`): cold start plays the signature once per window, reload does not; note in specs/028-motion/progress.md Log

**Checkpoint**: US1 works alone; routes still swap as today.

---

## Phase 4: User Story 2 - Switching Study and Notebook turns the page (P1)

**Goal**: row 3: chrome still, the old page lifts, the new page unfolds, ≤400ms, live at once.

**Independent test**: switch both ways from the sidebar, the palette and the shortcut; chrome pixels still; caret placeable at once; ≤400ms.

- [X] T031 [US2] Extend tests/e2e/study/mode-switch.spec.ts: chrome box identical across frames (`boxFrames`), transition ≤400ms, typing right after the switch lands in the field (20 trials at offsets across the transition, SC-002), the draft round trip still holds, from the shortcut, the sidebar and the palette
- [X] T032 [US2] Add to tests/e2e/study/motion.spec.ts: with `withoutViewTransitions`, the mode switch and a route change still play their arrival and end finished, with no console error (US2 AS2, FR-023)
- [X] T033 [US2] Route every `switchInterface` navigate callback through `navigateTo(…, "mode")` in components/keyboard-shortcuts.tsx, components/sidebar.tsx, components/command-palette-dialog.tsx and components/notebook/overlay-sidebar.tsx
- [X] T034 [US2] Wrap the note page's content (not its chrome) in `RouteContent` in components/notebook/notebook-app.tsx so `mode` arrival unfolds the page and inks its first lines
- [X] T035 [US2] Add the `mode` arrival rules (content box `nb-unfold`, first lines `nb-ink-in`, reduced 150ms fade) to app/paper.css and check the Study side (Home, lesson) arrives the same way
- [X] T036 [US2] Add to tests/e2e/study/mode-switch.spec.ts: reduced motion gives a ≤150ms cross-fade with no transform (US2 AS3)
- [X] T037 [US2] Add to tests/e2e/study/mode-switch.spec.ts: a lesson with a live demo keeps its iframe (no new `load`) across a switch and back (FR-020) (as built: no load while the lesson lifts, one load on return; the switch unmounts the lesson as before 028, progress.md Decisions)

**Checkpoint**: both P1 stories done (MVP complete).

---

## Phase 5: User Story 3 - Moving between pages and tabs (P2)

**Goal**: rows 4-6: content lifts and inks in ≤300ms; back/forward plain; tab marker slides.

**Independent test**: click through all routes and tabs ten times rapidly: ≤300ms each, no lost click, no flash, transcript/scroll/drafts unchanged.

- [X] T038 [US3] Add to tests/e2e/study/motion.spec.ts: route transitions ≤300ms (SC-003); the ☰/wordmark box is pixel-identical across frames during a route change (`boxFrames`, FR-003); ten rapid clicks end on the last route with at most one running transition (FR-007); a click 50ms into a route transition lands (20 trials at offsets across the transition, SC-002); back/forward has no lift and no stagger; layout shift 0 per route change (SC-007)
- [X] T039 [US3] Tag in-app route links with `transitionTypes={["lh-route"]}` in components/workspace/sidebar-nav.tsx, components/session-list.tsx, components/home.tsx, components/waiting-section.tsx and components/paper/chrome.tsx (wordmark)
- [X] T040 [US3] Send programmatic route pushes through `navigateTo` in components/command-palette-dialog.tsx, components/workspace/workspace-context.tsx (`WorkspaceApi.push`) and components/library/back-pill.tsx
- [X] T041 [US3] Add the tab marker to components/workspace/tab-strip.tsx (one `.lh-tab-marker`, transform from measured offsets, `--spring-soft` 280ms, jumps under reduced motion) and its CSS in app/paper.css
- [X] T042 [US3] Add the `tab` arrival kind (pane ink-in 200ms, no stagger) to src/core/motion.ts, components/paper/navigate.ts and app/paper.css; tab selection in components/workspace/tab-strip.tsx uses it
- [X] T043 [US3] Add to tests/e2e/study/motion.spec.ts: tab switch slides the marker and inks the pane once without stagger (US3 AS2)
- [X] T044 [US3] Add to tests/e2e/study/motion.spec.ts: after Home → lesson → Library → Back → Back the lesson's scroll position, transcript and draft are unchanged (FR-014, constitution III)

---

## Phase 6: User Story 4 - Layers open like paper (P2)

**Goal**: rows 7-12: sidebar sheet, ☰⇄✕, menus, dialogs, right pane, with focus and Escape immediate.

**Independent test**: open and close every layer by pointer and keyboard; focus moves on open; Escape closes the innermost at once; focus returns to the opener at once.

- [X] T045 [US4] Add to tests/e2e/study/motion.spec.ts: for the sidebar, palette, a menu, a popover, a tooltip, settings, export and link-repo: focus inside on open in the same frame, Escape-Escape within 50ms closes two stacked layers, focus back on the opener in the same frame (US4 AS1-2, FR-005), 20 open/close trials per layer (SC-002); sidebar rows ink only on the first open per load
- [X] T086 [US4] Add to tests/e2e/study/motion.spec.ts: closing each layer of T045 runs only opacity animations of ≤160ms (dialogs ≤120ms, menus ≤100ms) (FR-004)
- [X] T046 [US4] components/ui/dialog.tsx: remove the inert `animate-*`/`fade-*`/`zoom-*`/`duration-200` classes; scrim `nb-fade-in`, content `lh-dialog-rise` (220ms `--spring-soft`), close `lh-lift` 120ms with `pointer-events: none`; record the opener and focus it with `onOpenChange(false)`, preventing `onCloseAutoFocus` (R7)
- [X] T047 [P] [US4] components/ui/popover.tsx: replace the inert classes with `nb-menu-in` open and `lh-lift` 100ms close
- [X] T048 [P] [US4] components/ui/tooltip.tsx: same as T047
- [X] T049 [US4] Add to tests/motion-tokens.test.ts: no `animate-in`, `animate-out`, `zoom-`, `slide-in-from-` or `fade-in-0` class remains under components/ui
- [X] T050 [US4] Overlay sidebar: `lh-sheet-in` (340ms `--spring-soft`), wash `nb-fade-in`, close `lh-lift` 160ms, rows `useArrival("sidebar-rows")` with 24ms step and 200ms cap, in components/paper/overlay-sidebar-dialog.tsx, components/paper/overlay-sidebar.tsx and app/paper.css
- [X] T051 [P] [US4] ☰ ⇄ ✕ redraw (stroke-dashoffset, 200ms `--ease-draw`, cross-fade under reduced motion) in components/paper/chrome.tsx and app/paper.css
- [X] T052 [P] [US4] Menus and palette: `.nb-menu` on tokens, close `lh-lift`, palette results without stagger, in components/menu-shell.tsx and components/command-palette-dialog.tsx
- [X] T053 [P] [US4] Settings modal, export and link-repo dialogs on the dialog motion in components/paper/settings-shell.tsx, components/paper/export-dialog.tsx and components/library/repo-link-dialog.tsx
- [X] T054 [P] [US4] Right pane: `nb-chat-in` on open, `lh-lift` 160ms on collapse, in components/workspace-pane.tsx
- [X] T055 [US4] If T045's double Escape fails with exit animations (R7), close a layer that has a layer beneath it without exit animation in components/ui/dialog.tsx and components/paper/overlay-sidebar-dialog.tsx; log the outcome in specs/028-motion/progress.md

---

## Phase 7: User Story 5 - Lists, threads, demos and small parts arrive as ink (P3)

**Goal**: rows 13-30, each once on arrival; theme ink soak.

**Independent test**: per row, trigger once, then re-render (refresh, resize, theme change) ten times: zero new animations (SC-004).

- [X] T056 [US5] Add to tests/e2e/study/motion.spec.ts: for Home rows, a Library folder, a demo frame and a Review card, ten re-renders (refresh with equal data, resize, theme change) start 0 animations; a genuinely new Home row unfolds and a resolved one lifts
- [X] T057 [US5] Home rows 13-14: `useNewRows` for added and resolved rows, bulb-ink label dot splat on first appearance, in components/waiting-section.tsx and components/home.tsx
- [X] T058 [P] [US5] Library rows 15: rows ink (`--motion-arrive` 360ms, 24ms step, 160ms cap), upload row settles and its status dot splats, in components/library/library-row.tsx and components/library/page-row.tsx
- [X] T059 [P] [US5] Library folders 16: children unfold on expand and lift on collapse in components/library/folder-row.tsx
- [X] T060 [P] [US5] **(O2)** Transcript 17: a sent learner turn and the composer settle on arrival (history untouched) in components/user-turn-text.tsx and components/composer.tsx
- [X] T061 [P] [US5] **(O2)** Check threads 18: "Your turn" dot splat and the pencil underline under a correct grade, once, in components/study/check-thread.tsx
- [X] T062 [P] [US5] Demos and plots 19: `useArrival("demo:{id}")` frame unfold, our own axes pencil-draw (600ms) and data ink (`--motion-arrive` 360ms from 240ms, done by 600ms; gate 2 item 1), never inside the sandbox, in components/artifacts/demo-card.tsx and components/artifacts/plot-card.tsx
- [X] T063 [P] [US5] Back pill 21: `nb-sketch-pop-in` on appear, `lh-lift` 120ms on leave, in components/library/back-pill.tsx
- [X] T064 [P] [US5] Reference chips 22: pencil underline on hover/focus (200ms `--ease-pencil`, shown under reduced motion) in components/reference-chip.tsx and app/paper.css
- [X] T065 [US5] Theme ink soak 23: `withThemeFade(apply, origin)` with `startViewTransition({ update, types: ["lh-theme"] })` (callback fallback), soak variables from `soakOrigin`, `lh-soak` keyframe (feathered 24px mask edge) and the §4 rules, OS-driven changes instant, in components/paper/appearance.tsx and app/paper.css **(gate 2, item 2)**
- [X] T066 [US5] Pass the chosen card's rect as the soak origin (pointer and keyboard) from components/paper/option-cards.tsx and components/notebook/settings-modal.tsx
- [X] T067 [US5] Add to tests/e2e/study/motion.spec.ts: the soak starts at the chosen card, ends by 450ms, a demo's iframe gets no new `load`, reduced motion is a ≤150ms fade, an emulated OS theme change is instant (FR-024)
- [X] T068 [P] [US5] Status lines 24: old and new text stacked in one grid cell (settle 200ms, lift 120ms, no resize) in components/library/repo-status-line.tsx and components/library/page-proposals-line.tsx
- [X] T069 [P] [US5] Waiting 25: replace remaining non-tool-row spinners with the `nb-ink-wait` blot (find with `grep -rn "animate-spin" components`) in components/loading-modal.tsx and the files found
- [X] T070 [P] [US5] Pills 26: press scale .97 (`--motion-press`), release `--spring-pop` 220ms, colour only under reduced motion, on touch too (a Playwright `hasTouch` tap shows the press scale, FR-016), in components/ui/button.tsx and the `.nb-pill` rules of app/paper.css
- [X] T071 [US5] Segmented controls 27: one sliding ink pill (300ms `--spring-soft`, jumps under reduced motion) in components/paper/option-cards.tsx (after T066)
- [X] T072 [P] [US5] Review cards 28: back unfolds, next card inks in, in components/review/queue-panel.tsx
- [X] T073 [P] [US5] Skeleton → content 29: skeleton lifts 120ms, content inks 280ms, in components/ui/skeleton.tsx
- [X] T074 [P] [US5] Empty states 30: one blot glyph splat beside the sentence, once, in components/ui/empty.tsx
- [X] T075 [US5] Add to tests/e2e/study/motion.spec.ts: a reduced-motion sweep over every catalogue trigger shows only opacity animations ≤150ms and no stroke draw (SC-005), and a layout-shift sweep shows 0 per trigger (SC-007)

---

## Phase 8: Polish and cross-cutting

- [ ] T076 Rewrite DESIGN.md "Motion" (tokens, the five verbs, the catalogue in short, signature once per tab, live arrival, reduced motion per FR-013, ink soak) and the Tokens line on the theme cross-fade (FR-022)
- [ ] T077 Throttled mobile profile (4× CPU, Fast 3G) on `/` and `/library`: LCP before/after and long tasks over 50ms from motion code (SC-007); evidence in `~/agent-runs/2026-11-09-motion/perf/`
- [ ] T078 Measure startup after the feature at desktop and 390 (`startup-after.json`, `startup-after-390.json`); each route ≤ +5% gzip of T002 (SC-006, FR-019)
- [ ] T079 Check every motion surface with the `impeccable` skill (animate and audit); fix or record findings in specs/028-motion/progress.md
- [ ] T080 Check with the `web-design-guidelines` skill (reduced motion, focus, input during animation); fix or record findings
- [ ] T081 Walk quickstart.md §3 at 320, 390 and 1440 px, light and dark, reduced motion on and off, including print
- [ ] T082 Record all 30 catalogue rows side by side (light, dark, one reduced-motion pass) into `~/agent-runs/2026-11-09-motion/recordings/` for the owner (SC-008)
- [ ] T083 Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` and `npm run test:e2e`; record pre-existing failures separately from new ones in specs/028-motion/progress.md
- [ ] T084 Write the Report in specs/028-motion/progress.md: what changed, how it was verified, what is left

---

## Dependencies

- Phase 1 → Phase 2 → stories. T003's results may adjust T012-T015 before they start.
- US1 (Phase 3) needs T005-T016. US2 needs T014-T015 and T012; it does not need US1 but shares components/notebook/notebook-app.tsx with T028 (do T028 first).
- US3 needs T014-T016; T039-T040 reuse `navigateTo`. US4 needs T005-T007, T011. US5 needs T013 (registry) and T005-T007; T065-T067 need T012.
- Gate 2 answered (T016, T021-T022, T027, T065 use the approved values). O1 and O2 resolved 2026-11-09 (T023-T024 and T060-T061 unblocked).
- Phase 8 after the stories in scope.

## Parallel examples

- Phase 2: T008, T009, T010 together, then T013-T015.
- US1: T021, T024, T025, T026, T028 in parallel after T020.
- US4: T047, T048, T051, T052, T053, T054 in parallel after T046.
- US5: T058-T064, T068-T070, T072-T074 in parallel.

## Implementation strategy

1. MVP: Phases 1-3 (signature), then Phase 4; with both P1 stories the app has its signature and the mode switch.
2. Then US3 (routes, tabs) and US4 (layers), the most frequent motion.
3. Then US5 row by row; each row is independent and can ship alone.
4. Phase 8 last: DESIGN.md, budgets, skills, recordings, gates.
