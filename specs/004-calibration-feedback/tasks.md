# Tasks: Calibration feedback

**Input**: Design documents from `specs/004-calibration-feedback/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/chat-summary-calibration.md, quickstart.md

**Tests**: Included where the constitution requires proof: exclusions and the allowlist (Principle II), render states, browser regressions.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Performance baseline with `~/agent-runs/2026-10-28-feature-004/perf.sh baseline` (copy of the 003 harness) on a production build of the current tree

## Phase 2: Foundational (blocks US1 and US2)

- [X] T002 [P] Write failing tests in `tests/calibration.test.ts`: `confidenceLevel` midpoints (25→Guessing, 37→Guessing, 38→Unsure, 62→Unsure, 63→Fairly sure, 84→Fairly sure, 85→Certain, 95/100→Certain); `calibrationOf` counts only answers with boolean `correct`, numeric `confidence`, not `dontKnow`, not `dismissed`; returns null when none count; misses = wrong at Certain in transcript order with `toolCallId`, `question`, `answeredAt`, `messageId` (the check's assistant message if it has prose, else the nearest earlier assistant message with prose, else null); `mergeCalibration` sums levels across chats and orders misses newest `answeredAt` first with `chatId` and `title`; `levelLine` → "Certain · 61 answers · 51 right (84%)", "Unsure · 1 answer · 0 right" (no percent when answers < 5); a hosted-shaped fixture (34 at 100 with 5 wrong, 27 at 95 with 5 wrong, 1 at 50 wrong, 1 "I don't know") yields Certain 61/51, Unsure 1/0, 10 misses
- [X] T003 Implement `src/core/calibration.ts` (`ConfidenceLevel`, `CONFIDENCE_LEVEL_ORDER`, `confidenceLevel`, `ChatCalibration`, `CalibrationMiss`, `calibrationOf`, `mergeCalibration`, `levelLine`) with the display math repair on `question`; export from `src/core/index.ts`
- [X] T004 Add `calibration?: ChatCalibration` to `ChatSummary` in `src/core/contracts/chat.ts` with a doc comment (question text only; no options, answers or explanations)
- [X] T005 Set `summary.calibration` in `readSummary` in `src/store/chats.ts` when `calibrationOf(messages)` is non-null
- [X] T006 [P] Extend `tests/waiting.test.ts`: a record with graded answers carries `calibration` whose keys are exactly `levels` and `misses`, each miss exactly `toolCallId`, `question`, `answeredAt`, `messageId`; no option text, correct-answer or explanation strings in the serialized summary; a record without graded answers carries none

## Phase 3: User Story 1 — See how well confidence matched results (P1) 🎯 MVP

- [X] T007 [P] [US1] Write failing render tests in `tests/render-calibration-section.test.tsx` for `CalibrationSectionView`: hidden (renders nothing) when merged levels are empty; heading "Calibration"; level lines in order Guessing → Certain with the percent rule; loading renders nothing new (the list is shared and Home already shows its state) and a failed refresh keeps the last data
- [X] T008 [US1] Implement `components/calibration-section.tsx` (`CalibrationSection` reading `useSessionList()`, `CalibrationSectionView` pure) and mount it in `components/home.tsx` between `WaitingSection` and the graph section

## Phase 4: User Story 2 — Revisit the misses made while Certain (P2)

- [X] T009 [P] [US2] Extend `tests/render-calibration-section.test.tsx`: subheading "Wrong while Certain"; newest 5 rows with one-line stripped question, session title and time; "Show all {n}" when more than 5 (button, expands in place); one sentence when there are no misses; each row links to `/chat/<id>#message-<messageId>` (or `/chat/<id>` when `messageId` is null); no option or explanation text
- [X] T010 [US2] Implement the misses list in `components/calibration-section.tsx` (rows reuse `.waiting-row` grid and `Teaser`/`teaserPlain`; "Show all {n}" is a `prompt-secondary` button with local state)

## Phase 5: Polish & cross-cutting

- [X] T011 [P] DESIGN.md (Home → Calibration section), docs/ui-review.md, PRODUCT.md Home sentence
- [X] T012 Browser check on a production build with isolated seeded data (incl. a lesson with answers at several levels and >5 misses at Certain): section placement, lines, Show all, a miss opens its session at the anchor; screenshots at 320/390/1440 in `~/agent-runs/2026-10-28-feature-004/shots/`; manual review against the shadcn, impeccable and web-design-guidelines checklists
- [X] T013 Re-measure with `perf.sh final`; compare with T001 (within 5%)
- [X] T014 Run `smoke-sidebar-ui.mjs` and `smoke-dock-ui.mjs`; record pass/fail, separating the known pre-existing dock assertion
- [X] T015 Read-only hosted check over ssh: stream the hosted record into `calibrationOf` and confirm SC-001
- [X] T016 `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`; final Report in `specs/004-calibration-feedback/progress.md`

## Dependencies & execution order

T001 → T002 → T003 → T004 → T005 → T006; US1 (T007–T008) and US2 (T009–T010) after Phase 2, US2 after T008 (same file); Polish last.

## Implementation strategy

MVP = Phase 2 + US1 (the counts). US2 adds the list in the same section.
