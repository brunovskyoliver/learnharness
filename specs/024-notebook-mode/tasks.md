# Tasks: Notebook mode (feature 024)

**Input**: spec.md, plan.md, research.md, data-model.md, contracts/ (visual-reference.md, ui-contract.md, api.md), quickstart.md
**Tests**: requested by the owner (unit + Playwright for every scope item).

Format: `- [ ] T### [P?] [US?] description (paths)`. All Notebook CSS values come from `contracts/visual-reference.md`; all words from `contracts/ui-contract.md`.

## Phase 1: Setup

- [X] T001 Add `@playwright/test` exact-pinned dev dependency; `playwright.config.ts` (system Chromium via `CHROME_PATH` or `/usr/bin/chromium-browser`, `TMPDIR` under `$HOME`, `webServer` = `next dev -p 3124` with fresh `LH_DATA_DIR`, `LH_HOSTED=0`, `LH_NOTEBOOK_FAUX=1`); script `test:e2e`; exclude `tests/e2e` from `npm test` globs and from tsc/eslint config where needed
- [X] T002 [P] Notebook fonts `app/(app)/notebook/notebook-fonts.ts` (Instrument Sans variable `--nb-font-sans`; Newsreader variable with opsz `--nb-font-voice`), not imported outside the route
- [X] T003 [P] `app/(app)/notebook/notebook.css`: tokens light/dark under `.nb-root[data-nb-theme]`, AI ink colour variants, grain `.nb-paper`, lift, selection, focus, note-size scale, all keyframes and reduced-motion fallbacks, hidden scrollbars; imported only by the route
- [X] T004 [P] Settings: `general.interface`, `notebook` section (data-model.md) in `src/core/settings.ts` (types, FACTORY, sanitize, resolve), `src/server/settings-body.ts` parser, `SETTINGS_SECTIONS`; seeded reviewers; tests in `tests/notebook-settings.test.ts`
- [X] T005 [P] Role `notebook` → strong in `config.ts`, `ROLE_SLOT`, `BACKGROUND_MODEL_ROLES`; roster line in `components/setup-dialog.tsx` `SLOT_META`; test in `tests/settings-resolution.test.ts`
- [X] T006 [P] Server event `notebook-changed` in `src/core/events.ts`

## Phase 2: Foundation (blocks all stories)

- [X] T007 `src/core/notebook.ts`: companion/thread/message types, validation, limits, `resolveAnchor(text, anchor)` (exact → context → fuzzy → detached), `paceDelay(pace)`, `effectiveLayout(layout, width)`, reply counts, side assignment; tests `tests/notebook-core.test.ts`
- [X] T008 [P] `src/core/notebook-sketch.ts`: Sketch schema validation and pure SVG renderer with `data-step`, `pathLength`, classes for pencil/grow/pop/dot; tests `tests/notebook-sketch.test.ts`
- [X] T009 `src/store/notebook.ts`: read/write companion with lock, future-version refusal, damaged set-aside, delete-for-good hook; wire into `src/server/stores.ts` and the Library permanent delete; tests `tests/notebook-store.test.ts`; golden fixture sample under `tests/fixtures/golden-data/library/notebook/`
- [X] T010 `src/agent/subagents/notebook.ts`: inline prompts, TypeBox schemas (`submit_read`, `submit_remark`, `submit_sketch`), streaming reply/chat, faux engine behind `LH_NOTEBOOK_FAUX=1` (non-production only); tests with `createFauxCore` `tests/notebook-agent.test.ts`
- [X] T011 `src/server/notebook.ts`: run registry (tenant-scoped), start/abort, write-ahead appends, quote verification, delta buffer, `notebook-changed` emits, `notebookRunFeed()`; extend `activityFeed`, abort route (`kind:"notebook"`), `components/activity-dock.tsx` rows; tests `tests/notebook-runs.test.ts`
- [X] T012 Routes per api.md: `app/api/notebook/[pageId]/route.ts`, `threads/route.ts`, `threads/[threadId]/route.ts`, `threads/[threadId]/messages/route.ts`, `runs/route.ts`, `app/api/notebook/runs/[runId]/stream/route.ts` (SSE); all `withTenant`; `tests/tenant-routes.test.ts` stays green; route tests `tests/notebook-api.test.ts`
- [X] T013 Shell: `components/sidebar.tsx` AppShell branch for `/notebook`; `KeyboardShortcuts` Notebook-safe subset; `(app)` layout redirect `/`→`/notebook` when interface is notebook; `app/(app)/notebook/[[...id]]/page.tsx` server page reading settings and page; `tests/startup-module-graph.test.ts` asserts Study's graph has no `components/notebook` import
- [X] T014 Mode switch: palette action, Study footer "Notebook" row, global Mod+Shift+O, `general.interface` writes, Study last path in localStorage, Notebook `lastNoteId`; tests `tests/notebook-mode-switch.test.ts`

## Phase 3: US1 Write a note on paper (P1) — MVP

- [X] T015 [US1] `components/notebook/notebook-app.tsx` root: `.nb-root`, theme attr (system via media query), fonts, paper + grain layer, text size, lettering, ink attributes
- [X] T016 [US1] `note-view.tsx` + `note-editor.tsx`: column layout, title field (page name, rename route), body editor via `useEditor` + `pageExtensions` + `createPageCodec` + `usePageDraft`; placeholders; rich extras styled
- [X] T017 [P] [US1] Top-left menu + wordmark, toolbar row (sticky) with mode menu and Export slot, corner hint idle
- [X] T018 [P] [US1] Overlay sidebar base: open/close (☰, edge hover, Mod+\\, Escape), search with create-on-Enter, New note, notes list from `/api/library`, folders tree, New folder, save state
- [X] T019 [US1] Render tests `tests/render-notebook.test.tsx` (column, title, toolbar row, sidebar rows); Playwright `tests/e2e/notebook/note.spec.ts`: switch, create, type, reload, Study Library shows the same text, switch back, both themes, 1440 and 390

## Phase 4: US2 It thinks with you (P1)

- [X] T020 [US2] `use-reading.ts`: pause timer by pace, IME/focus guards, unchanged-text skip, abort on typing, start `read` run; "When you ask" never starts
- [X] T021 [US2] `use-run-stream.ts` SSE client; phase → underline + blot (`blot.tsx`) via `nb-plugins.ts` decorations; deltas → word ink (`ink-text.tsx`)
- [X] T022 [US2] `margin.tsx` layout engine (paragraph-aligned, both/right, non-overlapping stacking, left notes right-aligned), `tether.tsx` SVG with tether-draw
- [X] T023 [US2] `inline-reply.tsx` under the anchored block (dot, indent) with optional sketch
- [X] T024 [US2] Corner hint running state + activity popover + Stop; refusals for no model / no key
- [X] T025 [US2] Tests: unit for timer and placement; Playwright `reading.spec.ts` (faux read → underline, blot, question, tether; typing aborts; Stop; When you ask silent; reduced motion)

## Phase 5: US3 Margin threads (P1)

- [X] T026 [US3] `thread.tsx`: collapsed (clamp, reply count), expanded in place, others fade, passage wash, Write back field with reply-line underline and send, Resolve/Dismiss with Undo, ⋯ Copy text; reply run streaming
- [X] T027 [US3] Layouts: Both / Right / Marks only (`marks.tsx` "?" with quiet-mark), phone fallback inline; detached stack
- [X] T028 [US3] Keyboard: Mod+Alt+↓/↑ between notes, Enter/Escape, live region
- [X] T029 [US3] Tests: render + Playwright `threads.spec.ts` (expand, write back, counts, resolve, dismiss, undo, layouts, persistence after reload)

## Phase 6: US4 Selection menu and sketches (P2)

- [X] T030 [US4] `selection-menu.tsx` (BubbleMenu, export `selectedTextReference` from `page-toolbar.tsx`): format row, ink colours (text colour mark in `pageExtensions` if absent, Markdown-safe), actions Think / Ask / Visualize / Make flashcards
- [X] T031 [US4] `sketch.tsx` inline stepped sketch with stepper, replay, captions; `sketch-dialog.tsx` See it larger
- [X] T032 [US4] Tests: sketch render tests; Playwright `selection.spec.ts` (format applies, think → thread, ask → focused field and no send, visualize → sketch steps, dialog Escape)

## Phase 7: US5 Instructions and reviewers (P2)

- [X] T033 [US5] `instruction-line.tsx` (in place, Enter/blur save, Escape revert); reviewer picker in toolbar row; reviewers CRUD in settings modal (`reviewers.tsx`)
- [X] T034 [US5] Tests: request carries instruction + reviewer (agent test); Playwright `instructions.spec.ts`

## Phase 8: US6 Note chat (P2)

- [X] T035 [US6] `note-chat.tsx` right panel over dimmed page, opening line, context label, starters fill, streaming answers, persisted history, Escape/focus return
- [X] T036 [US6] Tests: Playwright `chat.spec.ts`; agent test that chat context has the whole note, threads, instruction

## Phase 9: US7 Just my words and export (P2)

- [X] T037 [US7] Just my words toggle (footer + Mod+Shift+H), hides every AI layer; Copy this note (Markdown, respects toggle)
- [X] T038 [US7] `src/core/notebook-export.ts` (document model, Markdown), `src/core/zip.ts`, `src/core/docx.ts`, `src/server/notebook-export.ts` (headless `renderPdf` added to `src/agent/subagents/headless.ts`, resvg PNG), route `app/api/notebook/[pageId]/export/route.ts`, `export-dialog.tsx`
- [X] T039 [US7] Tests: unit for Markdown/docx/zip (unzip and parse XML), PDF smoke when Chromium present; Playwright `export.spec.ts` (downloads for 3 formats × toggle)

## Phase 10: US8 Sidebar and settings complete (P2)

- [X] T040 [US8] Sidebar footer actions with shortcuts, Links and Make flashcards doors, Switch to Study, Sign out (hosted)
- [X] T041 [US8] `settings-modal.tsx`: option cards, layout/appearance thumbnails, text size, lettering, ink swatches, live apply and persist
- [X] T042 [US8] `pointer-ink.tsx` (off by default; ink-drip/ink-dry; reduced motion off)
- [X] T043 [US8] Tests: render for settings; Playwright `sidebar-settings.spec.ts` (every action by click and shortcut; every setting applies and persists)

## Phase 11: Polish and cross-cutting

- [X] T044 Links panel in Notebook styling (reuse the Links panel data); Make flashcards from selection and footer through feature 021's flow
- [X] T045 Accessibility pass: focus order, names, live regions, Escape order, focus trap/return, 44px coarse targets; Playwright `a11y.spec.ts` keyboard-only path through every scope item
- [X] T046 `scripts/notebook-compare.mjs` side-by-side screenshots vs reference frames; evidence to `~/agent-runs/2026-11-06-notebook-mode/`; list differences for owner approval
- [ ] T047 Real-model pass per quickstart in both themes at 1440 and 390; record in progress.md (blocked 2026-11-07: the Codex CLI token cannot drive the app's ChatGPT connection; owner to choose a credential, see progress.md Report)
- [X] T048 DESIGN.md "Notebook" section (overrides Study ink inside the mode), PRODUCT.md paragraph, ROADMAP entry and dependency row (Playwright adopted for tests)
- [X] T049 impeccable and web-design-guidelines reviews; fix findings
- [X] T050 Full gate: `npm test`, `npm run test:e2e`, lint, typecheck, build; startup JS measured vs baseline; progress.md Report

## Dependencies

Setup → Foundation → US1 → (US2 → US3) → US4, US5, US6, US7 (independent of each other, after US3 for thread UI) → US8 → Polish. MVP = Phases 1–5 (note page, reading, threads).

## Parallel examples

- Phase 1: T002, T003, T004, T005, T006 together.
- Phase 2: T008 beside T007; T009 after T007.
- Phase 3: T017 and T018 beside T016.
