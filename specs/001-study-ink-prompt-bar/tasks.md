# Tasks: Study ink visual system and prompt bar

**Input**: Design documents from `specs/001-study-ink-prompt-bar/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/prompt-bar.md

**Tests**: Existing render tests are updated where they pin retired visuals; new assertions cover the turn strip, answer well, Skip, usage percentage and setup-in-toolbar.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [x] T001 Record baseline: `npm test` (2507 tests, 3 pre-existing failures: chatgpt-connection-ui ×2, provider runtime loader), lint, typecheck, in specs/001-study-ink-prompt-bar/progress.md

## Phase 2: Foundational (tokens; blocks every story)

- [x] T002 Remap color roles to Study ink and add `--ink-2`/`--color-ink-2` in app/globals.css (R1)
- [x] T003 Type scale and radius tokens in app/globals.css (R3, R5)
- [x] T004 Newsreader title face: app/fonts.ts, `--font-title`, prose h1/h2 rule, drop CMU and the weight-900 rule (R4)
- [x] T005 `--font-title` follows only an explicit reading font in components/settings/appearance-vars.ts; update tests/settings-pure.test.ts expectations
- [x] T006 Prompt shell focus moves to the answer well; add `.answer-well`, `.turn-strip`, `.prompt-primary` classes in app/globals.css

## Phase 3: User Story 1 — answer a lesson check (P1)

- [x] T007 [US1] Add `TurnStrip`, `AnswerWell`, `PrimaryAction` to components/prompt-controls.tsx
- [x] T008 [US1] QuestionDock: turn strip (R7), body, choice rows (accent selection), confidence row with "I don't know" text button (still a keyboard row), answer well, "Submit answer" in components/question-dock.tsx
- [x] T009 [US1] Update tests/dock-summary.test.tsx and related question render tests

## Phase 4: User Story 2 — one bar in every state (P1)

- [x] T010 [US2] Composer: chat answer well, Stop labelled, Next problem as PrimaryAction with hint in components/composer.tsx
- [x] T011 [US2] PracticeDock: turn strip, rendered teaser, Skip + Submit in components/practice-dock.tsx; wire `onSkip` to the problem abort confirm in components/chat.tsx
- [x] T012 [US2] Queued steers as rows (R12) in components/queued-steers.tsx — rows only; no remove control (no cancel route exists, reported)
- [x] T013 [US2] Scroll-to-latest stays above the bar edge (verify DockFooter placement) in components/chat.tsx
- [x] T014 [US2] Update tests/render-composer.test.tsx, tests/render-practice-surface.test.tsx, tests/render-queued-steers.test.tsx

## Phase 5: User Story 3 — setup and usage in the toolbar (P2)

- [x] T015 [US3] StatsBar `setup` slot and usage percentage in components/stats-bar.tsx
- [x] T016 [US3] ModelControl labels without "—" (R9) in components/model-picker.tsx
- [x] T017 [US3] chat.tsx, home.tsx, new-session.tsx pass setup into the toolbar instead of floating/portaled CTAs
- [x] T018 [US3] Update tests/render-stats-bar.test.tsx, tests/zero-keys.test.tsx, tests/composer-actions.test.tsx, tests/render-new-session.test.tsx

## Phase 6: User Story 4 — calm study room (P2)

- [x] T019 [P] [US4] Replace opacity text greys across components (R2)
- [x] T020 [P] [US4] Remove shadows and backdrop blur in app-owned components (R5)
- [x] T021 [P] [US4] Remove side borders (blockquote, thinking block) and dashed borders
- [x] T022 [US4] User turn and thinking rows on the reading edge in components/chat.tsx, components/thinking-block.tsx (R13)
- [x] T023 [US4] Update tests pinning retired classes (render-md-blocks, render-cards, others found by the suite)

## Phase 7: User Story 5 — audit fixes (P3)

- [x] T024 [P] [US5] Phase labels as left running heads in components/phase-divider.tsx; update tests/render-phase-divider.test.tsx
- [x] T025 [P] [US5] Demo stand-in as one row (`.demo-inline-preview`) in app/globals.css and its component
- [x] T026 [P] [US5] Turn rail hidden below three turns in components/session-turn-rail.tsx
- [x] T027 [US5] Off-scale sizes: `text-[11px]`/`text-[16px]` and UI `text-xs` → scale per R3

## Phase 8: Polish and governance

- [x] T028 Constitution 1.1.0 amendment in .specify/memory/constitution.md
- [x] T029 DESIGN.md Study ink and prompt bar sections; PRODUCT.md and docs/ui-review.md corrections
- [x] T030 Contrast check script over token pairs (scratch) and record results
- [x] T031 `npm test`, lint, typecheck, build; Playwright screenshots at 320/390/1440 of the four review threads; compare against the canvas
- [x] T032 progress.md Report; commit and push

## Dependencies

Phase 2 blocks all stories. US1 → US2 share prompt-controls (T007 first). US3 depends on T015/T016 before T017. US4 and US5 are independent of the prompt bar after Phase 2.
