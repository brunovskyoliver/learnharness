# Contract: `math_check` tool

## Who has it

- Teacher (`createTeacherTools`) and practice (`practiceTools`).
- The prober, the researcher and the other sub-agents don't have it.
- It's removed when `agent.tools.math_check === false`.

## Input

See [data-model.md](../data-model.md) for MathCheckInput. An invalid input returns `invalidInputResult("math_check", problems)`, and the model retries.

## Execution

1. Per-turn counter. The 6th call in a turn is refused: "At most 5 math checks per turn."
2. `wolframCheckCode(input)` builds the WL program (research R2).
3. `callMcpTool("wolfram", "WolframLanguageEvaluator", { code, timeConstraint: 30 }, signal)`.
4. `parseWolframCheck(text)` turns the result into MathCheckDetails. A syntax message or `$Failed` throws "Wolfram could not read the expressions: …". A missing outcome throws "The Wolfram check returned no verdict".

## Model-facing result text

```
Wolfram: agreed — lhs and rhs are equal.
Wolfram: disagreed — counterexample {x -> 5}.
Wolfram: undecided — reduced to Sqrt[x^2] == x. Equal only under conditions, or not provable here; do not call it checked.
```

## Failure texts (error results)

- "The Wolfram check is unavailable: {reason}. Continue without it and do not call the result checked."
- "Wolfram could not read the expressions: {message}"
- Hosted mode without a tenant: thrown by `tenantScoped`, surfaced as the tool's error.

## View

`LhViewPart` gains:
- `mathCheck?: { hidden: boolean; expressionsHidden: boolean }` on `tool-math_check` parts;
- `wolframChecked?: true` on question, problem and conclude parts.
