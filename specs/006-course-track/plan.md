# Implementation Plan: Course track

**Branch**: `claude/fervent-bohr-l648pg` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

## Summary

A teacher tool `course` records a lesson's syllabus as its call arguments: course title and link, then ordered items (title, kind, link, plan topic slugs). Like the plan (the latest `plan_init` call), the syllabus is the latest successful `course` call in the transcript: append-only, no new record field, a re-call replaces it. The tool validates against the saved plan tree (topics must exist, ≥ 1 item, ≤ 100 items, kinds from the fixed list). Coverage is derived at read time with the plan view's status rule: an item is covered when every mapped topic still in the plan has had a check; with no such topic it is "not in this lesson's plan". The plan popup shows a "Course" section below the diagram; the chat summary gains `course: { covered, items }` (counts only) which Home appends to the lesson's progress line.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js 16 · **Dependencies**: none new · **Storage**: transcript (tool call arguments); summary projection adds counts · **Testing**: unit (coverage derivation, validation), tool tests, render tests for the popup section and Home line, browser check, smokes, perf

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I Owner decides | Pass (pending wording) | 7 owner answers; tool and doctrine wording below need approval. |
| II Teaching theory first | Pass | The plan stays the minimal tree ("a map, not a syllabus"); the syllabus is a separate list mapped onto it. Coverage derived, never stored. |
| III Learner data is never lost | Pass | Append-only; earlier syllabi stay in the transcript. |
| IV Honest states | Pass | Invalid calls return problems; items outside the plan say so instead of a false 0%. |
| V Consent before cost | Pass | No new automatic calls; links never fetched. |
| VI DESIGN.md | Pass with exception | Popup section and Home line per DESIGN.md; skills unavailable → manual review + screenshots. |
| VII Boundaries | Pass | Pure derivation in `src/core`; tool reads the saved tree through the chat store as plan tools do; links rendered with `rel="noopener noreferrer"`, `target="_blank"`. |
| VIII Performance | Pass (to measure) | Popup code loads with the popup; Home adds a few bytes per lesson. |

## Project Structure

```text
src/core/course.ts              # NEW pure: CourseInputSchema, courseInputProblems(input, tree), latestCourse(messages), courseCoverage(course, tree, messages), courseCounts(...)
src/core/contracts/chat.ts      # ChatSummary.course?: { covered: number; items: number }
src/store/chats.ts              # readSummary adds `course` for lessons with a syllabus
src/agent/tools/course.ts       # NEW teacher tool (validates against the saved tree)
src/agent/tools.ts              # teacher registry adds course
src/agent/prompts/teacher/10-planning.md   # "A course as the goal" (wording below)
components/plan-block.tsx (PlanPopup)      # Course section below the diagram (new components/course-list.tsx)
components/waiting-section.tsx  # progressLine appends " · Course: c of n covered"
tests/course.test.ts, tests/course-tool.test.ts, tests/render-course-list.test.tsx, tests/render-waiting-section.test.tsx (+), tests/waiting.test.ts (+)
DESIGN.md, docs/ui-review.md
```

## Proposed wording (needs approval)

**Tool description (`course`)**:
> Record the syllabus of the course the learner is following, mapped onto your plan: the course title and link, then every lecture, problem set, notes or reading in course order, each with its link when known and the plan topics (node slugs from `plan_init`) that cover it. Give items the plan does not cover an empty `topics` list. A new call replaces the whole syllabus. Call it after `plan_init`, once you know the course's materials (research them if you need to); never invent links.

**Teacher, `10-planning.md`, new section at the end**:
> ## A course as the goal
>
> When the learner's goal is a specific course (a lecture series, a class, a textbook), find its syllabus — lectures, problem sets, notes, readings, with links — through research, and record it with `course` once the plan is written. The plan stays the minimal tree to his goal; the syllabus is a separate list mapped onto it, so he can see which parts of the course the lesson has covered. When you rewrite the plan, re-call `course` so its mapping matches.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle VI skills unavailable | Environment | Substitute review documented |
