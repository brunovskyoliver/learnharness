# Tasks: Continue an unfinished lesson from Home

**Input**: Design documents from `specs/003-continue-unfinished-lesson/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/chat-summary-progress.md, contracts/continue-param.md, quickstart.md

**Tests**: Included where the constitution requires proof: the derivation and its allowlist (Principle II), the draft-kept rule (Principle III), and render tests for the changed list.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Record the performance baseline for Home with `node scripts/measure-session-performance.mjs` and save the numbers to `~/agent-runs/2026-10-28-feature-003/perf-before.txt`

## Phase 2: Foundational (blocks US1 and US2)

- [X] T002 [P] Write failing tests for `lessonProgressOf` and `continueDraft` in `tests/lesson-progress.test.ts`: no tree → null; empty nodes → null; all visited, none current → null; current counts as left; a visited topic that becomes current again counts as left (hosted case: 11 nodes, current `training`, only `course` never reached → `{ total: 11, left: 2, next: "Learning by gradient descent" }`); no current → next is the first upcoming in `tree.nodes` order; `continueDraft` → `"Continue with {next}"`. The hosted case uses a fixture shaped like the hosted record (11 plan nodes with the hosted ids/titles, quiz calls tagged in the hosted order) so SC-001 is pinned offline
- [X] T003 Implement `src/core/lesson-progress.ts`: `LessonProgress { total; left; next }`, `lessonProgressOf(tree, messages)` using `derivePlanStatusesLh` + `derivedNodeStatus` (unfinished = `current` or `upcoming`; "`total` = `tree.nodes.length` (≥ 1)", "`left` ≥ 1" else null), and `continueDraft(progress)`; export from `src/core/index.ts`
- [X] T004 Add `progress?: LessonProgress` to `ChatSummary` in `src/core/contracts/chat.ts` with a doc comment: present only on teaching sessions with unfinished plan topics; plan topic titles only
- [X] T005 In `readSummary` in `src/store/chats.ts`, set `summary.progress = lessonProgressOf(tree, messages)` when `kind !== "practice"` and the result is non-null
- [X] T006 [P] Extend `tests/waiting.test.ts` (or a new `tests/chat-summary-progress.test.ts` if the store is easier to drive there) to prove a teaching record with topics left carries `progress`, a practice record never does, and a finished plan carries none; assert `Object.keys(progress)` is exactly `["total", "left", "next"]` (FR-007 allowlist)

**Checkpoint**: `npm test` passes; `/api/chats` items carry `progress` for the review lesson.

## Phase 3: User Story 1 — See unfinished lessons on Home and resume one (P1) 🎯 MVP

**Goal**: "Waiting for you" lists Lesson rows with Continue after the Answer/Solve rows; Continue opens the lesson with the draft in an empty composer.

**Independent Test**: Review data with one lesson that has topics left and no pending question; resume it from Home only.

- [X] T007 [P] [US1] Write failing render tests in `tests/waiting-section.test.tsx` (extend the 002 file): Lesson row shows "Lesson", "{title} · {ago}", "{n} of {total} topics left · next: {topic}" and a "Continue" link to `/chat/<id>?continue=1`; Lesson rows come after all Answer/Solve rows, `updatedAt` newest first; a session with `waiting` and `progress` renders one Answer row with the progress line and no Lesson row; heading "{n} open" counts every row; empty sentence unchanged when there are no rows; loading skeleton and the failed "Try again" state still render as in 002 (FR-006)
- [X] T008 [US1] In `components/waiting-section.tsx`: add `continueSessions(chats)` (no `waiting`, has `progress`, sorted by `updatedAt` desc), `continueHref(chat)`, `progressLine(progress)`, a `LessonRow` reusing the `waiting-row` grid (kind slot "Lesson", meta slot "{title} · {shortAgo(updatedAt)}", teaser slot = progress line, quiet `Continue` link with `aria-describedby`), the progress line under the teaser in `WaitingRow` when `chat.progress` is set, and the heading count over both lists
- [X] T009 [US1] Add the `.waiting-row-progress` grid area (small, muted, under the teaser; wraps on phones) in `app/globals.css` next to the existing `.waiting-row` rules
- [X] T010 [US1] In `app/(app)/chat/[id]/page.tsx`: read `continue` from `searchParams`; when it equals `"1"`, compute `continueDraft(lessonProgressOf(chat.tree, chat.messages))` (skip when null) and pass it as `initialContinueDraft` to `Chat`
- [X] T011 [P] [US1] Write failing tests in `tests/chat-continue.test.ts` for a pure helper `continueDraftToApply(saved: unknown, draft: string | undefined): string | null` (undefined, empty or whitespace-only saved → draft; non-empty string saved → null; no draft → null), plus a store-level case: a `SessionStateStore` holding a saved `"composer"` draft keeps it after the apply step
- [X] T012 [US1] In `components/chat.tsx`: add the `initialContinueDraft` prop and the exported `continueDraftToApply` helper; in a mount-only `useEffect`, read the saved composer synchronously from the store (`useSessionStateStore()?.get("composer")`, localStorage-backed, so it reflects the saved draft before `useSyncExternalStore` re-renders), apply the draft via `applyText` only when `continueDraftToApply` returns text, jump to the bottom with the same mechanism 002's `answerTarget` uses, and drop the param with a `clearContinueParam()` modeled on `clearAnswerParam()`; never call `send`

**Checkpoint**: Quickstart steps 2–5 pass.

## Phase 4: User Story 2 — Progress stays true as the lesson moves (P2)

**Goal**: The count and next topic follow the transcript and the current plan.

**Independent Test**: Answer a check on the next topic in a review lesson; Home shows the lower count and new next topic.

- [X] T013 [P] [US2] Add cases to `tests/lesson-progress.test.ts`: a later quiz on a new node moves `next` and lowers `left`; a rewritten `tree` (different nodes) is what the count follows; the last topic finished → null
- [X] T014 [US2] Confirm the summary cache invalidates on the transcript write (`writeChat` deletes the cache entry) by extending the summary test from T006 with a second write that moves progress

**Checkpoint**: Quickstart step 6 passes.

## Phase 5: Polish & cross-cutting

- [X] T015 [P] Update `DESIGN.md` (Home → Waiting for you): the Lesson row, the progress line on Answer rows, ordering and the one-total count
- [X] T016 [P] Update `PRODUCT.md` Home line to mention unfinished lessons in "Waiting for you"
- [X] T017 Manual UI review against the shadcn, impeccable and web-design-guidelines checklists; screenshots at 320, 390 and 1440 px, keyboard-only pass with visible focus; save to `~/agent-runs/2026-10-28-feature-003/`
- [X] T018 Re-measure with `node scripts/measure-session-performance.mjs`; compare to T001 (within 5%) and record in `specs/003-continue-unfinished-lesson/progress.md`
- [X] T019 Run browser regressions `node scripts/smoke-sidebar-ui.mjs` and `node scripts/smoke-dock-ui.mjs` (Home list and chat composer both change); record pass/fail, separating pre-existing failures
- [X] T020 Read-only check of SC-001 against the hosted record: run the same derivation over ssh on `~/learnharness/data/users/*/chats/chat_mvockf18_2ab26c99.json` (no writes) and confirm "2 of 11 topics left · next: Learning by gradient descent"
- [X] T021 Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`; record results and the final Report (what changed, how verified, what is left) in `specs/003-continue-unfinished-lesson/progress.md`

## Dependencies & execution order

- T001 first (baseline before changes).
- T002 → T003 → T004 → T005 → T006 (foundation).
- US1 (T007–T012) depends on Phase 2. T007 and T011 can be written in parallel; T008/T009 depend on T007; T010 depends on T003; T012 depends on T010 and T011.
- US2 (T013–T014) depends on Phase 2 only and can run alongside US1.
- Polish after US1 and US2.

## Parallel examples

- T002 and T006 (different test files).
- T007 and T011 (different test files), then T008/T009 alongside T010.
- T015 and T016.

## Implementation strategy

MVP is Phase 2 + US1: Lesson rows and Continue. US2 adds proof that progress tracks the lesson; it needs no extra UI.
