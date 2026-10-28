# Implementation Plan: Quick plot in any session

**Branch**: `claude/fervent-bohr-l648pg` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

## Summary

A new server-executed `plot` tool for the teacher and the practice agent. Its input is a title, an explicit expression in x (and y), axis ranges and optional parameters. `execute` builds a demo-kit spec in code (`plotKitSpec`, pure, `src/core/plot.ts`): a line chart for one variable, a 3D surface plus a contour panel for two, a slider per parameter. It validates the spec with `validateDemoKitSpec`, renders `kitDemoHtml(spec)` once in the headless browser (no page or console errors, at least one finite value), and returns the HTML in the tool result's `details` as a demo artifact. On failure the model gets an error result with the reason and may correct the call; nothing is shown. The transcript renders a successful `plot` result with the existing demo artifact component, so the side panel, expand, download and theme behaviour come for free. Prompt additions (exact wording below) go into the teacher's demo doctrine and the practice base prompt.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js 16

**Primary Dependencies**: existing demo kit runtime (Vega-Lite, Plotly via `public/demo-kit/`), existing headless browser seam (`src/agent/subagents/headless.ts`). No new dependency.

**Storage**: the plot's HTML rides the tool result `details` in the chat record (as demo HTML rides the steer today).

**Testing**: unit tests for `plotKitSpec` and the tool's execute (faux headless), view-projection/render test, a real headless run of a generated plot in tests where Chrome is available (skip with reason otherwise), browser check, smoke tests.

**Performance Goals**: plot check adds ≤ ~5 s to the reply; no client startup cost (demo kit loads only inside the plot iframe).

**Constraints**: sandboxed iframe as for demos (Principle VII); practice plots only on request (FR-006); headless unavailable → explicit refusal (Principle IV); explicit functions only.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I Owner decides | Pass (pending wording approval) | 7 owner answers in spec Clarifications. Tool description and doctrine wording below need approval with this plan. |
| II Teaching theory first | Pass | Teacher uses plots as instruments (existing demo doctrine); practice plots only on request and never reveal an answer; no target announced. |
| III Learner data is never lost | Pass | Append-only transcript; the plot persists in its tool result. |
| IV Honest states | Pass | Failed checks and unavailable headless browser produce words, never a broken frame; nothing untested shown. |
| V Consent before cost | Pass | No background job; the plot runs inside a turn the learner already sent. |
| VI Interface follows DESIGN.md | Pass with exception | Reuses the demo artifact UI; skills unavailable (manual review + screenshots). |
| VII Boundaries, tenancy, sandboxing | Pass | Same sandbox (`allow-scripts`, no same-origin) and bridge validation as demos; spec builder pure in `src/core`. Expressions run only inside the sandboxed iframe and headless page, never in the server process (compile-only check server-side, as today). |
| VIII Performance | Pass (to measure) | No startup change expected; measure as 003/004. |

## Project Structure

```text
src/core/plot.ts                 # NEW pure: PlotInputSchema, plotKitSpec(input) → DemoKitSpec, plotInputProblems(input)
src/core/index.ts                # export
src/agent/tools/plot.ts          # NEW: plotTool(ctx) — validate, headless check, result/details
src/agent/tools.ts               # teacher registry adds plot
src/agent/tools/practice.ts      # practice registry adds plot
src/agent/prompts/teacher/50-demos.md   # `plot` section (wording below)
src/agent/prompts/practice/00-base.md   # plot rule (wording below)
src/core/view.ts or tool-parts   # plot tool part → demo artifact data
components/ (chat transcript)    # render plot parts with the demo artifact; include in the demo side-panel registry
tests/plot.test.ts, tests/plot-tool.test.ts, tests/render-plot-part.test.tsx
DESIGN.md (demo artifacts note), docs/ui-review.md
```

## Proposed wording (needs approval)

**Tool description (`plot`)**:
> Draw an interactive plot of an explicit function right now, in this reply: one variable (y = f(x)) or two (z = f(x, y)). No background job. Write `expression` in JavaScript over x (and y), the parameters by name, and Math functions without the `Math.` prefix (x**2, sin(x), exp(-a*x)). Choose axis ranges that show the interesting behaviour; each parameter becomes a slider with the range and default you give. The plot is checked in a headless browser before it shows; if the check fails you get the reason and can correct the call. For processes to step through, simulations or several linked views, use `demo`.

**Teacher, `50-demos.md`, new section after `demo`**:
> ### `plot` — instant function plots
> For an explicit function of one or two variables, with parameters as sliders, call `plot` instead of `demo`: it appears in this reply within seconds. Use `demo` for processes to Step/Run, simulations and several linked views. Refer to a plot by its exact title in bold, as with demos, and point the learner at its sliders.

**Practice, `00-base.md`, new paragraph**:
> **Plots.** When the learner asks to see a function, call `plot`. Plot only on request — never on your own initiative and never as a hint. If the plot would give away the current problem's answer, say so in one line and offer to plot it once the problem is concluded.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle VI skills unavailable | Environment | Substitute review documented |
