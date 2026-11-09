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
| 021 | Flashcards and FSRS review queue, separate from graph evidence | 017, 020 | Implemented on `feat/021-spaced-repetition`, not merged or deployed |
| 022 | Diagrams: editable maps and whiteboards, proposed AI changes | 016 | Implemented on `feat/022-diagrams`, not merged or deployed |
| 023 | Integration polish: held AI edits, PDF keyboard path, Electron and hosted verification across the slices | all | Implemented on `feat/023-integration-polish`, not merged or deployed |
| 024 | Instant loads: PDF by versioned chunks, plot libraries fetched once by the page, light plotly build, code highlighter on demand, cold-load transcript kept | none | Implemented on `main`, not merged or deployed |
| 024 | Notebook mode: a Riddled-style writing page with margin threads, automatic reads, sketches, note chat, export; Study unchanged | 016, 021, 023 | Implemented on `notebook-mode` and verified against a real model (T047, 2026-11-07, verification-only codex engine); not merged or deployed |
| 025 | Unified redesign: one paper design system for both modes (Notebook's tokens, fonts, chrome, overlay sidebar, settings modal; checks as margin threads); Study ink removed | 024 | Implemented on `unified-redesign`, verified against a real model with the codex-verify switch (T063, 2026-11-08); not merged or deployed |
| 026 | Library git sync: link an HTTPS git repo as a read-only, auto-pulled Library folder (isomorphic-git, token per link) | 009, 011, 019, 020, 025 | Done: implemented and committed on `unified-redesign` (2026-11-08); live check against a local fixture repo only (no private repo provided); not merged or deployed |
| 027 | Reference chips: Library references drawn as chips in the composer, sent messages and tutor replies; a chip opens the Library full view at the passage, with a Back pill to the same message | 009, 019, 020, 025, 026 | Done: implemented and committed on `unified-redesign` (2026-11-08); real-model check with the codex-verify switch (a tutor Library link drawn as a chip, opened with the Back pill); not merged or deployed |
| 028 | Motion: one paper motion language (draw, ink in, unfold, blot, lift) across both modes; a once-per-tab signature, view-transition routes and mode switch with still chrome, layer, list and small-part motion, the ink soak for theme changes, reduced motion as ≤150ms fades | 024, 025, 027 | Done: implemented and committed on `unified-redesign` (2026-11-09); production frames, throttled profile and Electron headless checks in `~/agent-runs/2026-11-09-motion/`; owner-veto items in specs/028-motion/progress.md; not merged or deployed |

## Dependency decisions to make with the owner

The constitution requires owner approval and a measured startup cost for each new runtime dependency.

| Candidate | Decide in | Starting position |
| --- | --- | --- |
| dnd-kit | 013 | Decided, not adopted: native drag events plus the "Move to…" dialog cover mouse, keyboard and touch with no new dependency |
| cmdk | 015 | Decided, not adopted: Radix dialog plus `src/core/fuzzy.ts` |
| ts-fsrs | 021 | Decided, adopted: 6.0.0 exact-pinned, server only, behind a core port |
| Excalidraw | 022 | Decided, not adopted: 2.54 MB gzipped against React Flow's 59 KB, measured in specs/022-diagrams/spec.md |
| Playwright | 023 | Decided, not adopted: puppeteer-core and plain CDP covered everything 023 needed |
| plotly.js | 024 | Decided, adopted: 4.1.2 devDependency, build-time only, for `public/demo-kit/plotly-light.js` (583 KB gzip against the full build's 1456 KB) |
| Playwright | 024 | Decided, adopted for tests only (owner asked in 024's goal): @playwright/test exact-pinned dev dependency, system Chromium, no browser download |

## Standing rules for the remaining features

The owner approved every recommended option ("i approve it all", 2026-10-31) and asked for no questions during this goal. Record each decision in the feature's spec under Clarifications instead of asking.

- Decided dependencies: `ts-fsrs` adopted for 021, server-only. No `cmdk` (Radix dialog plus `src/core/fuzzy.ts`). No Playwright for 011-023 (`puppeteer-core` already drives `scripts/check-*-ui.mjs`); 024 adopts it for tests only (table above). React Flow for 022, no Excalidraw; `@xyflow/react` is installed and loads on demand. Anything else new needs a recorded reason and a measured cost, and goes in the feature's Report for the owner.
- Catalog and other stores stay additive and rollback-safe: optional fields, separate files, the version unchanged. Learner text is never changed by AI without review.
- Each feature keeps `specs/<NNN-name>/spec.md`, `plan.md` with the Constitution Check I-VIII, `tasks.md` and `progress.md` with a Report, and updates DESIGN.md, PRODUCT.md and this table.
- Stacked branches, one per feature, each branched from the previous. No pushing, merging or deploying.

## Open gaps after 023

Every owner-facing decision and open question is in [docs/workspace-decisions.md](../docs/workspace-decisions.md).

- Constitution II still names an "event ledger" that was removed on 2026-09-27.
- Feature 022: an approval from a transcript row while the same diagram is open with unsaved changes shows the conflict line rather than following; nothing is lost. Feature 023's held page edits have the same limit from outside the page's own line.
- Cards aren't in the palette or the Links panel beyond the page's Make flashcards door. Held edits aren't in Home's "Waiting for you".
- `impeccable` and `web-design-guidelines` ran over 019-023's new surfaces only; 011-018 remain owed. See specs/023-integration-polish/progress.md.
