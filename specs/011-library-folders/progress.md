# Feature 011: Library folders
Stage: done
Updated: 2026-10-31

## Decisions
- Split the owner's goal into features 011-023 (specs/ROADMAP.md), pending owner confirmation.
- Folder URL is `/library?folder=<id>`: reversible and technical.

## Log
- 2026-10-31 specify: drafted spec after reading store, refs, tools and UI of feature 009.

## Report
- 2026-10-31 implement: store, API, UI and tests. `tests/library-*`, `render-library`: pass. `scripts/check-library-folders-ui.mjs`: pass at 1440, 390, 320. tsc and eslint clean.
- Decision: owner approved every recommendation ("i approve it all"); no further questions during this goal. Non-empty folder delete refused until 012.
