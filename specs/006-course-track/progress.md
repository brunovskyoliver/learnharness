# Progress: 006 Course track

## Stage

Implemented 2026-10-28. Not committed, pushed or deployed.

## Decisions

- Spec Clarifications (7 owner answers); research R1–R4; plan and wording approved 2026-10-28.
- Agent decisions (reversible): the `course` tool part renders nothing in the transcript (like `plan_*`); with a syllabus the popup diagram is 60vh (min 280px) and the popup scrolls; state wording "Covered" / "Not yet" / "Not in this lesson's plan" from research R4.

## Log

- 2026-10-28: spec, clarify, plan.
- Analyze (inline): FR-001/002/003 T002–T006; FR-004 T002/T003; FR-005 T007–T008; FR-006 T009–T010; FR-007 T007; FR-008 T012; SC-001 T012; SC-002 T007/T012; SC-003 T013; gates T013/T014. No critical findings.
- T001: baseline = 005 final (same build).
- T002–T004: `src/core/course.ts` (schema, `courseInputProblems`, `latestCourseLh`/`latestCourseView`, `courseCoverage`, `courseCountsOf`); `ChatSummary.course` set in `readSummary`. Tests: `tests/course.test.ts` (5), `tests/waiting.test.ts` (+1, exact keys).
- T005–T006: `src/agent/tools/course.ts` registered for the teacher; approved description and the "A course as the goal" doctrine section; pinned teacher lists updated. Tests: `tests/course-tool.test.ts` (3).
- T007–T008: `components/course-list.tsx` mounted below the diagram in `PlanPopup`. Tests: `tests/render-course-list.test.tsx` (2).
- T009–T010: `progressLine(progress, course)`; tests in `tests/render-waiting-section.test.tsx` (+2).
- T011: DESIGN.md (new "Course track" section), docs/ui-review.md.
- T012: browser check (production build, isolated data with a lesson modeled on the hosted CS229 lesson: same 11-topic plan, checks through classification and back to training, a 5-item syllabus; `check-course.mjs`, log `check-course.log`): Home row "2 of 11 topics left · next: Learning by gradient descent · Course: 3 of 5 covered"; popup states not-in-plan / covered ×3 / not-covered, matching the checks; three links with target _blank and rel noopener noreferrer; no overflow at 1440/390/320. Screenshots `shots/plan-course-{1440,390,320}.png`.
- T013: performance (baseline = 005 final), medians: JS 707,430 → 712,593 B (+0.73%); API unchanged; ready 703 → 726 ms (+3.3%); FCP 72 → 80 ms. Within 5%; the JS growth is the Course list in the plan popup chunk graph. Smokes: sidebar 8 PASS; demo-runtime exit 0; dock 20 PASS then the known pre-existing assertion.
- T014: `npm test` 2631/2631; typecheck, lint, build pass.

## Report

**What changed**
- Teacher tool `course` records a course syllabus mapped onto the plan (validated against the saved tree); the latest successful call is the syllabus.
- Plan popup: "Course" section below the diagram with per-item kind, link, mapped topics and derived state. Home: lesson rows append "Course: n of m covered".
- Doctrine: "A course as the goal" in the planning prompt.

**How it was verified**
- 13 new tests, full suite, typecheck, lint, build, browser check with screenshots, performance, smokes.

**What is left**
- Live check with a real model: a course-goal lesson where the teacher researches and records the syllabus (model call; after deploy or locally).
- Not committed, pushed or deployed.
