# Implementation Plan: Study ink visual system and prompt bar

**Branch**: `claude/quirky-babbage-9zc43l` | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-study-ink-prompt-bar/spec.md`

## Summary

Replace the T3 Code black theme with Study ink tokens in `app/globals.css` (surfaces, three inks, amber accent, type scale, three radii, Newsreader title face), then sweep app-owned components for opacity text greys, shadows, blur, side and dashed borders, off-scale sizes and stray radii. Rebuild the prompt bar as four zones shared by `Composer`, `QuestionDock` and `PracticeDock` inside the existing `DockFooter` shell, moving setup prompts into the toolbar and giving every primary action a verb label. Fix the audit's transcript issues (user turn and thinking rows on the reading edge, running-head phase labels, one-row demo stand-in, turn rail threshold). Amend the constitution to 1.1.0 and rewrite DESIGN.md's theme section.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js 16 (App Router)

**Primary Dependencies**: Tailwind CSS v4, shadcn/ui on Radix, Lucide, Streamdown, `next/font` (Google and local)

**Storage**: N/A (no data changes; appearance settings schema unchanged)

**Testing**: `node --test` via tsx (static-render tests in `tests/*.test.tsx`), ESLint, `tsc`, Playwright browser regressions in `scripts/`

**Target Platform**: Web (local and hosted), Electron desktop

**Project Type**: Web application (single Next.js project)

**Performance Goals**: Startup, initial JS and cold sidebar readiness within 5% of baseline (Principle VIII)

**Constraints**: No new runtime npm dependency (Newsreader comes through the existing `next/font/google`); hidden scrollbars; 44 px coarse targets; 320/390/1440 px layouts

**Scale/Scope**: ~1 stylesheet, ~25 components, ~15 render tests, 3 docs

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I Owner decides | Pass | All design decisions come from the 2026-10-27 owner answers recorded in spec Clarifications. Owner later asked for the full cycle without questions; remaining technical choices are logged in `research.md` and `progress.md` Decisions for review. |
| II Teaching theory first | Pass | No change to question mechanics, grading, confidence or practice flow. Skip reuses the existing dismiss path; correct answers still never reach the client early. |
| III Learner data is never lost | Pass | Drafts and selections keep their `useSessionState` owners; the four-zone layout moves markup only. Skip goes through the existing confirmation and dismissal record. |
| IV Honest states | Pass | "—" placeholders are replaced by plain words; usage shows "?" when the limit is unknown; setup states stay explicit. |
| V Consent before cost | Pass | No new automatic sends. Skip and Next problem stay explicit clicks. |
| VI Interface follows DESIGN.md | Pass with exception | DESIGN.md is updated in this feature to the Study ink rules before code is considered done. Exception: the `shadcn`, `impeccable` and `web-design-guidelines` skills are not installed in this environment; substitute = manual review against their published checklists, automated contrast checks and Playwright screenshots at 320/390/1440 px. Owner to confirm at review. |
| VII Boundaries, tenancy, sandboxing | Pass | UI-only; demo sandbox untouched; theme tokens flow through the existing bridge. |
| VIII Performance does not regress | Pass (measured) | Newsreader loads with `preload: false` and `display: swap`; legacy CMU file is dropped. Measure with `scripts/measure-session-performance.mjs` before and after; baseline TODO noted. |

Governance: the constitution's theme line conflicts with this feature; the owner approved amending it to 1.1.0 inside this feature (spec FR-026).

**Post-design re-check**: unchanged, all pass (Principle VI exception logged).

## Project Structure

### Documentation (this feature)

```text
specs/001-study-ink-prompt-bar/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/prompt-bar.md
├── progress.md
└── tasks.md
```

### Source Code (repository root)

```text
app/
├── globals.css                 # tokens, type scale, radii, prompt bar classes
└── fonts.ts                    # Newsreader replaces the CMU title face
components/
├── settings/appearance-vars.ts # --font-title follows only an explicit reading font
├── composer.tsx                # chat zones, verb-labelled actions
├── prompt-controls.tsx         # PromptToolbar setup slot, PrimaryAction
├── stats-bar.tsx               # setup slot, usage percentage
├── model-picker.tsx            # labelled triggers, no "—"
├── question-dock.tsx           # turn strip, body, confidence row, answer well
├── practice-dock.tsx           # turn strip, Skip, Submit
├── queued-steers.tsx           # removable rows
├── chat.tsx                    # DockFooter wiring, setup into toolbar, user turn, rail
├── thinking-block.tsx, md-blocks.tsx, phase-divider.tsx, session-turn-rail.tsx
└── (sweep) ui/*, sidebar, settings, chain-table, plan-block, graph-view …
tests/                          # render tests updated where they pin retired visuals
DESIGN.md, PRODUCT.md, docs/ui-review.md, .specify/memory/constitution.md
```

**Structure Decision**: Single Next.js project; all changes are in existing files. No new components except small shared pieces inside `prompt-controls.tsx` (turn strip, answer well).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle VI required skills unavailable | Environment lacks the skills | Waiting would block the owner-requested unattended run; substitute checks are documented |
