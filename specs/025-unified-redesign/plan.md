# Implementation Plan: Unified redesign

**Branch**: `unified-redesign` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)

**Input**: spec.md with gate-1 answers, [research.md](research.md) (decisions R1–R16), [data-model.md](data-model.md), [contracts/ui-contract.md](contracts/ui-contract.md).

## Summary

Notebook's paper system becomes the app's only design system. Its tokens, fonts, grain, lift, focus and motion move from `.nb-root` scope to the document root (`html.lh-paper` with `data-theme`, `data-ink`, `data-text-size`, `data-lettering`), set on the server from one shared Appearance (stored in the existing `notebook` settings section, resolved with Study's old `appearance.mode` as a one-time seed). Notebook's generic CSS (tokens, menus, dialogs, option cards, switches, sidebar, panels, threads, margin, ink-in, blot, tether, sketch, keyframes, reduced motion, hidden scrollbars, coarse targets) moves to a shared stylesheet loaded by the root layout; note-page rules stay in `notebook.css`. Study ink is deleted from `globals.css`; Tailwind's theme maps Notebook's tokens (`bg-paper`, `bg-shelf`, `text-ink`, `text-graphite`, `text-faint`, `border-rule`, `shadow-lift`, `text-riddle`, `text-bulb`, a Notebook-derived type scale) and a codemod moves every component to them. Study's chrome is rebuilt from Notebook's components lifted into `components/paper/` (overlay sidebar, top-left menu and wordmark, settings modal shell and option cards, corner hint, ink text, blot, tether, thread shell, margin placement, sketch, export dialog, side panel). The lesson transcript sets tutor prose in the voice with ink-in streaming and the learner's words in sans; pending checks and practice problems render as margin threads beside the tutor paragraph they follow (inline where there is no room), reusing the existing forms and their state owners; the bottom bar keeps free chat and turn controls. Settings in both modes is Notebook's modal, with Study's categories added to its nav.

## Technical Context

**Language/Version**: TypeScript 5.6, React 19.2, Next.js 16.3 (App Router; read `node_modules/next/dist/docs/` before Next APIs), Node 24, Tailwind CSS v4.

**Primary Dependencies**: existing only. Radix (`radix-ui`), lucide-react, Streamdown (rehype plugin for ink-in words), KaTeX, Tiptap 3.32, sigma/graphology, React Flow, Motion (only where already used), `next/font/google` (Instrument Sans, Newsreader variable). Dev: `@playwright/test` 1.65.0 (adopted in 024, tests only). JetBrains Mono and Source Sans 3 are dropped (R4).

**Storage**: no new files. Shared Appearance lives in the existing `notebook` settings section (`appearance`, `textSize`, `lettering`, `ink`); the old `appearance` section stays on disk untouched and is read only for the one-time theme seed (R2).

**Testing**: `npm test` (tsx --test; render tests by static markup), browser regressions in `scripts/check-*.mjs` / `smoke-*.mjs` (updated where they assert the old look or dock placement), Playwright: existing `tests/e2e/notebook/*` stay green, new `tests/e2e/study/*` journeys (Home → lesson → answer a check in its thread → practice → Library page edit → Review → Settings → mode switch round trip), new token-hygiene test (SC-001), contrast test extended to shared tokens. Real-model pass with `LH_NOTEBOOK_ENGINE=codex-verify` extended to Study turns (R14).

**Target Platform**: browser (desktop and phone widths), hosted (Clerk) and Electron.

**Performance Goals**: Study startup JS ≤ +5% against the base commit 7da16e6 (measured with `~/agent-runs/2026-11-07-unified-redesign/startup-js/startup-js.mjs`, the 024 method). The old persistent sidebar, Study settings dialog shell and amber code go, which offsets the lifted overlay sidebar and appearance provider. Notebook-only modules stay out of Study's startup graph (`tests/startup-module-graph.test.ts`).

**Constraints**: constitution I–VIII (theme line amended, R16); every behaviour and string kept unless the UI contract lists a change; hidden scrollbars; reduced motion; 320/390/1440; WCAG AA (4.5:1 text, 3:1 non-text); no new runtime dependency.

**Scale/Scope**: ~40k lines of components, ~1,500 Study token usages, 4,128 unit tests, 54 Notebook e2e specs, ~15 browser regression scripts.

## Constitution Check

| Principle | Status | How |
| --- | --- | --- |
| I Owner decides | Pass | Gate-1 answers (appearance set, checks as margin threads, pane beside, bulb for "your turn") in spec Clarifications. Everything else is the owner's goal ("Notebook's tokens, fonts, components…; reuse, no look-alikes") applied mechanically; reversible technical choices logged in research.md and progress.md Decisions. |
| II Teaching theory first | Pass | Checks change placement, not behaviour: the same forms, request bodies (confidence on real answers, dropped on "I don't know"), no correct answers on the client before answering, practice problems never announce their target and wait for the explicit Next problem. |
| III Learner data is never lost | Pass | No data format changes. Question and problem drafts keep their storage keys (`SessionPartState id=""`, R8). Old appearance values stay on disk. Golden fixtures untouched. |
| IV Honest states | Pass | Every loading/empty/failed/running state keeps its distinct form and string; the corner hint carries Study activity with cost and Stop as the dock did. |
| V Consent before cost | Pass | No new model call. Inline sketches in lessons only render visuals the tutor already delivered (R12). |
| VI Interface follows DESIGN.md | Pass with owner-directed amendment | DESIGN.md is rewritten as one system (the Notebook section becomes the whole file). Built from Radix/shadcn primitives and the lifted Notebook components; TopBar and MenuShell are kept as the shared components, restyled. Lift shadow and light paper become app-wide rules (owner's goal). Hidden scrollbars, visible focus, Escape order, focus trap, reduced motion, 44px coarse targets, 320/390/1440. shadcn, impeccable and web-design-guidelines run before done. |
| VII Boundaries | Pass | No server/store change beyond the settings read for the theme seed and the dev-only Study engine switch (inert in production). The demo theme bridge keeps its allowlist; one live iframe; no reload on theme change. |
| VIII Performance | Pass, measured | Baseline measured on 7da16e6 before any change; re-measured at the end. |

Amendment (R16): constitution "Theme: Study ink, as defined in DESIGN.md. Saved custom backgrounds and reading preferences are preserved." → "Theme: the paper system defined in DESIGN.md, one for both modes. Saved custom backgrounds and reading preferences from before feature 025 stay on disk but no longer style the app (owner, 2026-11-07)." PATCH 1.1.2 → 1.1.3, approved through gate-1 question 1.

## Project Structure

### Documentation (this feature)

```text
specs/025-unified-redesign/
├── spec.md, plan.md, research.md, data-model.md, tasks.md, progress.md
├── checklists/requirements.md
└── contracts/ui-contract.md      # surface-by-surface mapping and new strings
```

### Source Code

```text
app/fonts.ts                         # Instrument Sans + Newsreader variable for the whole app (was Source Sans 3, JetBrains Mono)
app/paper.css                        # NEW: shared paper system (tokens light/dark/system, ink choice, scale, grain, lift,
                                     #   focus, scroll, keyframes, reduced motion, menus, dialogs, option cards, switch,
                                     #   pill, sidebar, side panel, corner hint, thread/margin/ink/blot/tether/sketch)
app/globals.css                      # Study ink removed; Tailwind @theme maps paper tokens; Study layout rules restyled
app/(app)/notebook/notebook.css      # note page only (sheet, column, toolbar row, title, editor body, instruction line…)
app/(app)/layout.tsx, app/(auth)/layout.tsx   # html.lh-paper + data-theme/ink/text-size/lettering from shared appearance
components/paper/                    # NEW: lifted Notebook components, mode-neutral
  surface-root.tsx                   #   portal container context (replaces nb.root for shared pieces)
  appearance.tsx                     #   shared Appearance provider (html attrs, system theme, cross-fade, Electron chrome)
  overlay-sidebar.tsx                #   shell + SidebarBody with rows/footer as props (Notebook and Study fill it)
  chrome.tsx, option-cards.tsx, settings-shell.tsx, corner-hint.tsx, side-panel.tsx,
  ink-text.tsx, blot.tsx, tether.tsx, thread-shell.tsx, margin-layout.ts, sketch*.tsx, export-dialog.tsx, shared.ts
components/notebook/*                # re-export or consume components/paper; behaviour unchanged
components/sidebar.tsx               # AppShell: Study uses the overlay sidebar + top-left chrome
components/chat.tsx (+ dock/question/practice files)  # transcript voice, ink-in, check threads, slimmer DockFooter
components/study/check-thread.tsx    # NEW: margin/inline thread wrapping QuestionDockForm / PracticeDock
components/settings/*                # sections rendered inside the shared settings shell; Appearance section retired
src/core/appearance.ts               # NEW pure: resolve shared appearance (notebook prefs + legacy mode seed)
src/core/demo-theme.ts, src/demo-kit/*, components/graph-view.tsx, components/ai-elements/message.tsx (shiki),
  src/core/diagram-svg.ts, components/diagram/*, components/clerk-appearance.ts, electron/main.cjs + preload.cjs
tests/token-hygiene.test.ts          # NEW: SC-001 grep as a test
tests/e2e/study/*.spec.ts            # NEW Playwright journeys for Study
scripts/unified-screens.mjs          # before/after screenshots (child task)
```

**Structure Decision**: lift, don't fork. Shared pieces move to `components/paper/` and `app/paper.css`; Notebook keeps its file names and imports them, so its classes (`nb-*`), test ids and e2e selectors stay as they are (R5). Study consumes the same components and classes.

## Phases (for tasks)

1. **Foundation**: shared tokens and fonts at the root, shared Appearance (resolve, provider, html attributes, cross-fade, Electron chrome), `app/paper.css` split out of notebook.css, Tailwind theme mapping, Study ink deleted, bridge aliases. Notebook e2e stays green.
2. **Codemod and hygiene**: every component on paper utilities and the type scale; fonts; amber removed (ink primary, bulb for your turn); token-hygiene test.
3. **Shell**: overlay sidebar in Study (Study body), top-left chrome, TopBar and tabs restyled, command palette, menus/tooltips/toasts, corner hint for Study activity, right pane as paper panel, phones.
4. **Lesson transcript**: voice prose, learner sans, quiet rows (tools, math check, lookups, page/library, held edits), thinking, phase heads, ink-in streaming, turn rail, demos card chrome, inline sketch fit.
5. **Checks as margin threads**: CheckThread (margin/inline), state owners intact, slimmer DockFooter, keyboard/Escape/Enter/reveal/?answer= flows, demo auto-open, tests and browser regressions updated.
6. **Settings**: one modal shell, Notebook option cards and switches, Study categories, search, deep links, failure lines; Study Appearance section retired; Notebook Customize applies to both modes.
7. **Library and notes**: Library views, page pane and editor (toolbar, slash/[[ menus, selection menu, link popover, tables, callouts), history, held edits, Links, export dialog, PDF reader, diagrams.
8. **Home, Review, demos**: Home sections and graph colours, calibration, Review queue/cards/drafts/editor, demo theme bridge light/dark and demo-kit, ML panels, mermaid (pele), shiki, quick plots.
9. **Dialogs and states**: every dialog on the lifted dialog, empty/loading/error states, setup dialog, sign-in (Clerk appearance), update banner, error boundary.
10. **Verification**: Playwright Study journeys, browser regressions, real-model pass (codex-verify for Study), startup JS, after screenshots and side-by-side pairs.
11. **Review and docs**: DESIGN.md rewrite, constitution amendment, PRODUCT/ROADMAP, impeccable, web-design-guidelines, accessibility pass, fixes and re-runs, report, Tailscale server on 3131.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Shared settings stored in the `notebook` section | Zero migration, rollback-safe, the values already exist there | A new section would need a migration and a rollback path for no user-visible gain |
| `nb-*` class names used by Study too | Owner: reuse Notebook's components and CSS, no look-alikes; keeps 024's tests valid | Renaming to neutral names would break ~600 test selectors for no visual change |
