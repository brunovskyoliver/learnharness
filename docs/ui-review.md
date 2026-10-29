# Reviewing the interface locally

Start the app with example threads:

```sh
npm run dev:review
```

Open [localhost:3000](http://localhost:3000). The sidebar lists seven threads prefixed with `UI review`:

| Thread | What to inspect |
| --- | --- |
| [Gradient descent](http://localhost:3000/chat/review-gradient-descent) | Lesson and demo split, 3D surface and path, loss history, parameters, graph focus, question, confidence and composer |
| [Knowledge check](http://localhost:3000/chat/review-belief-check) | Longer lesson history, plan, math, answered questions and a pending check |
| [Active practice](http://localhost:3000/chat/review-practice) | Practice sidebar icon, active problem and reasoning controls |
| [ML panels](http://localhost:3000/chat/review-ml-panels) | All six panel kinds, 3D scatter, linked composition and a failed panel |
| [ML lookups](http://localhost:3000/chat/review-ml-lookups) | Hub model/search, paper search/read, tokenize, success/failure/unfinished rows and page citations |
| [ML practice](http://localhost:3000/chat/review-ml-practice) | Active practice with editable real tokens, without revealing its solution |
| [Practice history](http://localhost:3000/chat/review-practice-history) | Solved and dismissed problems, feedback and between-problem controls |

Home lists three of them under "Waiting for you": two lesson checks and the active practice problem, newest first. Answer or Solve should open the session with the prompt bar expanded on that item and drop `?answer=` from the address; answering it and returning removes the row. A lesson whose plan still has unchecked topics and nothing waiting gets a "Lesson" row after them ("{n} of {total} topics left · next: …", Continue); Continue opens it at the bottom with "Continue with …" in an empty composer and drops `?continue=`, and leaves an existing draft untouched. "Calibration" follows: the review data contributes lines per confidence level; Review on a miss opens its session at the message before that check. Below that, the knowledge graph section holds the live graph at a fixed height: Expand shows it full screen, Escape or Close returns focus to Expand, and Chains covers the whole Home area. With Settings → Graph → Graph rendering off, the same section shows the minimal summary.

In the sidebar, check the Search field with the filter at its right end, the New menu (Lesson, Practice), the amber dots on the three waiting sessions, wrapped titles and the serif date shelves. The graph's display sliders are in Settings → Graph → Display and change the live graph as they save.

The gradient demo runs locally without a model. Try 0.08 and 0.3, reset between runs, focus a graph, rotate its camera and close with Escape. The path, history and parameters should survive presentation changes. Sending an answer or requesting another problem uses the app's configured provider normally. Seeding and viewing the examples do not invoke a model.

Open Settings from the sidebar to inspect searchable categories, grouped fields, narrow layouts and the live reading preview. Changes in Settings persist immediately. Model, reasoning and usage controls sit directly in the prompt toolbar; without a provider key the toolbar shows "Add a provider key" instead. Escape closes a child menu before its parent; Tab traverses settings controls within the dialog.

## Keeping examples for later

```sh
npm run seed:review   # add missing examples without starting a server
npm run dev:review    # seed missing examples, then run the usual dev server
npm run dev          # start the server with all existing data
```

The seed source is [scripts/seed-review.mjs](../scripts/seed-review.mjs). It writes stable IDs into `data/chats/`, or the directory selected by `LH_DATA_DIR`. It uses exclusive writes: existing examples, learner edits, unrelated chats, graph data, settings and credentials are preserved. Missing examples are recreated on the next seed run. To restore one example to the current seed definition, delete that example through the app, then rerun `npm run seed:review`.

These examples are opt-in. Ordinary `npm run dev` does not create them. `npm run dev:fresh` remains a separate empty-user setup test. Review seeding refuses `LH_HOSTED=1` and does not seed hosted tenants.

The knowledge-check and practice examples derive from checked-in golden records. The gradient example is synthetic and uses native message templates. The golden source files remain unchanged. Generated review chats stay in ignored local data; the generator and tests are tracked. Review examples do not populate or replace the knowledge graph.

## Current UI and checks

[DESIGN.md](../DESIGN.md) describes the current interface: the Study ink theme, consistent session icons and 52px headers, the four-zone prompt bar with direct model, reasoning and usage controls, and responsive settings. [PRODUCT.md](../PRODUCT.md) describes the product scope.

```sh
npx tsx --test tests/review-seed.test.ts
npm run typecheck
npm run lint
node scripts/smoke-demo-workspace.mjs
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/smoke-sidebar-ui.mjs
```

The browser regressions start their own isolated dev servers and use the installed Chrome. Stop the ordinary dev server first because Next dev holds a project lock. `LH_UI_SCREENSHOT_DIR` optionally saves their screenshots. Model submissions are intercepted in those checks.

As of the 2026-10-27 direction A verification, the full suite had four pre-existing stale assertions: the retired house invert switch, two old invitation/placeholder expectations, and a dotted phase-divider border. These reproduced on unchanged HEAD. The redesign's build, typecheck, lint, focused tests and browser regressions passed.

Quick plots (feature 005): a session where the agent called `plot` shows the plot as a demo card in that reply (a line for y = f(x), surface and contour for z = f(x, y), sliders for parameters); it opens beside the lesson like other demos. A failed plot is a collapsed tool card with no frame.

Course track (feature 006): a lesson with a recorded syllabus shows a Course section below the diagram in the plan popup (states derived from checks; links open in a new tab) and "Course: n of m covered" on its Home row.

Math check (feature 007): in a session where the agent called `math_check`, each check is one quiet row on the reading edge: "Wolfram · equal", "Wolfram · not equal", "Wolfram · couldn't decide" or "Wolfram · check failed". Expanding a row shows the checked expressions, any counterexample, and Wolfram's reply when it couldn't decide. A check made before a question shows nothing until that question is answered. A grading check during an active problem shows its verdict with "Expressions shown after the problem is concluded". Answered and concluded cards whose answer was checked end with "Checked with Wolfram". The switch is Settings → Agent → Math check.

ML lab review (feature 008): build with `npm run build`, seed an isolated `LH_DATA_DIR` with `npm run seed:review`, then use the same directory with `npm start`. At 320, 390 and 1440px, inspect every panel inline and expanded, expand every lookup row, and inspect the three Agent toggles after Math check. Compare the [nine canvas boards](https://claude.ai/artifact/EmWdcYcnZrXu5Ng1VyHiA6). Verify no page overflow, hidden scrollbar tracks, visible keyboard focus, 44px touch targets, reduced motion and preserved state across focus/theme changes. Edit token text and switch encodings through the actual `/api/tokenize` bridge; move sampling controls, step the network and select shape steps. For dense views use one Tab stop and arrows, with the same readout as pointer hover. Paper links retain page fragments and open in a new tab.

The ML review generator uses synthetic native records and the real local tokenizer, with no network or model. Persisted unfinished calls are settled rows; running rows require a synthetic session stream in the browser review harness and are not misrepresented as running after reload. No submission is required to inspect these examples. The production UI evidence and performance harness live under `~/agent-runs/2026-10-28-feature-008/`.
