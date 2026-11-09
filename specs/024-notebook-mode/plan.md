# Implementation Plan: Notebook mode

**Branch**: `notebook-mode` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: [spec.md](spec.md), owner clarifications 2026-11-06, [contracts/visual-reference.md](contracts/visual-reference.md) (exact Riddled values), [contracts/ui-contract.md](contracts/ui-contract.md) (our microcopy and behaviour), [contracts/api.md](contracts/api.md), [data-model.md](data-model.md), [research.md](research.md).

## Summary

A second interface, Notebook, at `/notebook/[[...id]]` inside the existing `(app)` root layout. AppShell renders Notebook routes without Study's chrome (no sidebar column, tabs, top bar or right pane) but keeps the providers, so auth, tenancy, server events, activity and the page draft flow are shared. A note is a Library page edited through the existing `usePageDraft` controller and Tiptap `pageExtensions`; everything the AI writes lives in one additive companion file per page (`library/notebook/<pageId>.json`). Model work runs as server-side **notebook runs** (read, think, ask, reply, visualize, chat) through `piEngineForSpec` on a new `notebook` role resolving to the strong slot, with structured output by `runSubmitAgent` and plain streaming for chat and replies. Runs appear in the activity feed with cost and abort, and the client follows them over one SSE route. All Notebook styling is scoped under `.nb-root` with Riddled's tokens, fonts (Instrument Sans, Newsreader variable at 420/opsz 14), grain, lift and keyframes, loaded only on Notebook routes.

## Technical Context

**Language/Version**: TypeScript 5.6, React 19.2, Next.js 16.3 (App Router; read `node_modules/next/dist/docs/` before Next APIs), Node 24.

**Primary Dependencies**: existing only at runtime: Tiptap 3.32 (`@tiptap/react/menus` BubbleMenu), Radix/shadcn primitives, Motion (not needed; CSS keyframes copy Riddled), puppeteer-core (PDF), `@resvg/resvg-js` (sketch PNG for Word), Node `zlib` (Word zip), `next/font/google` (Instrument Sans, Newsreader variable). Dev: `@playwright/test` (owner-requested, uses system Chromium, no browser download).

**Storage**: file-backed JSON through a new store adapter `src/store/notebook.ts` (companion files, tenant-scoped, lock, damaged files set aside, schema version). Settings: new `notebook` section in `data/settings.json` plus `general.interface`.

**Testing**: `npm test` (tsx --test) for core, store, server and render tests with faux pi models; Playwright specs in `tests/e2e/notebook/*.spec.ts` with an isolated data dir, their own `next dev` server and intercepted or faux model routes; a real-model manual pass recorded in progress.md with screenshots under `~/agent-runs/2026-11-06-notebook-mode/`.

**Target Platform**: browser (desktop Chrome/Safari/Firefox), hosted (Clerk) and Electron.

**Project Type**: web application (Next.js, server + client in one repo).

**Performance Goals**: Study initial JS unchanged within 5% (constitution VIII): all Notebook client code sits behind the `/notebook` route segment and dynamic imports; fonts load only there. Typing never waits on the server; the pause timer is client-side.

**Constraints**: constitution I–VIII; DESIGN.md Notebook section overrides Study ink only under `.nb-root`; no new runtime dependency; scrollbars hidden; reduced motion; 320/390/1440 widths.

**Scale/Scope**: one user's Library (hundreds of pages); a note up to `PAGE_MAX_BYTES` (1 MB); up to ~200 threads per note.

## Constitution Check

*Gate before research, re-checked after design.*

| Principle | Status | How |
| --- | --- | --- |
| I Owner decides | Pass | 10 owner questions asked one per call (spec Clarifications). Microcopy is ours per the goal and is listed in the UI contract for the owner at gate 2. Reversible technical choices are logged in progress.md Decisions. |
| II Teaching theory first | Pass, not engaged | Notebook does not touch lessons, practice questions or the graph. The Links panel only reads the graph. Margin questions are not graded checks and create no evidence. Flashcards reuse feature 021's draft-then-keep flow. |
| III Learner data is never lost | Pass | Notes are the same Library pages through the same draft/version flow; AI text never enters page text. Companion files are additive, versioned (future versions refused, not rewritten), damaged files set aside. A Write back or chat message is persisted before its run starts. Moving to trash keeps the companion; delete for good removes it (as page proposals do). Mode switches change only `general.interface`. |
| IV Honest states | Pass | No model/key: explicit refusal in the corner hint and in place. Runs show running/failed/stopped distinctly. Cost from usage at read time; unpriced says so. Chat and reads label their context ("Read the whole note, 3 threads and your instructions"). Unknown ids 404, invalid bodies 400, stale anchors 409. |
| V Consent before cost | Pass, owner-approved budget | Automatic reads in "Thinks with you" are the owner-approved background work for this feature, uncapped (owner, 2026-11-06), each in the activity feed with cost and Stop. "When you ask" makes no automatic call. Starters and "Ask about this" only fill a field. Runs are server-side objects; leaving detaches, only Stop cancels. No retry without a click. |
| VI Interface follows DESIGN.md | Pass with owner override | DESIGN.md gains a "Notebook" section whose rules override Study ink inside Notebook only (owner, in the goal): light theme, Riddled tokens, the lift shadow on floating layers, Instrument Sans/Newsreader, ink focus outline. Built from Radix primitives (Dialog, Popover, Switch, RadioGroup) restyled; no decorative libraries. Hidden scrollbars, visible focus, Escape order, focus trap, reduced motion, 44px coarse targets, 320/390/1440. shadcn, impeccable and web-design-guidelines run before done. |
| VII Boundaries, tenancy, sandboxing | Pass | `src/core/notebook*.ts` pure; files only in `src/store/notebook.ts`; routes wrapped in `withTenant`; run registry tenant-scoped. Sketches are validated JSON rendered to SVG by our code, never model HTML. Exports render our own HTML in headless Chromium with JavaScript disabled. |
| VIII Performance | Pass, measured | Notebook code and fonts are route-split; `tests/startup-module-graph.test.ts` extended so Study's startup graph cannot import Notebook modules; initial JS measured before/after with the existing benchmark. |

New dependency: `@playwright/test` (dev only, owner asked for Playwright tests in this goal). No runtime dependency.

## Project Structure

### Documentation (this feature)

```text
specs/024-notebook-mode/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md, progress.md
├── checklists/requirements.md
└── contracts/
    ├── visual-reference.md   # exact Riddled values (CSS line refs, frame measurements)
    ├── ui-contract.md        # our microcopy, behaviour, keyboard, a11y
    └── api.md                # routes, run kinds, SSE events, model I/O schemas
```

### Source Code

```text
app/(app)/notebook/[[...id]]/page.tsx        # server page: reads settings, renders <NotebookApp>
app/(app)/notebook/notebook-fonts.ts          # Instrument Sans + Newsreader variable (route only)
app/(app)/notebook/notebook.css               # all .nb-* rules, tokens, keyframes, reduced motion
app/api/notebook/[pageId]/route.ts            # GET companion, PATCH note fields
app/api/notebook/[pageId]/threads/...         # create, status, messages
app/api/notebook/[pageId]/runs/route.ts       # start run (read|think|ask|reply|visualize|chat)
app/api/notebook/runs/[runId]/stream/route.ts # SSE: deltas, done, failed
app/api/notebook/[pageId]/export/route.ts     # pdf | docx | md
app/api/notebook/reviewers/route.ts           # list/create/update/delete (settings-backed)

src/core/notebook.ts             # types, validation, anchors, placement, pace delays, budgets
src/core/notebook-sketch.ts      # sketch schema, validation, SVG renderer (pure)
src/core/notebook-export.ts      # companion+markdown → export document model, Markdown writer
src/core/docx.ts, src/core/zip.ts# minimal WordprocessingML writer + store/deflate zip (pure, Node zlib injected)
src/store/notebook.ts            # companion files: read/write/lock/set-aside/trash/delete
src/agent/subagents/notebook.ts  # prompts (inline constants), runSubmitAgent schemas, chat/reply streaming
src/server/notebook.ts           # run registry, activity feed rows, abort, route responses
src/server/notebook-export.ts    # headless PDF, docx assembly, resvg PNG

components/notebook/             # client UI, all dynamic under the route
  notebook-app.tsx, note-view.tsx, note-editor.tsx (useEditor + pageExtensions + nb plugins),
  toolbar-row.tsx, instruction-line.tsx, margin.tsx, thread.tsx, tether.tsx, blot.tsx,
  inline-reply.tsx, marks.tsx, selection-menu.tsx, sketch.tsx, sketch-dialog.tsx,
  note-chat.tsx, overlay-sidebar.tsx, settings-modal.tsx, reviewers.tsx, export-dialog.tsx,
  corner-hint.tsx, pointer-ink.tsx, use-reading.ts (pause timer), use-run-stream.ts, nb-plugins.ts

tests/notebook-*.test.ts(x)      # unit/store/server/render
tests/e2e/notebook/*.spec.ts     # Playwright
playwright.config.ts
```

Touch points in existing code (small, additive): `components/sidebar.tsx` (AppShell branch for `/notebook`, footer "Notebook" row), `src/core/command-palette.ts` + dialog (Switch to Notebook), `src/core/keyboard.ts` + `components/keyboard-shortcuts.tsx` (toggle), `src/core/settings.ts`, `src/server/settings-body.ts` (sections), `config.ts` + `src/core/settings.ts` (`notebook` role), `src/server/observability.ts`, `app/api/activity/abort/route.ts`, `components/activity-dock.tsx` (notebook rows in Study's dock too), `src/core/events.ts` (`notebook-changed`), `src/agent/subagents/headless.ts` (`renderPdf`), Library delete-for-good (remove companion), `components/library/page-toolbar.tsx` (export `selectedTextReference`), `DESIGN.md`, `PRODUCT.md`, `specs/ROADMAP.md`.

**Structure Decision**: Option A from research (route inside `(app)`, AppShell opts out of chrome by path). It keeps one root layout, soft navigation between modes, and every provider the draft flow needs.

## Phases (for tasks)

1. Setup: Playwright config, fonts, CSS scaffold, settings fields, role, events.
2. Foundation: core types/anchors/sketch, store, run registry + activity + abort, SSE, routes, AppShell branch, mode switch (US1 base).
3. US1 note page, chrome, themes, sidebar basics, mode round-trip.
4. US2 reading (pause, underline, blot, margin question, tether, ink-in, inline reply).
5. US3 threads (expand, write back, resolve, dismiss, counts, fade, layouts, marks).
6. US4 selection menu and sketches.
7. US5 instructions and reviewers.
8. US6 note chat.
9. US7 just my words and export.
10. US8 overlay sidebar complete, settings modal, pointer ink, corner hint activity.
11. Polish: Links panel, flashcards, a11y, reduced motion, phones, side-by-side screenshots, reviews, docs, report.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Shadow (`--lift`) and light theme inside Notebook | Owner asked for Riddled one to one; DESIGN.md's Notebook section carries it | Keeping Study ink would not reproduce the reference |
| Hand-written zip/docx writer | Word export without a new runtime dependency | A docx library needs owner approval and adds weight; the needed subset (paragraphs, headings, lists, runs, images) is small |
