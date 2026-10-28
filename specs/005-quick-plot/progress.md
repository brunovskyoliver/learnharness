# Progress: 005 Quick plot

## Stage

Implemented 2026-10-28. Not committed, pushed or deployed.

## Decisions

- Spec Clarifications (7 owner answers incl. the doctrine intro reword asked during implementation); research.md R1–R5; plan and prompt wording approved 2026-10-28.
- Agent decisions (reversible): `resultMessageId` is set only on `tool-plot` view parts (no golden view churn); plots render before the turn settles, without the panel button until the record gives them an id; `stopBrowserService()` export added to `headless.ts` so tests that use the resident Electron helper can exit; T001 reused the 004 final measurement (same build).

## Log

- 2026-10-28: spec, clarify, plan.
- T001: baseline = 004 final (same production build): JS 707,204 B; API 17,191 B; ready 724 ms; FCP 80 ms.
- T002–T003: `src/core/plot.ts` (`PlotInputSchema`, `plotInputProblems`, `plotKitSpec`); `tests/plot.test.ts` (7).
- T004–T005: `src/agent/tools/plot.ts` (`plotTool`): input problems and compile errors → `invalidInputResult`; headless unavailable, page/console errors, failed requests, light background or "no finite values in range" → thrown error result; pass → "Plot shown: {title}." with demo details. `tests/plot-tool.test.ts` (5).
- T006/T011: `tests/plot-headless.test.ts` (4) against real Chrome via the resident helper: the hosted f(x,y) = x² + 3xy², a damped wave with a slider (the kit self-test sweeps it to min/max), 1/x clipped, and a function with no finite values (fails as designed). First run hung at exit because the helper's IPC kept the process alive; fixed with `stopBrowserService()` in `after`.
- T011 deviation: no separate probe that moves a slider and compares values; the kit's self-test (run inside every headless check) sweeps each slider to min and max and reports any error, which covers "updates without failing" but not "values change". The browser check confirmed the slider renders.
- T007–T008: `plot` in the teacher and practice registries; approved wording in `prompts/teacher/50-demos.md` (plus the reworded intro) and `prompts/practice/00-base.md`; three pinned registry lists updated (`tests/practice-agents.test.ts`, `tests/question-tools.test.ts`).
- T009–T010: `components/artifacts/plot-card.tsx` registered as `plot`; `plotArtifactOf`/`plotDemoOf` in `demo-panel-context.ts`; `sessionDemos` includes plots; invert persists through the existing artifact-ui route (it accepts any message whose details are a demo). `tests/render-plot-part.test.tsx` (3).
- T012: DESIGN.md (Demos), docs/ui-review.md.
- T013: browser check (production build, isolated data with a seeded practice session holding two plot results; `check-plots.mjs`, log `check-plots.log`): two frames; kit errors none in both (1-var: chart + 1 slider; 2-var: 2 Plotly panels); side panel opens with the plot; bold title link renders; no overflow at 390/320. Screenshots `shots/plots-transcript-{1440,390,320}.png`, `shots/plots-panel-1440.png`.
- T014: performance medians: JS 707,204 → 707,430 B (+0.03%); API unchanged; ready 724 → 703 ms; FCP 80 → 72 ms. Within 5%.
- T015: `smoke-sidebar-ui` passes (8); `smoke-demo-runtime` passes (exit 0); `smoke-dock-ui` 20 PASS then the known pre-existing assertion; `smoke-demo-workspace` fails waiting for `.lesson-footer [data-testid="stats-model"]` (the script seeds no models, so the toolbar shows the setup button) — the same failure on an export of unchanged HEAD (`smoke-demo-workspace-base.log`), so pre-existing.
- T016: `npm test` 2618/2618 (includes the real-Chrome tests); typecheck, lint, build pass.

## Report

**What changed**
- New `plot` tool for the teacher and the practice agent: explicit y = f(x) or z = f(x, y) with parameter sliders, built in code on the demo kit, checked once in headless Chrome, shown as a demo in the same reply (side panel, expand, download, invert, bold-title links). Failures go back to the agent in words; nothing unchecked is shown.
- Doctrine: teacher uses `plot` for explicit functions, `demo` for processes and multi-view instruments; practice plots only on request and declines when a plot would give the answer away.

**How it was verified**
- 22 new tests (incl. 4 in real Chrome), full suite, typecheck, lint, build, browser check with screenshots, performance, four smoke scripts with baseline comparison.

**What is left**
- SC-001 live: ask the practice agent "plot f(x,y)=x^2+3y^2x" with a real model (needs a model call; after deploy or in a local session).
- Pre-existing smoke failures (dock assertion; demo-workspace setup selector) are unchanged; candidates for a bug ticket.
- Not committed, pushed or deployed.
