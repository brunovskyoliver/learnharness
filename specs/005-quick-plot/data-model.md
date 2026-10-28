# Data Model: Quick plot

## PlotInput (model-authored, TypeBox schema in `src/core/plot.ts`)
| Field | Type | Rule |
|-------|------|------|
| `title` | string | 1–80 chars |
| `variables` | `["x"]` \| `["x","y"]` | |
| `expression` | string | JS over x[, y], params by name, Math functions |
| `x` | `{min, max}` | min < max |
| `y` | `{min, max}` | required iff two variables; min < max |
| `zClip` | `{min, max}`? | optional visible output range |
| `params` | `Record<string, {label?, min, max, step, value}>`? | ≤ 6; identifiers; not x, y or Math names; min < max; step > 0; min ≤ value ≤ max |

## Tool result
- Success: text "Plot shown: {title}." + `details: { kind: "demo", result: { title, html, tested: true } }`.
- Failure: `isError` result with the reason lines; no details.
