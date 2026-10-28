# Tasks: Course track

**Input**: `specs/006-course-track/` plan.md, spec.md, research.md, data-model.md, quickstart.md

## Phase 1: Setup
- [X] T001 Performance baseline (reuse 005 final: same build) in `~/agent-runs/2026-10-28-feature-006/`

## Phase 2: Foundational
- [X] T002 [P] Failing tests `tests/course.test.ts`: `courseInputProblems` (no plan; 0 items; >100; unknown topic slug; non-http link); `latestCourseLh` (latest successful call wins; errored call ignored); `courseCoverage` (covered when every mapped topic in the plan is checked; topic removed by a rewrite stops counting; empty/stale mapping → not-in-plan); `courseCounts`
- [X] T003 Implement `src/core/course.ts`; export from `src/core/index.ts`
- [X] T004 `ChatSummary.course?: { covered; items }`; `readSummary` sets it for lessons with a syllabus; test in `tests/waiting.test.ts` (exact keys)

## Phase 3: US3 — teacher records the syllabus (P1)
- [X] T005 [P] Failing tests `tests/course-tool.test.ts`: valid call → "Course recorded: {n} items." and details `{ ok: true, course }`; problems → invalid-input result; no saved plan → invalid-input result
- [X] T006 Implement `src/agent/tools/course.ts` (approved description), register in the teacher registry, update pinned registry lists; add the approved "A course as the goal" section to `prompts/teacher/10-planning.md`

## Phase 4: US1 — course in the plan popup (P1)
- [X] T007 [P] Failing render tests `tests/render-course-list.test.tsx`: heading "Course", course title link, items in order with kind label, title link (target _blank, rel noopener noreferrer), topic titles, state text ("Covered", "Not yet", "Not in this lesson's plan"); nothing without a syllabus
- [X] T008 Implement `components/course-list.tsx` (`latestCourseView` over view messages) and mount it below the diagram in `PlanPopup` (popup scrolls; diagram keeps ≥ 60vh when the course shows)

## Phase 5: US2 — Home line (P2)
- [X] T009 [P] Extend `tests/render-waiting-section.test.tsx`: progress line ends " · Course: 3 of 25 covered" when `course` is present (Lesson and merged rows)
- [X] T010 Implement in `components/waiting-section.tsx`

## Phase 6: Polish
- [X] T011 DESIGN.md, docs/ui-review.md
- [X] T012 Browser check: review lesson modeled on hosted CS229 (plan + course call) → popup section and Home line; 320/390/1440; manual review
- [X] T013 perf final vs T001; smokes (sidebar, dock, demo-runtime)
- [X] T014 `npm test`, lint, typecheck, build; Report in progress.md
