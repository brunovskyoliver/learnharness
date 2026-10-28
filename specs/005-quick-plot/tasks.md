# Tasks: Quick plot in any session

**Input**: `specs/005-quick-plot/` plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: included (constitution: tests without model requests; sandbox and honest-failure proof).

## Phase 1: Setup

- [X] T001 Performance baseline with `~/agent-runs/2026-10-28-feature-005/perf.sh baseline` on a production build of the current tree

## Phase 2: Foundational

- [X] T002 [P] Failing tests in `tests/plot.test.ts`: `plotInputProblems` (min ≥ max, value outside range, step ≤ 0, more than 6 params, param named x/y/sin, missing y range for two variables, y range given for one variable); `plotKitSpec` for one variable → one chart panel, sliders per param, spec passes `validateDemoKitSpec`; two variables → plot3d surface + contour panels, passes validation; expression with a param compiles inside the derived wrapper
- [X] T003 Implement `src/core/plot.ts` (`PlotInputSchema`, `PlotInput`, `plotInputProblems`, `plotKitSpec`) and export from `src/core/index.ts`
- [X] T004 [P] Failing tests in `tests/plot-tool.test.ts` with a faux headless: success → text "Plot shown: {title}." and `details` `{ kind: "demo", result: { title, html, tested: true } }`; page error → error result naming it; zero finite values → error result; headless unavailable → error result with the reason; invalid input → error result with the problems; the html is `kitDemoHtml(plotKitSpec(input))`
- [X] T005 Implement `src/agent/tools/plot.ts` (`plotTool(headless)`), using the `serverExecute`/invalid-input conventions, the headless probe for finite samples, and the approved tool description verbatim
- [X] T006 [P] Real headless test (skip with reason when Chrome is unavailable): the two-variable spec for `x**2 + 3*x*y**2` renders with no page/console errors and finite values

## Phase 3: User Story 1 — Ask for a plot and see it right away (P1)

- [X] T007 [US1] Register `plot` in the teacher registry (`src/agent/tools.ts`) and the practice registry (`src/agent/tools/practice.ts`)
- [X] T008 [US1] Add the approved wording to `src/agent/prompts/teacher/50-demos.md` and `src/agent/prompts/practice/00-base.md`; update prompt snapshot tests if any
- [X] T009 [P] [US1] Failing view/render test: a `plot` tool call with a successful result projects to a demo artifact (same data shape as a demo steer) and renders the demo artifact component; a failed plot renders the ordinary tool-error fallback, no iframe
- [X] T010 [US1] Project and render plot parts (view/tool-parts + transcript component), and include plot artifacts wherever delivered demos are collected for the side panel

## Phase 4: User Story 2 — Parameters (P2)

- [X] T011 [US2] Covered by T002/T006 (sliders per param, redraw in the kit); add a headless probe in T006 that changes a slider and sees new values

## Phase 5: Polish

- [X] T012 [P] DESIGN.md (plots render as demo artifacts) and docs/ui-review.md
- [X] T013 Browser check: seeded session with plot tool results (1-var with a param, 2-var) on a production build; open beside; screenshots 320/390/1440; manual review
- [X] T014 `perf.sh final` vs T001
- [X] T015 `smoke-sidebar-ui.mjs`, `smoke-dock-ui.mjs`, `smoke-demo-runtime.mjs`, `smoke-demo-workspace.mjs`
- [X] T016 `npm test`, lint, typecheck, build; Report in progress.md
