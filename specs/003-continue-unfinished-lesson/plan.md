# Implementation Plan: Continue an unfinished lesson from Home

**Branch**: `claude/fervent-bohr-l648pg` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-continue-unfinished-lesson/spec.md`

## Summary

The chat summary projection (`src/store/chats.ts` `readSummary`, already the source of feature 002's `waiting`) gains an optional `progress` field for teaching sessions whose plan has unfinished topics: total, left and the next topic's title. It is derived from the record's `tree` and transcript with the plan view's own status derivation, so Home and the plan view never disagree. "Waiting for you" renders two row shapes from the one shared session list: the existing Answer/Solve rows (now with a progress line when the lesson has one), then "Lesson" rows with a Continue link to `/chat/<id>?continue=1`. On that URL the session page computes the draft text server-side ("Continue with {next topic}"); the client places it in the composer only if the composer is empty, scrolls to the bottom, and drops the one-shot parameter. Nothing is sent.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js 16 (App Router)

**Primary Dependencies**: Tailwind CSS v4, shadcn/ui on Radix (no new dependency)

**Storage**: File-backed chat records, read only. No schema change; `progress` exists only in the summary projection.

**Testing**: `npm test` (`node --test` via tsx: unit + static render), ESLint, `tsc`, `npm run build`, browser smoke `scripts/smoke-sidebar-ui.mjs`-style check for Home with review data

**Target Platform**: Web (local and hosted), Electron desktop

**Project Type**: Web application (single Next.js project)

**Performance Goals**: No new request on Home (the progress rides the existing `/api/chats` list). Summary derivation is one linear pass per changed record, cached by file stamp like `waiting`. Startup within 5% (Principle VIII).

**Constraints**: Plan topic titles only cross the seam, never question content (FR-007); no automatic send (Principle V); a composer draft is never replaced (Principle III); 320/390/1440 px; hidden scrollbars; 44 px coarse targets

**Scale/Scope**: 1 new core module, 4 edited files in store/page/components, CSS for one grid area, ~4 test files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I Owner decides | Pass | Seven owner answers in spec Clarifications (placement, resume behaviour, merged rows, no hide, current counts as left, draft kept, one count). The progress-line wording "{n} of {total} topics left · next: {topic}", the kind label "Lesson", the button label "Continue" and the draft "Continue with {topic}" came from the options Oliver chose. Technical choices are in research.md for review. |
| II Teaching theory first | Pass | Progress is derived at read time from transcript + plan (no stored mastery, nothing on graph nodes). Only plan topic titles are projected; no question text, options, answers or explanations. |
| III Learner data is never lost | Pass | The draft is inserted only into an empty composer; an existing draft is untouched. Records are not written. |
| IV Honest states | Pass | Reuses 002's loading/empty/failed/populated states and last-good-list behaviour. Lessons without a plan show no row rather than a guessed count. |
| V Consent before cost | Pass | Continue navigates and fills the composer; sending is the learner's click. |
| VI Interface follows DESIGN.md | Pass with exception | New row shape follows 002's waiting row (quiet button, amber only on the kind label). DESIGN.md gains the Lesson row and the progress line. Exception carried from 001/002: `shadcn`, `impeccable` and `web-design-guidelines` skills are not installed; substitute is manual review against their checklists plus screenshots at 320/390/1440 px. |
| VII Boundaries, tenancy, sandboxing | Pass | Derivation is pure in `src/core`; the store calls it; the page reads the tenant-scoped record through `withTenantPage` as today. |
| VIII Performance does not regress | Pass (to measure) | No new request or client library. Measure Home with `scripts/measure-session-performance.mjs` before and after. |

**Post-design re-check**: unchanged, all pass (Principle VI exception logged).

## Project Structure

### Documentation (this feature)

```text
specs/003-continue-unfinished-lesson/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── chat-summary-progress.md
│   └── continue-param.md
├── checklists/requirements.md
├── progress.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
src/core/
├── lesson-progress.ts        # NEW pure: lessonProgressOf(tree, messages) → LessonProgress | null; continueDraft(progress)
├── contracts/chat.ts         # ChatSummary.progress?: LessonProgress
└── index.ts                  # export
src/store/chats.ts            # readSummary adds `progress` for teaching sessions
app/(app)/chat/[id]/page.tsx  # reads ?continue=1, passes initialContinueDraft
components/
├── waiting-section.tsx       # continueSessions(); LessonRow; progress line on WaitingRow; one count
├── chat.tsx                  # initialContinueDraft: fill empty composer, jump to bottom, clear param
└── (globals.css)             # .waiting-row progress grid area
tests/
├── lesson-progress.test.ts   # NEW derivation + draft text
├── waiting.test.ts           # summary carries progress; practice never does
├── waiting-section.test.tsx  # ordering, count, merged row, Lesson row, states
└── chat-continue.test.ts     # empty composer gets draft; existing draft kept
DESIGN.md                     # Lesson row + progress line
```

**Structure Decision**: Single Next.js project. One new core module; everything else edits the files feature 002 introduced.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle VI required skills unavailable | Environment lacks the skills | Substitute checks documented; owner confirms at review |
