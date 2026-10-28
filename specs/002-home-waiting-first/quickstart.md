# Quickstart: validating feature 002

Prerequisites: `npm ci`; Chromium for the browser regressions (see `scripts/smoke-dock-ui.mjs` header for `CHROME_PATH` / `LH_BROWSER_URL`).

1. Gates: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
2. Review data: `npm run dev:review`, then open Home.
   - Composer first, then "Waiting for you" with one row per pending check/problem, newest first, quiet Answer/Solve buttons, amber kind label only.
   - Answer opens the session with the prompt bar expanded on that question; answering it and returning removes the row.
   - With no pending items: one sentence, no centred icon.
   - Graph section: live graph at fixed height; Expand to full screen, Escape returns; "Import notes" in the section header. With graph rendering off: the minimal summary.
3. Sidebar: Search with the filter inside it, one "New" menu (Lesson, Practice), amber dots, full wrapped titles, serif date shelves, gear at the bottom opens Settings with a Graph section that changes the live graph.
4. Queued messages: start a long turn, queue two, remove one; only the other appears in the transcript (covered by the cancel unit tests and the dock smoke test).
5. Phones: at 320 and 390 px, scroll up in a long session; scroll-to-latest sits in its band and covers no text.
6. `node scripts/smoke-dock-ui.mjs` and `node scripts/smoke-sidebar-ui.mjs` pass (dock: three runs in a row).
7. Performance: `node scripts/measure-session-performance.mjs` within 5% of the pre-change run.
