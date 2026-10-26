# UI v2 — plan (2026-10-26)

Source: the user's feedback on the deployed polish pass (8 screenshots). Decisions below are the user's answers; nothing here is a guess.

## Decisions
- **Width:** transcript and composer share one 52rem column (was 36rem text / 46rem composer).
- **Sidebar:** follow T3 Code closely (spec: T3 Code main @ 210b2e7c).
  - Black sidebar against a #0a0a0a main pane, hairline 8% borders, 256px wide, resizable 208px to (viewport − 640px), offcanvas collapse.
  - Top: brand, then a ghost search with icon buttons (filter, new lesson, new practice).
  - Rows: 36px slim rows (title + right-aligned `tabular-nums` time), grouped by date with T3 shelf headers (label, rule, count).
  - Footer: icon buttons (settings, usage), with the account behind the avatar menu.
- **Chrome font:** Source Sans 3 in sentence case everywhere; no uppercase-mono labels. Mono is kept only for code, stats numbers and keyboard hints.
- **Header:** 52px T3-style breadcrumb, `Teaching / <title>` at 14px. A rename pencil appears on hover; plan and coverage are ghost icon buttons with tooltips.
- **Stats popover:** summary only: a context bar with used / limit, the turn count, total tokens, the plan line and "Manage usage". The per-turn list is dropped.
- **Markdown:**
  - inline code sized relative to the surrounding text (~0.9em);
  - the dock preview renders inline markdown instead of raw backticks;
  - code blocks get larger text and higher-contrast tokens and line numbers;
  - wide display math scales down or wraps without colliding labels.
- **Diagrams:** replace `mermaid` with `pele` (Obsidian's MIT Mermaid renderer) at every render site, with theming through CSS variables. The model keeps writing Mermaid syntax.
- **Quiz:**
  - options at 16px in tighter rows, with the radio centred on the first line;
  - confidence becomes 4 segments saving Guessing 25 / Unsure 50 / Fairly sure 75 / Certain 95, and old answers keep their values;
  - "Your thinking" becomes one flat field with a proper primary Submit.
- **Settings:** one row pattern: sans label, muted sans description, controls of equal width that are right-aligned. Every tool row gets a description.
- **Titles:** the cheap model writes a 3–6 word sentence-case title after a new session's first message. Backfill runs once per user in the background, only for sessions whose title is still the cut-off first prompt or "Untitled session". Hand-renamed sessions are never touched.
- **Dictate:** removed fully (component, button, shortcut, settings, tests).
- **Rebrand:** "Brunovský's study" everywhere visible:
  - page titles, sign-in, sidebar brand, empty state, prompts that name the app, docs, Electron window/menu;
  - internal ids stay (package name, `LH_*` env, desktop data folder), and so does the logo mark.

## Phases (one commit each; tests + typecheck + lint per commit)
1. Rebrand strings.
2. Drop Dictate.
3. Chrome font + tokens: the sans chrome, the T3 colour/border tokens, and the 52rem column.
4. Sidebar rebuild.
5. Header breadcrumb.
6. Stats popover.
7. Markdown fixes.
8. Pele swap.
9. Quiz card.
10. Settings rows.
11. AI titles + backfill.
12. Deploy to learn.brunovsky.online and report in `.scratch/ui-v2/issues/`.
