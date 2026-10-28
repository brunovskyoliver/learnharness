# Research: Quick plot

## R1. Tool shape
- **Decision**: server-executed `plot` tool returning synchronously (like `quiz` validation, unlike async `demo`). Input: `title`, `variables` (`["x"]` or `["x","y"]`), `expression` (JS), `x: {min,max}`, `y?: {min,max}` (required for two variables), `zClip?: {min,max}` (optional visible range for steep functions), `params?: Record<name, {label?, min, max, step, value}>` (≤ 6).
- Parameters are written by bare name in the expression; the spec wraps it as `(x, y) => { const { a, b } = p; return (EXPR); }` in a derived function.

## R2. Spec built in code
- One variable: 400 samples over x, a Vega-Lite line chart; non-finite and clipped points dropped.
- Two variables: 60 × 60 grid; a Plotly surface panel and a contour panel side by side (half widths, stacked on phones by the kit).
- Sliders from `params`. No step/run.

## R3. Validation
- `plotInputProblems` (ranges: min < max; values inside; names are identifiers, not x/y/Math names; at most 6 params) → error result to the model.
- `validateDemoKitSpec` (schema + compile-only) → error result.
- Headless `runDemo` with a probe counting finite samples: page/console errors or zero finite values → error result with the first messages. Headless unavailable → error result with `unavailableReason()` (Principle IV), same as the demo builder's refusal.

## R4. Rendering and the side panel
- The `plot` tool result `details` = `{ kind: "demo", result: { title, html, tested: true } }`; the view projects a plot tool part into the same demo artifact the steer card uses, so the side panel, expand, download and theme handling are shared. Demo references (`demoRef`) for questions about a plot are out of scope for this version.

## R5. Wording
- Proposed in plan.md; owner approval required before implementation.
