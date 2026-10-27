# Reviewing the interface locally

Start the app with example threads:

```sh
npm run dev:review
```

Open [localhost:3000](http://localhost:3000). The sidebar lists four threads prefixed with `UI review`:

| Thread | What to inspect |
| --- | --- |
| [Gradient descent](http://localhost:3000/chat/review-gradient-descent) | Lesson and demo split, 3D surface and path, loss history, parameters, graph focus, question, confidence and composer |
| [Knowledge check](http://localhost:3000/chat/review-belief-check) | Longer lesson history, plan, math, answered questions and a pending check |
| [Active practice](http://localhost:3000/chat/review-practice) | Practice sidebar icon, active problem and reasoning controls |
| [Practice history](http://localhost:3000/chat/review-practice-history) | Solved and dismissed problems, feedback and between-problem controls |

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
