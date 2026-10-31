# Features 014-015: Workspace navigation and command palette
Stage: done, not merged or deployed
Updated: 2026-10-31

## Decisions

Owner-facing decisions are in spec.md, Clarifications. Technical ones:

- `PagePaneContext` moved to `components/workspace/pane-context.ts`, re-exported by `page-pane-api.ts`, so the shell reads it without a Library module entering startup JS (`tests/startup-module-graph.test.ts` caught this).
- The palette's dialog is imported by hand rather than with `lazy`, so a failed chunk shows a message instead of reaching an error boundary.
- `useDemoPresentation` also observes the pane, because a collapse moves the demo's slot without resizing it.

## Log

- Bug found and fixed: a measured transcript row's `content-visibility: auto` is a containing block for the live demo's `position: fixed`, so a workspace demo was drawn away from its slot and partly off screen. It dates from `0328bf6`. `scripts/smoke-demo-workspace.mjs` failed on it on the clean base commit `9a8d557`. Fixed with one CSS rule that keeps that row visible while its demo is in the workspace.
- The Mod+K collision was wider than the page editor: the model selector held it too. See Clarifications.

## Report

**Verified**
- `npx tsc --noEmit`: clean. `npx eslint .`: clean.
- `TMPDIR=~/lh-tmp NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx`: 3497 tests, 3470 pass, 0 fail, 27 skipped. No existing test was edited.
- `scripts/check-workspace-ui.mjs`: pass, 1440, 390, 320. `scripts/smoke-sidebar-ui.mjs`: pass, unchanged. `check-library-folders-ui`, `check-session-state-ui`, `check-transcript-scroll-ui`, `check-turn-navigation-ui`: pass.
- `npx next build`: pass. Initial JS, gzipped, from the scripts a production server sends: `/` 279.4 to 286.7 KB (+2.6%), `/library` 282.9 to 290.7 KB (+2.7%), `/chat/new` 269.9 to 278.0 KB (+3.0%), under the 5% ceiling. The palette's string is in no script `/` sends. Not the constitution's throttled benchmark, whose baseline is still an open TODO.

**Failing, not caused by this work**
- `scripts/check-library-ui.mjs` stops at 390px asserting the Rename icon is 44px: feature 013 deliberately hides it below 640px and the script wasn't updated. With a temporary copy running that first section at 1440 only, the rest passed (editor Ctrl+K included). The script is unchanged here.
- `scripts/smoke-demo-workspace.mjs` now gets past the placement bug, then waits for `stats-model`, which needs configured models that the script doesn't seed. Its remaining steps did not run.

**Not done**
- No live Electron check ran. `electron/` is untouched and no band, gutter or drag region changed, but the strip's position under the band has not been seen in the desktop app.
- Switching to a different session reloads that session's demo: see plan.md, Known limits.
- `speckit-feature` was not run as a skill, because its stops ask the owner; the artifacts were written by hand under the no-questions rule.
- Reduced motion: no new animation beyond the shared dialog's; not separately exercised in a browser.
