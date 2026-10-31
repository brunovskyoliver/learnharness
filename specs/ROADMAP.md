# Workspace roadmap

Owner goal, 2026-10-31: evolve the app into one workspace connecting learning, documents, notes, practice and knowledge. Each row is its own Spec Kit feature, built in this order, extending the existing systems. Status is recorded separately for implementation, commit, merge and deployment.

| # | Feature | Depends on | Status |
| --- | --- | --- | --- |
| 011 | Library folders: nested folders, breadcrumbs, move, pages and uploads together | 009 | Implemented on `feat/011-library-folders`, not merged or deployed |
| 012 | Library organization: tags, favorites, pins, recent, archive, recoverable trash | 011 | Not started |
| 013 | Library views: sorting, filters, list/grid, bulk actions, context menus, drag and drop | 011, 012 | Not started |
| 014 | Workspace navigation: unified sidebar, tabs, contextual right pane, resizable panels | 013 | Not started |
| 015 | Command palette and keyboard shortcuts | 014 | Not started |
| 016 | Note links: wiki links, backlinks, related notes, callouts, collapsible sections | 014 | Not started |
| 017 | Study notes from lessons: saved passages with source references, lesson to notes | 016 | Not started |
| 018 | Contextual AI note actions with review before any edit lands | 016 | Not started |
| 019 | Full-text search: deterministic index, snippets, filters, jump to passage | 016 | Not started |
| 020 | PDF reader: selections, highlights, annotations, page citations, extract to notes | 019 | Not started |
| 021 | Flashcards and FSRS review queue, separate from graph evidence | 017, 020 | Not started |
| 022 | Diagrams: editable maps and whiteboards, proposed AI changes | 016 | Not started |
| 023 | Integration polish: Electron and hosted verification across the slices | all | Not started |

## Dependency decisions to make with the owner

The constitution requires owner approval and a measured startup cost for each new runtime dependency.

| Candidate | Decide in | Starting position |
| --- | --- | --- |
| dnd-kit | 013 | Compare with native drag and a keyboard "Move to" dialog |
| cmdk | 015 | Compare with the existing Radix dialog and `src/core/fuzzy.ts` |
| ts-fsrs | 021 | Likely worthwhile: the scheduler is easy to get subtly wrong |
| Excalidraw | 022 | Compare with installed React Flow; Excalidraw is heavy |
| Playwright | 023 | Browser regressions already run on puppeteer-core in `scripts/`; a second driver needs a reason |
