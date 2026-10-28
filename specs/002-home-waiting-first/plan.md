# Implementation Plan: Home leads with what's waiting

**Branch**: `claude/fervent-bohr-l648pg` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-home-waiting-first/spec.md`. Design canvas: https://claude.ai/artifact/SChjbajeREM23XcaxEGb1E

## Summary

Home becomes a scrolling page: topic composer, then "Waiting for you", then a "Knowledge graph" section holding the live graph at a fixed height (with Expand to full screen) and "Import notes" in its header. The waiting list is derived server-side in the existing chat summary projection (an allowlisted `waiting` field: kind, teaser, posted time, tool call id), shared by the sidebar and Home through one client list provider, so no new request is added. The sidebar header becomes Search (with the filter inside it) plus one "New" menu; rows get an amber dot and wrapping titles; date shelves use the title serif. The graph's display-settings popover moves into a new Graph section of the Settings dialog. Queued steers gain a remove control backed by a new `DELETE /api/chats/[id]/steer/[steerId]` route that withdraws one undelivered message from the steer registry and the live agent's steering queue. On phones, scroll-to-latest moves into a reserved band above the prompt bar. The dock smoke test is reproduced, root-caused and fixed.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js 16 (App Router)

**Primary Dependencies**: Tailwind CSS v4, shadcn/ui on Radix, Lucide, sigma.js + graphology (graph), `@earendil-works/pi-agent-core` 1.4.0 (agent steering queue)

**Storage**: File-backed chat records (read only here; no schema change). Steer registry is in memory (`src/server/jobs.ts`).

**Testing**: `npm test` (`node --test` via tsx: unit and static-render tests in `tests/`), ESLint, `tsc`, `npm run build`, browser regressions in `scripts/` (`smoke-dock-ui.mjs`, `smoke-sidebar-ui.mjs`)

**Target Platform**: Web (local and hosted), Electron desktop

**Project Type**: Web application (single Next.js project)

**Performance Goals**: Initial JS, cold sidebar readiness and startup within 5% of baseline (Principle VIII). The graph engine stays a conditional import. No extra request on Home load.

**Constraints**: No new runtime dependency; hidden scrollbars; 44 px coarse targets; 320/390/1440 px layouts; answers never reach the client before the learner answers (Principle II); hosted tenancy on the new route (Principle VII)

**Scale/Scope**: ~12 components, 1 new route, 2 server/core modules, ~10 tests, DESIGN.md

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I Owner decides | Pass | Design from the approved canvas plus 6 owner answers recorded in spec Clarifications (graph form, order, button style, removal, discarded text, graph gear). Purely technical choices are listed in research.md for review. |
| II Teaching theory first | Pass | The waiting projection is an allowlist: kind label, question/problem statement text, time, tool call id. No options' correctness, solutions, rubrics or grading cross the seam (see contracts/chat-summary-waiting.md). Answering still happens in the session's own prompt bar. |
| III Learner data is never lost | Pass | Removing a queued steer drops only that undelivered message, by the learner's explicit action. Composer drafts are untouched. Records unchanged; no golden fixture change. |
| IV Honest states | Pass | Waiting list has distinct loading/empty/failed/populated states and keeps last data on refresh failure. Cancel answers 404 (unknown), 409 (already delivered or not withdrawable) in words; the client says "Already sent" on 409. |
| V Consent before cost | Pass | No new automatic sends. Answer/Solve only navigate; cancel never starts a turn. |
| VI Interface follows DESIGN.md | Pass with exception | DESIGN.md updated (Home, sidebar, queued rows, scroll band). Exception carried from 001: the `shadcn`, `impeccable` and `web-design-guidelines` skills are not installed here; substitute is manual review against their checklists plus screenshots at 320/390/1440 px. Owner to confirm at review. |
| VII Boundaries, tenancy, sandboxing | Pass | Waiting derivation lives in `src/core` (pure); the store calls it. The cancel route is wrapped in `withTenant` like `steer`. |
| VIII Performance does not regress | Pass (to measure) | Home and sidebar share one `/api/chats` read through a lifted provider. Graph engine stays lazily loaded. Measure with `scripts/measure-session-performance.mjs` before and after. |

**Post-design re-check**: unchanged, all pass (Principle VI exception logged).

## Project Structure

### Documentation (this feature)

```text
specs/002-home-waiting-first/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── chat-summary-waiting.md
│   └── steer-cancel.md
├── checklists/requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/core/
├── waiting.ts                    # NEW pure: waitingItemOf(messages) → WaitingItem | null (allowlist)
├── contracts/chat.ts             # ChatSummary.waiting?: WaitingItem
└── index.ts                      # export
src/store/chats.ts                # readSummary adds `waiting`
src/server/jobs.ts                # cancelUserSteer(chatId, steerId)
app/api/chats/[id]/steer/[steerId]/route.ts   # NEW DELETE
components/
├── session-list.tsx              # NEW provider: the /api/chats list shared by sidebar and Home
├── sidebar.tsx                   # header (Search+filter, New menu), rows (dot, wrap), serif shelves
├── home.tsx                      # page layout: composer, WaitingSection, GraphSection
├── waiting-section.tsx           # NEW list with states, Answer/Solve
├── graph-view.tsx                # section mode (fixed height, Expand), gear and floating Import removed
├── minimal-home.tsx              # rendering-off body inside the section
├── settings/graph-section.tsx    # NEW: graph display controls (moved from graph-view)
├── settings/settings-dialog-content.tsx      # register Graph section
├── question-dock.tsx             # kind label helper moves to src/core/waiting.ts (re-export)
├── session-core.ts               # cancelSteer(id)
├── queued-steers.tsx             # remove button
└── chat.tsx                      # ?answer=<toolCallId> opens the dock; phone scroll band
scripts/smoke-dock-ui.mjs         # fix after root cause
tests/                            # waiting projection, cancel, render tests
DESIGN.md
```

**Structure Decision**: Single Next.js project. Four new files (core projection, route, two components) plus a Settings section; everything else edits existing files.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle VI required skills unavailable | Environment lacks the skills | Substitute checks are documented; owner confirms at review |
