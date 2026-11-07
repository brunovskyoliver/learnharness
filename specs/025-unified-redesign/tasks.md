# Tasks: Unified redesign (feature 025)

Inputs: spec.md, plan.md, research.md (R1-R16), data-model.md, contracts/ui-contract.md. `[P]` = parallel-safe (different files). Every phase ends with `npm run lint`, `npm run typecheck`, the unit tests it touched (full `npm test` with `CHROME_PATH=/home/brunovsky/.t3/tools/chrome-headless-shell/linux64/156.0.8078.70/chrome-headless-shell` at phase end), and `npm run test:e2e` for phases that touch Notebook or the shell; one commit per phase `feat(025): phase N <name>`.

## Phase 1: Foundation (shared tokens, fonts, appearance)

- [X] T001 `src/core/appearance.ts`: pure `resolveSharedAppearance(stored)` per data-model.md (theme from `notebook.appearance` on disk → legacy `appearance.mode` → system; textSize, lettering, ink), exported through the core barrel; tests `tests/shared-appearance.test.ts` (each precedence step, invalid values, factory-only record).
- [X] T002 `app/fonts.ts`: Instrument Sans + Newsreader variable as `--nb-font-sans` / `--nb-font-voice` for the whole app (R3); remove Source Sans 3, JetBrains Mono, static Newsreader; delete `app/(app)/notebook/notebook-fonts.ts` and its use in the Notebook page/NotebookApp (`fontClasses` prop becomes unnecessary; keep the prop optional for tests).
- [X] T003 `app/paper.css`: move from notebook.css every token block (light, dark, system, ink choice, faded per ink, lift, grain, bulb, text-*), keyed on `html.lh-paper[data-theme…]`, `[data-ink]`, `[data-text-size]`, `[data-lettering]` (R1); the note-size scale; `.nb-voice` + lettering; grain `.nb-paper`; lift; selection, focus, cursor, hidden scrollbars; all keyframes and the reduced-motion block; menus; overlay sidebar; touch targets; dialog backdrop/close; option cards; switch; pill; side panel (`.nb-chat` shell, `.nb-chat-dim`); corner hint; thread, margin, inline reply, tether, ink dot, blot, reading mark, ink-in words, sketch + sketch dialog; settings modal; export dialog; theme cross-fade. Selectors `.nb-root .x` → `.lh-paper .x` (same specificity). notebook.css keeps only note-page rules and keeps working (import order: globals → paper → notebook).
- [X] T004 `app/globals.css`: delete Study ink (`:root, .dark` token block, `@custom-variant dark`, amber, `--ink-2`, `--surface-raised*`, `--message-surface`, light print theme stays for print only but with paper values); `@theme inline` maps paper tokens to Tailwind (`--color-paper`, `shelf`, `code`, `ink`, `graphite`, `faint`, `rule`, `riddle`, `bulb`, `focus`, `red`, `green`, `blue`, … `--shadow-lift`, `--font-sans`, `--font-voice`, `--font-mono`, the R4 type scale, radii 8/10/12/16); shadcn bridge names (`--background`, `--foreground`, `--card`, `--popover`, `--muted`, `--muted-foreground`, `--border`, `--input`, `--ring`, `--primary`, `--primary-foreground`, `--accent`, `--destructive`, `--success`, `--warning`) defined once in paper.css as aliases (popover → paper, card/muted/accent → shelf, ring → nb-focus, primary → ink, primary-foreground → paper) so nothing unstyled appears before phase 2.
- [X] T005 `app/(app)/layout.tsx` and `app/(auth)/layout.tsx`: `<html class="lh-paper …font vars" data-theme data-ink data-text-size data-lettering>` from `resolveSharedAppearance(readSettingsRecord())` (tenant-scoped as today); remove `appearanceVars`/`htmlStyle`; body gets the `.nb-paper` grain layer and paper background.
- [X] T006 `components/paper/appearance.tsx` (replaces `components/settings/appearance.tsx`'s provider and `appearance-vars.ts`): context with the shared appearance, `update(patch)` through the existing notebook-section write queue (move the queue out of NotebookApp into this provider), sets html attributes, resolves system via matchMedia (`resolvedTheme`), cross-fades through `startViewTransition` (skipped under reduced motion), calls `window.lh?.setChrome` (T008). NotebookApp reads/writes appearance through it and mirrors `data-nb-*` on `.nb-root`.
- [X] T007 [P] Observers that watched html `style`/`class` (graph-view.tsx, demo-card.tsx) also watch `data-theme`, `data-ink`; graph `tokenHex` reads paper tokens (nodes `--ink`, ring `--nb-focus`, muted `--faint`).
- [X] T008 [P] Electron: `preload.cjs` exposes `setChrome({background, symbol})`; `main.cjs` validates hex and applies `setTitleBarOverlay` + `setBackgroundColor`; initial `backgroundColor` from `nativeTheme.shouldUseDarkColors` (paper `#1a1a19` / `#f8f7f4`), titleBarOverlay initial colours the same with ink symbols (R15). Extend `scripts/check-electron-shell.mjs` expectations if it asserts colours.
- [X] T009 Tests: `tests/notebook-contrast.test.ts` reads tokens from `app/paper.css`; `tests/startup-module-graph.test.ts` still passes; Notebook e2e (`npm run test:e2e`) green; render tests updated only where the font/appearance plumbing changed.

## Phase 2: Codemod and hygiene

- [X] T010 `scripts/paper-codemod.mjs` (kept in repo for the record): applies the ui-contract token table to `components/**`, `app/**`, `lib/**` (excluding `components/notebook`, `app/(app)/notebook`, `components/ui/SHADCN-LICENSE`), with a report of every non-mechanical hit (e.g. `text-primary` meaning "your turn") for manual decision. Run it; review the diff by hand.
- [X] T011 Manual pass over the report: "your turn" and waiting cues → `bulb`; primary actions → ink pill; destructive → red; remove `font-title` uses (titles sans 500 −0.032em), font-prose/ui → sans; arbitrary sizes `text-[…]` → scale; `rounded-*` per contract; shadows → only `shadow-lift` on floating surfaces.
- [X] T012 `components/ui/*` (shadcn primitives: button, dialog, popover, tooltip, input, textarea, field, item, skeleton, empty, separator, button-group, input-group, collapsible) restyled to paper (button variants: default = ink pill, secondary/outline = text button with rule ring, ghost = toolbar button; dialog = lifted card; input = rule underline or rule ring per contract) via the shadcn skill conventions.
- [X] T013 Remove dead code: `appearance-vars.ts`, Study appearance consumers (`useAppearance().fontFamily` in demo-card, `--lh-prose-size` local overrides → `--note-size`), `--lh-ink-strong/italic`, `--lh-heading-weight`, `lh-session-scale` if dead, `.dark` variants in classNames.
- [X] T014 `tests/token-hygiene.test.ts` (SC-001): fails on any of `surface-raised`, `ink-2`, `--message-surface`, amber `#e3a957`, Source Sans/JetBrains, `font-title`, `font-prose`, `font-ui`; hex/rgb/hsl colour literals, `font-size: <n>px` and `text-[…px]`, `fontSize:` numbers and `font-family:` literals in `components/**`, `app/**` (tsx/ts/css) outside `app/paper.css`'s token blocks; with an explicit allowlist file `tests/token-hygiene-allow.json` for data colours (charts, demo-kit series, heatmaps, PDF marks, diagram/notebook export palettes, sketch export, Electron hex, Clerk variables if literals are required), each entry with a reason.
- [X] T015 Unit tests updated where they assert old classes (render tests); full `npm test`.

## Phase 3: Shell

- [X] T016 `components/paper/surface-root.tsx` + `components/paper/chrome.tsx` (MenuGlyph, CloseGlyph, Wordmark with `href`), `components/paper/shared.ts` (useArrowChoice, useIsMac, keyLabel, isMod, saveStateLine); Notebook files import from there.
- [X] T017 `components/paper/overlay-sidebar.tsx`: shell (Radix Dialog, dim, ✕, Escape, outside click, hover-open from the left-edge strip with 024's rules, focus return) + `SidebarBody` taking `search`, `primary actions`, `sections`, `rows`, `footer` as props; Notebook's overlay-sidebar.tsx becomes a thin filler (its tests stay green).
- [X] T018 `components/sidebar.tsx` AppShell for Study: top-left chrome, hover strip, the overlay sidebar filled with Study's body (R6: search, New menu, filters, Library tree, Review, date shelves, rows with bulb waiting dot and running indicator, footer); remove the persistent `SessionsSidebar` column, its resize handle and bootstrap script; phone `mobile-sidebar.tsx` replaced by the same overlay; keyboard shortcut to toggle (Mod+\ and Study's existing binding).
- [X] T019 [P] `components/top-bar.tsx` restyle (R7), 52px band and drag regions intact; window controls overlay gutter intact.
- [X] T020 [P] Tabs (workspace tabs component) restyle (R7), 36/48px heights kept.
- [X] T021 [P] Command palette dialog restyle (contract), behaviour unchanged.
- [X] T022 [P] `components/menu-shell.tsx`, tooltips, popovers → `.nb-menu` look; Escape order intact.
- [X] T023 `components/paper/corner-hint.tsx` lifted from Notebook (props: status, runs, idle line, stop); `components/activity-dock.tsx` renders Study's feed through it (R13): running · cost · Stop, popover list with abort and links (Drafts etc.), failures; Notebook's corner hint uses the same component.
- [X] T024 Right pane (`components/workspace-pane.tsx`, `components/workspace/*`, context view) as a paper panel (R11), resize handle = rule hairline (brightens to graphite on hover, `--nb-focus` on keyboard focus).
- [X] T025 Update shell tests and regressions: `scripts/smoke-sidebar-ui.mjs`, `check-workspace-ui.mjs`, render tests for sidebar/palette/tabs; e2e notebook green.

## Phase 4: Lesson transcript

- [X] T026 Assistant prose in the voice (R9): `.lh-prose` inside assistant messages takes `.nb-voice` treatment and size/leading; headings, lists, blockquotes, tables, code, math restyled in paper; links ink with 40% underline.
- [X] T027 Learner turn without bubble (R9): `user-message` block sans graphite, faint "You" meta line; sent-passage and reference rows restyled.
- [X] T028 Ink-in streaming: rehype plugin `components/paper/rehype-ink-words.ts` wrapping words in the streaming message's last block in `span.nb-ink-word` with the stagger (`inkStepMs`); only while that message streams; reduced motion → plain; test that settled messages emit no `nb-ink-word` and the streaming one does, and that re-render keeps earlier spans (render test on two successive inputs).
- [X] T029 [P] Quiet rows (R10): tool card, math check row, lookup rows, page/library rows, held-edit row, tokenize row; strings unchanged.
- [X] T030 [P] Thinking block and phase heads (R10); thinking placeholder uses Notebook's breathing blot.
- [X] T031 [P] Turn rail, compaction divider, system lines, queued steers restyled.
- [X] T032 [P] Demo card chrome (title row, expand/brightness/download icons), plan block and plan window, course list, mermaid frame and quick plot frame per R12.
- [X] T033 Lesson column measure 660px at ≥768 and phone gutters; `--lh-measure` updated; tables shrink rule kept.
- [X] T034 Tests: render tests for message/user turn; `scripts/check-streaming-ui.mjs`, `check-transcript-scroll-ui.mjs` updated if they assert classes.

## Phase 5: Checks as margin threads

- [X] T035 Export `QuestionDockForm` (and a thread-friendly `PracticeDock` body) without changing their state owners; remove the `controls` StatsBar from them when rendered in a thread.
- [X] T036 `components/study/check-thread.tsx`: thread shell (dot, open layout, tether, unfold/settle, ink-in question), collapsed line (kind, teaser, Answer/Solve; reveal line "Check your understanding"), margin/inline variants, portal into a margin layer beside `lesson-content`; placement with `placeStack`/`useMeasuredRefs`; inline fallback when right space < 481px (R8).
- [X] T037 `components/chat.tsx`: render the pending question / active problem through CheckThread from its part slot inside `<SessionPartState id="">`; anchor = nearest preceding assistant text part; exempt the active problem from windowing; move expanded/revealed state, arrival reset, `expandAndReveal` + focus rule, Enter-opens-the-waiting-check and the `?answer=` effect into a check controller; DockFooter keeps composer mode only, with the pending line and "Go to it" (contract).
- [X] T038 Keyboard machine armed only while focus is inside the open thread; Escape layering unchanged; demo auto-open unchanged; "Using {demo}" line in the thread.
- [X] T039 Tests: update `dock-summary`, `prompt-bar`, `reveal-arrival`, `dock-state-key`, `render-cards`, `render-practice-surface` for the new placement; new `tests/render-check-thread.test.tsx` (margin vs inline, collapsed/open/reveal, storage keys bare); update `scripts/smoke-dock-ui.mjs` (question inside `lesson-content` thread now), `check-session-state-ui.mjs`, `check-turn-navigation-ui.mjs`.

## Phase 6: Settings

- [X] T040 `components/paper/settings-shell.tsx` (from settings-modal: Radix Dialog + vertical Tabs, 840×704, nav, search field at the nav top) and `components/paper/option-cards.tsx` (exported `OptionCardGroup`/`OptionCard`, thumbnails); Notebook's SettingsModal uses them.
- [X] T041 One `SettingsDialogProvider` for both modes rendering the shell; nav: Customize (shared appearance: theme, text size, lettering, AI ink; plus Notebook's start mode, pointer ink, pace, layout — labelled as Notebook's), Reviewers, Providers, Agent, Graph, Keyboard, General; search across all rows (settings-index) with the same land-and-highlight; deep links (`open(section,row)`; map Notebook's `"models"` calls to `agent`); Electron `lh:open-settings` → General.
- [X] T042 Study section bodies (`keys-section`, `agent-section`, `model-menu`, `graph-display-section`, `keyboard-section`, `update-settings`, `controls.tsx`, `toggle.tsx`, connection dialogs) restyled: rows as Notebook settings labels + controls, toggles as `.nb-switch`, choices as option cards or `.nb-menu` selects, failure line pinned at top with Try again.
- [X] T043 Retire Study's Appearance section (background, font, size, heading weight, emphasis colours); Graph section stays (its graph toggles move under "Graph").
- [X] T044 Tests: settings render tests, settings-index test, e2e sidebar-settings (Notebook) green, new Study settings e2e in phase 10.

## Phase 7: Library and notes

- [ ] T045 [P] Library view (header, search, views pills, tags, sort/layout controls, rows/grid, folder rows, breadcrumbs, select toolbar, upload rows, refusals, clash dialog, trash), contract look.
- [ ] T046 [P] Page pane header and editor: toolbar as Notebook toolbar buttons, slash and [[ menus (Notebook's restyle, already present under `.nb-root`, lifted), link popover, tables, callouts, collapsible, wiki links, saved passages, images, placeholder; editor body type = Notebook note body (Instrument Sans, note size, 1.8).
- [ ] T047 Editor selection bubble → Notebook selection-menu card (format rows + Study's actions as the action list in the voice: Explain, Simpler, Summarize, Rewrite, Expand, Challenge, Quiz me on this, Generate questions, Ask…; the "why not now" sentence) — same handlers.
- [ ] T048 [P] History, tutor-changes bar, held edits line/review dialog/edit-first, Links panel (column/block), outline.
- [ ] T049 Export: page Export opens the lifted export dialog (PDF, Word, Markdown through the existing `/api/notebook/:pageId/export` route; "Include the notes" only when the page has Notebook notes) plus Copy as Markdown and Print actions kept.
- [ ] T050 [P] PDF reader chrome (header, toolbar row, highlights list, bubble → selection-menu card, citation line); page paper stays white (data).
- [ ] T051 [P] Diagrams: `diagram.css`, canvas `colorMode` follows resolved theme, nodes/edges on tokens, tools row, dialogs; `src/core/diagram-svg.ts` export palette = paper light (allowlisted).
- [ ] T052 Tests: `check-library-ui`, `check-library-folders-ui`, `check-notes-ui`, `check-documents-ui`, `check-diagrams-ui` and render tests updated where they assert the look.

## Phase 8: Home, Review, demos

- [ ] T053 [P] Home (title, composer, waiting list with bulb kind labels, lesson rows, flashcards row, calibration, knowledge graph box and expanded dialog, chain table, notes import), minimal home.
- [ ] T054 [P] Review (page, pills, queue card, reveal, ratings, after-rating line, states, card editor, All cards, Drafts, Deleted, Make flashcards panel).
- [ ] T055 Demo theme bridge: `src/core/demo-theme.ts` sends paper tokens (bg paper, surface shelf, surface-2 code, border rule, text ink, muted faint, plus `color-scheme` per resolved theme and the font); default `DEMO_THEME_VARS` = paper light/dark by scheme; demo-kit runtime and flow-entry follow `color-scheme` (no hard-coded dark); series colours stay data; `demoPrefersInvert` per resolved theme. Bridge allowlist and validation unchanged (VII).
- [ ] T056 [P] ML panels and lookups chrome, heatmap neutral ends (ground → paper), mermaid pele vars, shiki theme pair = paper light/dark from tokens, KaTeX colour inherit.
- [ ] T057 Tests: demo-theme tests, `smoke-demo-workspace.mjs`, `smoke-demo-runtime.mjs`, `check-review-ui.mjs`, home render tests.

## Phase 9: Dialogs and states

- [ ] T058 [P] Every remaining dialog (delete session/node, abort turn, setup dialog and lazy setup, loading modal, notes import, connection dialogs, move-to, rename, tags) on the lifted dialog; focus trap/return intact.
- [ ] T059 [P] Empty, loading (skeletons), error (error.tsx boundary, "This view could not be shown.") per contract; update banner; setup CTA.
- [ ] T060 [P] Hosted: `clerk-appearance.ts` variables from paper tokens (`var(--…)` where Clerk accepts; literal paper hex allowlisted otherwise), sign-in/up pages on paper; account row.
- [ ] T061 Phones: 320/390 pass for every surface (overlay sidebar, pane layer with "Back to chat", inline check threads, composer above keyboard, 44px targets).

## Phase 10: Verification

- [ ] T062 Playwright Study journeys `tests/e2e/study/*.spec.ts` (isolated data dir, seeded review chats, intercepted model routes as the browser regressions do): home-and-sidebar, lesson-check-thread (choice + confidence, free text, I don't know, reveal, ?answer=), practice (solve, skip, next problem), library-page (create, edit, slash menu, selection menu action, export), review (show answer, rate, undo), settings (every category, search, theme change applies to both modes), mode-switch round trip with theme continuity, a11y (keyboard path, focus ring colour, scrollbars hidden, coarse targets) at 1440 and 390.
- [ ] T063 Extend the codex-verify switch to Study turns (R14) with unit tests (inert when unset and in production); real-model pass over every scope item in both modes, notes and screenshots under `~/agent-runs/2026-11-07-unified-redesign/real-model/`.
- [ ] T064 Run `scripts/unified-screens.mjs` for the after set; side-by-side Notebook/Study pairs (`pairs/`) for: note vs lesson, Notebook sidebar vs Study sidebar, Notebook settings vs Study settings, note chat panel vs right pane, margin thread vs check thread; index.md.
- [ ] T065 Startup JS after vs `startup-base.json` (≤ +5% raw and gzip on `/`, `/chat/new`, `/library`).
- [ ] T066 Full gate: lint, typecheck, build, `npm test`, `npm run test:e2e`, the browser regressions in `scripts/`.

## Phase 11: Review and docs

- [ ] T067 DESIGN.md rewritten as one system (tokens, type, layout, components, motion, focus/scroll, then each surface's rules in the paper language, keeping every behavioural rule and string reference from the old file).
- [ ] T068 Constitution PATCH 1.1.3 (R16); PRODUCT.md, docs/ui-review.md, design-system/README.md note, ROADMAP row 025.
- [ ] T069 impeccable audit + web-design-guidelines review + accessibility pass (keyboard, screen reader names/landmarks/live regions, 4.5:1 / 3:1 computed) → `specs/025-unified-redesign/reviews.md`; fix; re-run until no open findings.
- [ ] T070 Report in progress.md; leave `next start` of this branch running on Tailscale port 3131 (detached, survives the session; throwaway data dir seeded with the review data and the codex-verify engine so it is usable).
