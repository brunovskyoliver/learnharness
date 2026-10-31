# Implementation Plan: Page editor tools

**Branch**: `claude/notes-editing-quality-review-wj8e49` | **Date**: 2026-10-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/010-page-editor-tools/spec.md`

## Summary

The feature 009 page editor gains:
- a formatting toolbar, Ctrl K links, table controls, a slash menu and a placeholder;
- a selection bubble whose tutor actions send to the chat beside the page, or to a new session from the Library;
- highlighted tutor changes with block-level undo, kept until Done or close;
- History comparison and version names;
- an outline, a word count and export;
- images uploaded as Library items.

Everything is built from TipTap pieces already installed, ProseMirror decorations and pure Markdown block functions, so stored bytes change only where the learner edits (research R1–R8).

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js 16.3.2.

**Primary Dependencies**: no new ones. Reused:
- TipTap 3.32.2: `@tiptap/react/menus` BubbleMenu, TableKit and StarterKit.
- `@floating-ui/dom`, already installed through `@tiptap/react`.
- The 009 page codec, `ChatActionsContext`, the Library upload and content routes.

**Storage**: two small files per page, `names.json` and `seen.json` ([data-model.md](data-model.md)). `versions.jsonl` stays append-only.

**Testing**: `node:test` through `tsx`, plus `scripts/check-library-ui.mjs` (`checkEditorTools`) in Chromium at 1440, 390 and 320 px. No model calls; tutor revisions are seeded through the store.

**Target Platform**: hosted and desktop (Electron), as in 009.

**Project Type**: web application with a file-backed server.

**Performance Goals**: all new UI code loads only in the page-editor chunk. Startup and the first page open stay within 5% of baseline (constitution VIII).

**Constraints**:
- Untouched blocks keep their bytes (SC-002).
- Hidden scrollbars; 44 px coarse targets; keyboard access everywhere.
- Comparison capped at 4,000 blocks.

**Scale/Scope**: pages up to 1 MiB (009 limit).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I Owner decides | Scope, tutor actions, images, undo, Library-view sessions, when highlights clear and the slash-menu cut were decided by the owner (spec Clarifications). Strings in contracts/ui-contract.md await approval with this plan. | Pass once the plan is approved |
| II Teaching theory | Quiz me goes through the chat's graded check. Tutor actions are refused while a question waits or a problem is active, and never dismiss a waiting question. No answer is written into a page (practice question cut). | Pass |
| III Data never lost | Undo is a new version; highlights and placeholder are decorations, never stored; actions commit unsent text before sending; names and seen state live in side files, and the log stays append-only. | Pass |
| IV Honest states | Unavailable actions say why; skipped undo blocks are counted; upload progress and refusals are shown. | Pass |
| V Consent before cost | Every model call follows an explicit click. The Library-view path runs Home's keys checks before creating a session. | Pass |
| VI DESIGN.md | Study ink tokens, one accent, no gradients, shadows or side rules, hidden scrollbars. DESIGN.md gains a "Page editor tools" section. Checked with shadcn, impeccable and web-design-guidelines before done. | Pass |
| VII Boundaries and tenancy | New routes use `withTenant`; image links point at tenant-scoped content; SVG is refused. | Pass |
| VIII Performance | No new dependency. Code goes in the existing dynamic editor chunk, measured as in 009 (T003 and T056a). | Pass |

## Project Structure

### Documentation (this feature)

```text
specs/010-page-editor-tools/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/ (ui-contract.md, api.md)
└── tasks.md            (/speckit-tasks)
```

### Source Code (repository root)

```text
components/library/
├── page-editor.tsx          toolbar, bubble, slash menu, placeholder, decorations, paste and drop
├── page-toolbar.tsx         new: toolbar, text style menu, table controls, link popover
├── page-slash.ts            new: slash trigger plugin and filter (pure parts testable)
├── page-blocks.ts           new: block split, compare, revertTutorChanges, word count, outline
├── page-tutor-actions.ts    new: message texts, blocked reasons, send and fill paths
├── page-changes.tsx         new: tutor change bar and decorations state
├── page-history.tsx         Changes and Full text, names, Copy
├── page-pane.tsx            header: words, Outline, Export; wiring
├── page-export.ts           new: copy, download, print root
├── upload.ts                sendFile returns the item
components/chat.tsx          ChatActionsContext: fillComposer, blockedReason, busy
src/core/library.ts          PageVersion.name, cause "undo-agent"
src/store/library.ts         names.json, seen.json
src/server/library.ts        name, seen routes; listPageVersions with names
app/api/library/pages/[id]/versions/[n]/route.ts   PATCH
app/api/library/pages/[id]/seen/route.ts           GET, PUT (new)
app/globals.css              toolbar, bubble, menus, highlights, print
DESIGN.md                    Page editor tools section
tests/                       page-blocks, page-tools-ui, page-names-seen, page-tutor-messages
scripts/check-library-ui.mjs checkEditorTools
```

**Structure Decision**: the existing single Next.js app. New editor code sits beside the 009 page files under `components/library/`.

## Delivery order

Each step ships on its own, with its tests.

1. **US1, formatting.** Toolbar, link popover, table controls, slash menu and placeholder.
2. **US2, tutor actions.** Bubble, context additions and the Library-view path.
3. **US3, tutor changes.** Seen routes, compare, decorations and undo.
4. **US4, History.** Comparison and names.
5. **US5, outline, word count and export.**
6. **US6, images.**

## Complexity Tracking

None.
