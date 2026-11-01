# Workspace roadmap

Owner goal, 2026-10-31: evolve the app into one workspace connecting learning, documents, notes, practice and knowledge. Each row is its own Spec Kit feature, built in this order, extending the existing systems. Status is recorded separately for implementation, commit, merge and deployment.

| # | Feature | Depends on | Status |
| --- | --- | --- | --- |
| 011 | Library folders: nested folders, breadcrumbs, move, pages and uploads together | 009 | Implemented on `feat/011-library-folders`, not merged or deployed |
| 012 | Library organization: tags, favorites, pins, recent, archive, recoverable trash | 011 | Implemented on `feat/012-library-organization`, not merged or deployed |
| 013 | Library views: sorting, filters, list/grid, bulk actions, context menus, drag and drop | 011, 012 | Implemented on `feat/012-library-organization`, not merged or deployed |
| 014 | Workspace navigation: unified sidebar, tabs, contextual right pane, resizable panels | 013 | Implemented on `feat/014-workspace-navigation`, not merged or deployed |
| 015 | Command palette and keyboard shortcuts | 014 | Implemented on `feat/014-workspace-navigation`, not merged or deployed |
| 016 | Note links: wiki links, backlinks, related notes, callouts, collapsible sections | 014 | Implemented on `feat/016-intelligent-notes`, not merged or deployed |
| 017 | Study notes from lessons: saved passages with source references, lesson to notes | 016 | Implemented on `feat/016-intelligent-notes`, not merged or deployed |
| 018 | Contextual AI note actions with review before any edit lands | 016 | Implemented on `feat/016-intelligent-notes`, not merged or deployed |
| 019 | Full-text search: deterministic index, snippets, filters, jump to passage | 016 | Implemented on `feat/019-document-intelligence`, not merged or deployed |
| 020 | PDF reader: selections, highlights, annotations, page citations, extract to notes | 019 | Implemented on `feat/019-document-intelligence`, not merged or deployed |
| 021 | Flashcards and FSRS review queue, separate from graph evidence | 017, 020 | Not started |
| 022 | Diagrams: editable maps and whiteboards, proposed AI changes | 016 | Not started |
| 023 | Integration polish: Electron and hosted verification across the slices | all | Not started |

## Dependency decisions to make with the owner

The constitution requires owner approval and a measured startup cost for each new runtime dependency.

| Candidate | Decide in | Starting position |
| --- | --- | --- |
| dnd-kit | 013 | Decided, not adopted: native drag events plus the "Move to…" dialog cover mouse, keyboard and touch with no new dependency |
| cmdk | 015 | Decided, not adopted: Radix dialog plus `src/core/fuzzy.ts` |
| ts-fsrs | 021 | Likely worthwhile: the scheduler is easy to get subtly wrong |
| Excalidraw | 022 | Compare with installed React Flow; Excalidraw is heavy |
| Playwright | 023 | Browser regressions already run on puppeteer-core in `scripts/`; a second driver needs a reason |

## Standing rules for the remaining features

The owner approved every recommended option ("i approve it all", 2026-10-31) and asked for no questions during this goal. Record each decision in the feature's spec under Clarifications instead of asking.

- Decided dependencies: `ts-fsrs` adopted for 021, server-only. No `cmdk` (Radix dialog plus `src/core/fuzzy.ts`). No Playwright (`puppeteer-core` already drives `scripts/check-*-ui.mjs`). React Flow for 022, no Excalidraw; `@xyflow/react` is installed and loads on demand. Anything else new needs a recorded reason and a measured cost, and goes in the feature's Report for the owner.
- Catalog and other stores stay additive and rollback-safe: optional fields, separate files, the version unchanged. Learner text is never changed by AI without review.
- Each feature keeps `specs/<NNN-name>/spec.md`, `plan.md` with the Constitution Check I-VIII, `tasks.md` and `progress.md` with a Report, and updates DESIGN.md, PRODUCT.md and this table.
- Stacked branches, one per feature, each branched from the previous. No pushing, merging or deploying.

## Open gaps carried to 023

- Feature 018: AI edits to learner text are reviewed after the version lands (the 010 review bar and Undo). The owner's goal asks for review before. 023 adds a held proposal for learner-triggered AI edits.
- Feature 020: selecting PDF text has no built-in keyboard path (constitution VI). See specs/019-document-intelligence/plan.md, Known limits.
- `scripts/build-server.mjs` refuses a standalone with a `data/` folder, and any build from a repo with a real `data/` hits this, because the middleware's trace sweeps it in. It predates 019 (checked on `fff3418`). `.dockerignore` keeps `data/` out of Docker builds; a desktop build from a machine with real data is refused rather than shipped.
- Constitution VI UI skill checks (`impeccable`, `web-design-guidelines`) to run across 011-022.
