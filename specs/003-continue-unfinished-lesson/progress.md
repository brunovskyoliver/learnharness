# Progress: 003 Continue an unfinished lesson from Home

## Stage

Implemented 2026-10-28. Not committed, pushed or deployed.

## Decisions

- Spec Clarifications: 8 owner answers (resume drafts unsent, merged row, no hide, placement inside "Waiting for you", current topic counts as left, existing draft kept, one heading count, finished = every plan topic checked once).
- research.md R1–R5: technical choices (summary projection, plan-view status rule, `?continue=1` with a server-computed draft, row shapes).
- Agent decisions (reversible): the feature's render tests were added to the existing `tests/render-waiting-section.test.tsx` instead of a new `tests/waiting-section.test.tsx`; the summary tests went into `tests/waiting.test.ts`.

## Log

- 2026-10-28: spec, clarify, plan (approved), tasks, analyze (6 findings, all fixed), implement.
- T001: performance baseline, production build, `~/agent-runs/2026-10-28-feature-003/perf.sh baseline` (the 002 harness, `/chat/perf-a`, 9 runs). Medians: JS 707,109 B; API 16,755 B; ready 730 ms; FCP 76 ms; blocking 4 ms; CLS 0.0032; DOM 5,285.
- T002–T006: `src/core/lesson-progress.ts` (`lessonProgressOf`, `continueDraft`), `ChatSummary.progress`, set in `readSummary` for non-practice sessions. Writing the tests showed that with "current counts as left" no lesson ever reaches 0 left (the plan stores no done state); owner ruled finished = every plan topic checked at least once. Tests: `tests/lesson-progress.test.ts` (9), `tests/waiting.test.ts` (+5, including the exact-keys allowlist and cache invalidation).
- T007–T009: `components/waiting-section.tsx` (`continueSessions`, `continueHref`, `progressLine`, `LessonRow`, progress line on `WaitingRow`, one count); `.waiting-row[data-progress]` grid area in `app/globals.css`. Tests: `tests/render-waiting-section.test.tsx` (+6).
- T010–T012: `app/(app)/chat/[id]/page.tsx` reads `?continue=1` and passes `initialContinue` with the draft computed from the record at request time; `components/chat.tsx` applies it once on mount via `continueDraftToApply(sessionStateStore.get("composer"), draft)`, jumps to the bottom, and drops the param (`clearContinueParam`). Tests: `tests/chat-continue.test.ts` (4).
- T013–T014: plan-rewrite and progress-moves cases.
- Browser check (production build, isolated `LH_DATA_DIR` with golden + review seed + one temporary merged-row record; `~/agent-runs/2026-10-28-feature-003/check-continue.mjs`, log `check-continue.log`): heading "5 open"; Lesson row "11 of 14 topics left · next: Four parameters, each forced" after the Answer/Solve rows; merged row shows "13 of 14 topics left · next: Transition: only unmastered mass moves" under its teaser; Continue → composer "Continue with Four parameters, each forced", URL without `continue`, 1 px from the bottom; with a saved draft the composer keeps "my half-written question". No horizontal overflow at 1440/390/320.
- T017: manual review in place of the `shadcn`, `impeccable`, `web-design-guidelines` skills (not installed; Principle VI exception as in 001/002). Screenshots `~/agent-runs/2026-10-28-feature-003/shots/home-waiting-{1440,390,320}.png`: amber only on kind labels, quiet raised buttons, no new borders or type sizes, progress line wraps on phones. Keyboard: Tab is replaced app-wide outside dialogs by an owner rule (2026-09-17, `components/keyboard-shortcuts.tsx`), so Continue is reached like 002's Answer links and uses the same global `:focus-visible` ring.
- T018: performance, same harness, medians: JS 707,109 → 707,204 B (+0.01%); API 16,755 → 16,899 B (+0.9%, the progress fields); ready 730 → 715 ms; FCP 76 → 84 ms (baseline runs alone spread 60–176 ms); blocking 4 → 4 ms; CLS and DOM unchanged. Within the 5% budget.
- T019: `smoke-sidebar-ui.mjs` passes (8 PASS). `smoke-dock-ui.mjs` passes 20 checks, then fails the pre-existing assertion "completed answer starts below the top row" (26 px this run), which 002 recorded as failing on unchanged code; not caused by this feature. Logs in `~/agent-runs/2026-10-28-feature-003/`.
- T020: hosted record streamed over ssh into `lessonProgressOf` (read only, no copy kept): `{"total":11,"left":2,"next":"Learning by gradient descent"}` → SC-001 met.
- T021: `npm test` 2584/2584; `npm run typecheck`, `npm run lint` (6 GB heap) and `npm run build` pass.

## Report

**What changed**
- Home's "Waiting for you" lists each lesson whose plan has an unchecked topic and nothing waiting as a "Lesson" row: title · last active, "{left} of {total} topics left · next: {topic}", Continue. A waiting lesson keeps one Answer row and gains the same progress line. The heading counts every row.
- Continue opens `/chat/<id>?continue=1`: at the bottom, "Continue with {topic}" in an empty composer (a draft is never replaced), nothing sent, param dropped.
- Progress is derived in the session-list summary from the plan and transcript with the plan view's rule; nothing is stored.
- Docs: DESIGN.md (Home), docs/ui-review.md, PRODUCT.md.

**How it was verified**
- 24 new unit/render tests; full suite, typecheck, lint, build; browser check with screenshots at three widths; performance before/after; hosted record check.

**What is left**
- Pre-existing dock smoke failure (002 follow-up), unchanged.
- Owner review: the agent decisions above and the Principle VI substitute review.
- Not committed, pushed or deployed.
