# Data Model: Wolfram math check

## MathCheckInput (model-authored, TypeBox schema in `src/core/math-check.ts`)

| Field | Type | Rule |
|-------|------|------|
| `purpose` | `"question"` \| `"grading"` \| `"lesson"` | required |
| `lhs` | string | 1–400 characters, whitelist, balanced brackets, no assignment |
| `rhs` | string | same |
| `assumptions` | string? | 1–200 characters, same rules |

## MathCheckDetails (tool result `details`, server-authored)

| Field | Type | Notes |
|-------|------|-------|
| `outcome` | `"agreed"` \| `"disagreed"` \| `"undecided"` | |
| `counterexample` | string? | e.g. `{x -> 5}` |
| `reduced` | string? | FullSimplify's leftover for undecided |
| `raw` | string | Wolfram's text, trimmed to 2,000 characters |
| `ms` | number | call duration |

Failures are an `isError` result with the text "The Wolfram check …: reason" and no details.

## MathCheckBindings (read-time view fold, nothing stored)

- `checks: Map<checkCallId, { hidden: boolean; expressionsHidden: boolean }>`
- `checked: Set<itemCallId>`: question, explain, problem or conclude calls whose last bound question-check agreed.

## Settings

`agent.tools.math_check: boolean`. Absent means on.
