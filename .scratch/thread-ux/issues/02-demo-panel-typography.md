# Demo panel, demo styling, typography and wording

Requested 2026-10-27 after the usage audit (`~/agent-runs/2026-10-27-learning-workflow-audit/report.md`). Oliver chose option 1: demo panel and styling plus the view and font fixes. Workflow changes (Continue button, confidence, resume line, mistake review, session splitting) are a later ticket.

## Decisions (Oliver, 2026-10-27)

- Demo opens in a side panel right of the transcript; bottom sheet on mobile. The demo also stays in the transcript where it was built.
- Mentions link both ways: the demo's exact title in bold in teacher text opens the panel, and a top-bar button lists the session's demos. The teacher prompt asks for the exact title in bold.
- Existing light demos open inverted by default. New demos get the app's colors and font through injected CSS variables, and the headless test fails a light page background.
- Labels inside the session (cards, tool rows, composer chips, plan) scale with reading size, capped near 16px. Sidebar and settings stay fixed.
- Graph words: "ideas" and "chains". The "Probe" card label becomes "Question".

## Plan

1. Typography: em-based heading scale under `.lh-prose`; code blocks at about 0.85em; session-scoped `--text-xs`/`--text-sm` that follow `--lh-prose-size`; visible scroll affordance for wide tables.
2. Demo panel: session demo list derived from steer messages, panel component with resize, top-bar demos button, bold-title links in markdown, open button on the transcript card.
3. Demo look: `prefersInvert(html)` for light demos; theme style (variables plus Source Sans 3 served with CORS) injected with the bridge; builder prompt uses the variables; `run_demo` reports a light background.
4. Wording: hide raw tool names, Probe → Question, single "failed" on failed research, drop the plan header line and the pan/zoom hint, settings hints, "ideas" in the graph UI, drop "interactive demo" label, new-session description line, graph cost pill text.
5. Mobile graph toolbar overflow.
6. Verify: tests, typecheck, lint, browser screenshots against a copy of production data at 24px and 17px.

## Status

Implementation: complete and verified locally. Deployed 2026-10-27 (see below).

## What changed

- Demo panel (`components/artifacts/demo-panel.tsx`, `demo-panel-context.ts`): right of the transcript, resizable (drag or arrow keys, double-click resets to 480px, width saved), a select when the session has several demos. On narrow screens it is a sheet over the top 55%, so the composer stays usable; this replaces the planned bottom sheet, which would have covered the composer. Opens from a new top-bar button (toggles the latest demo), from a button on the demo card, or by clicking the demo's exact title in bold in teacher text. The panel iframe is its own instance; slider state is not shared with the transcript card.
- Demo look (`src/core/demo-theme.ts`): CSS variables, dark page and the reading font are injected first in every demo's `<head>`, in the lesson and in the builder's headless test. Source Sans 3 latin is served from `public/fonts/` with `Access-Control-Allow-Origin: *` (`next.config.ts`), license in `public/fonts/SourceSans3-OFL.txt`. Builder prompt uses the variables, drops the in-demo page title and asks for a plain style. `run_demo` fails a light page background. Demos declaring a light page open inverted unless the learner set the switch. The card header shows just the title.
- Typography: headings are em-based (32/25/20px at 17px, unchanged; 45/35/28px at 24px). Code blocks 0.82em. `--text-xs`/`--text-sm` moved to the non-inline theme and scale inside the session area (`.lh-session-scale`), capped at 15/16px. Wide tables fade the clipped edge, because macOS overlay scrollbars hide that they scroll.
- Wording: tool rows show plain labels (`list_sessions` → "Checked past sessions"); "Probe" → "Question" (cards, dock, Markdown export); failed research says "failed" once; plan popup header "Plan" without the explanation line; pan/zoom hint removed; settings drop "Mode · Coming soon" and the "Empty = …" hints, placeholders show real defaults (17, 700); graph UI says "ideas" and "chains" (teacher prompt told the same); new-session filler line removed; graph cost pill reads "Graph · …".
- Mobile: graph toolbar no longer runs off screen (icon-only buttons below 640px). Home composer keeps one row down to 320px: Teach/Practice switch is icon-only below 640px (book and dumbbell, as in the sidebar); below 390px the thinking chip shows only its gauge.
- Teacher prompt: refer back to demos by exact bold title.

## Verification

- `npm test` with isolated `LH_DATA_DIR`: 2435/2435 pass (new `tests/demo-panel.test.tsx`, 9 tests; 23 existing tests updated for the approved wording and invert default). Typecheck, lint and `git diff --check` pass.
- Browser checks against a copy of production data, at 24px and 17px (`~/agent-runs/2026-10-27-learning-workflow-audit/after/`, `verify.mjs`, `p24-*`/`p17-*`): bold title 30+ screens below the demo opens the panel on the right demo; resize persists; top-bar toggle; old light demo starts inverted; heading above body; labels 12px at 17 and 15px at 24; code 14px at 17; tables fade only when clipped; no raw tool names or "Probe"; plan header; mobile sheet leaves composer visible; mobile graph toolbar in viewport; no page errors. Composer measured at 320/360/390/430/768px: one row each.
- The verify script's font check fails for the two existing demos because they set their own system font, so the browser never requests LH Sans. A forced load inside both sandboxed frames succeeded: `/fonts/source-sans-3-latin.woff2` 200 with `Access-Control-Allow-Origin: *`.
- Real headless Chrome through `getHeadless().runDemo`: a white page fails with `lightBackground: rgb(255, 255, 255)`; an unstyled page passes with no errors.

## Remaining

- Not tested: Electron window, real touch, hosted mode behind Clerk (font path is excluded from the proxy matcher, so it should be public), a newly built demo from the updated builder prompt (needs a model run).
- Panel and transcript card keep separate invert state until reload.
- Workflow ticket (Continue button, confidence, resume line, mistake review, session splitting) not started.
- GitHub push and merge into local `main` not done.

## Deployment, 2026-10-27

Oliver asked to commit and deploy tickets 02 and 03 together.

- Implementation: commit `287e52b0f01b6ab827af2fb108ad4272578f4804` on local branch `thread-ux-demo-kit` (local `main` unchanged at `bdcbd1b`). Transferred by temporary git bundle; VM `~/learnharness/src` and `~/learnharness.git` main fast-forwarded from `b3a2836`. GitHub not pushed, no PR or merge.
- Build on the VM: `learnharness:demo-kit-20261027-287e52b`, also `learnharness:amd64`, `sha256:52ca840e8411db8386afe2c81aa434b4543538fb0606a7dac1cd04d453449b21`. Kit build, Next build and server payload steps passed; image contains `public/demo-kit/` and the Source Sans 3 font.
- Smoke in the image's Chromium: a kit demo loaded from `file://` drew its chart and readout.
- Deployment: `docker compose up -d --no-deps --no-build app`; running, 0 restarts, Ready. Other containers untouched.
- Live checks at https://learn.brunovsky.online: `/` 307, `/sign-in` 200, `/api/chats` 401, `/demo-kit/runtime.js`, `vega.js`, `plotly.js`, `flow.css` 200, font 200 with `Access-Control-Allow-Origin: *`; the live stylesheet contains the new session scale, heading, table fade and composer rules.
- Not exercised: signed-in production use, and a demo built by the model with the new builder.
- Rollback: `cd ~/learnharness && docker tag learnharness:rollback-demo-kit-20261027 learnharness:amd64 && docker compose up -d --no-deps --no-build app` (image `sha256:d720c758…`, source `b3a2836`). VM record: `~/agent-runs/2026-10-27-demo-kit-deploy/`.
- VM disk: 12 GB free after the build (was 16 GB); build cache left in place.
