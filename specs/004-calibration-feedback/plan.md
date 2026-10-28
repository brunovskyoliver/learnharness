# Implementation Plan: Calibration feedback

**Branch**: `claude/fervent-bohr-l648pg` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-calibration-feedback/spec.md`

## Summary

Each chat summary (`readSummary`, the same projection that carries 002's `waiting` and 003's `progress`) gains an optional `calibration` field derived from the record's answered checks: per-level counts (answers, right) and the misses made at Certain (tool call id, question text, answered time, the message id to link to). Home aggregates these across the shared session list with a pure function and renders a "Calibration" section between "Waiting for you" and the knowledge graph: one line per used level ("Certain · 61 answers · 51 right (84%)", percent hidden under 5 answers), then "Wrong while Certain" with the newest 5 and "Show all {n}". Each miss links to `/chat/<id>#message-<messageId>`, the existing deep link that the windowed transcript already loads and scrolls to. No new request, nothing stored.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js 16 (App Router)

**Primary Dependencies**: Tailwind CSS v4, shadcn/ui on Radix (no new dependency)

**Storage**: File-backed chat records, read only. `calibration` exists only in the summary projection.

**Testing**: `npm test` (unit + static render), ESLint, `tsc`, `npm run build`, browser check on seeded data, `smoke-sidebar-ui.mjs`, `smoke-dock-ui.mjs`

**Target Platform**: Web (local and hosted), Electron desktop

**Project Type**: Web application (single Next.js project)

**Performance Goals**: No new request on Home; one linear pass per changed record, cached with the summary. Within 5% (Principle VIII).

**Constraints**: Question text only crosses the seam, never options, correct indices or explanations (FR-006); "I don't know", dismissed and ungraded answers excluded; 320/390/1440 px; hidden scrollbars; 44 px coarse targets

**Scale/Scope**: 1 new core module, store + contract edits, 1 new Home component, CSS, ~3 test files, DESIGN.md

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I Owner decides | Pass | 7 owner answers in spec Clarifications (placement, scope, revisit, line format, hidden when empty, list size, names). Technical choices in research.md. |
| II Teaching theory first | Pass | Derived at read time from the answer ledger in transcripts; nothing on graph nodes; misses are listed as the learner's history, not as a node category. Answers and explanations are not projected; the session shows them as today after the learner answered. Confidence on "I don't know" is never counted. |
| III Learner data is never lost | Pass | Read only. |
| IV Honest states | Pass | Section hidden only when there is truly no counted answer; failed list load keeps the last data (shared session list). Percent hidden under 5 answers rather than overstating. |
| V Consent before cost | Pass | No model call; links only. |
| VI Interface follows DESIGN.md | Pass with exception | New Home section in Study ink; DESIGN.md updated. Skills `shadcn`, `impeccable`, `web-design-guidelines` unavailable; manual review + screenshots at 320/390/1440 (as 001–003). |
| VII Boundaries, tenancy, sandboxing | Pass | Pure derivation in `src/core`; store calls it; tenant-scoped list as today. |
| VIII Performance does not regress | Pass (to measure) | Same harness as 003. |

**Post-design re-check**: unchanged.

## Project Structure

```text
specs/004-calibration-feedback/  plan.md research.md data-model.md quickstart.md contracts/chat-summary-calibration.md tasks.md progress.md
src/core/calibration.ts          # NEW pure: confidenceLevel(), calibrationOf(messages), mergeCalibration(chats), levelLine()
src/core/contracts/chat.ts       # ChatSummary.calibration?
src/core/index.ts                # export
src/store/chats.ts               # readSummary adds `calibration` when any answer counts
components/calibration-section.tsx  # NEW Home section (hidden when empty)
components/home.tsx              # mount between WaitingSection and the graph section
app/globals.css                  # rows reuse .waiting-row; level lines minimal CSS if needed
tests/calibration.test.ts        # NEW derivation, bucketing, exclusions, anchors, merge
tests/waiting.test.ts            # summary carries calibration; allowlist keys
tests/render-calibration-section.test.tsx  # NEW lines, percent rule, list size, Show all, hidden, links
DESIGN.md, docs/ui-review.md
```

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle VI required skills unavailable | Environment lacks the skills | Substitute checks documented; owner confirms at review |
