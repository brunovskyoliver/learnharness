# Implementation Plan: Wolfram math check through an MCP client layer

**Branch**: `claude/fervent-bohr-l648pg` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

## Summary

This feature adds one server-executed tool, `math_check`, for the teacher and the practice agent.

- **Input:** `purpose` (`question` | `grading` | `lesson`), `lhs`, `rhs` and optional `assumptions`, all in Wolfram Language syntax.
- **Validation:** `src/core/math-check.ts` (pure) checks the input against a character whitelist with balanced brackets and no assignments. The same module builds the fixed check code.
- **Execution:** `src/agent/mcp/` runs the code through Wolfram Cloud's `WolframLanguageEvaluator`. That layer holds a small MCP client on `@earendil-works/pi-mcp`, a fixed server list, one lazily connected client per tenant, a timeout, a reconnect after a dropped connection, and abort on turn stop.
- **Outcome:** the result is parsed into `agreed`, `disagreed` (with a counterexample when one was found) or `undecided`. Unreadable expressions and an unavailable service come back as error results.

What the learner sees is decided at read time in the view projection, and nothing new is stored:

- **`question` checks** belong to the question or problem posed at the end of the same turn. They stay hidden until it is answered (quiz, explain) or concluded (problem), then show in full.
- **`grading` checks** belong to the active practice problem. Their outcome shows at once, and the expressions show after the problem concludes.
- **`lesson` checks** show at once.

The answered card and the conclude card carry "Checked with Wolfram" when the last `question` check attached to them agreed. The row of a `grading` check carries the label when it agreed.

`math_check` becomes a settings toggle, on by default. Doctrine changes go into the shared accuracy fragment, the teacher's job fragment, a new teacher fragment and the practice base.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js 16.

**Primary Dependencies**: new runtime dependency `@earendil-works/pi-mcp@1.4.0`, approved by Oliver on 2026-10-28. It has one dependency, `cross-spawn`. Its only importer is `src/agent/mcp/client.ts`, loaded with a dynamic `import()` on the first check, so neither the client bundle nor server startup loads it. External service: Wolfram Cloud MCP, `https://agenttools.wolfram.com/mcp`, Streamable HTTP, no auth.

**Storage**: none new. The check's details ride its tool result in the transcript, as plot HTML does.

**Testing**: tests run without network or model requests. They cover:
- unit tests for input problems, code generation and output parsing;
- the tool with an in-memory MCP pair (`@earendil-works/pi-mcp/testing`) that stubs Wolfram, including the outcomes, unavailable, dropped connection then reconnect, abort, the per-turn limit and the hosted no-tenant refusal;
- view-binding tests for hidden/revealed/label, and render tests for the card and the labels;
- one opt-in live test (`LH_LIVE_WOLFRAM=1`), skipped by default, and a seeded browser check with screenshots.

**Performance Goals**: measured in a live probe on 2026-10-28, a check adds about 3.5–4.5 s, plus about 3 s to connect on the first check of a process and tenant. No change to client startup.

**Constraints**:
- Only the expressions leave the server.
- A hosted request without a tenant is refused (`tenantScoped` throws).
- The check's time limit is 20 s inside Wolfram, and the client request times out at 30 s.
- At most 5 checks per turn per agent.

## Constitution Check

| Principle | Status | Notes |
|-----------|--------|-------|
| I Owner decides | Pass | Oliver decided the route, dependency, consent, label, fixed list and pre-check visibility. He delegated the rest, and the agent's decisions are recorded in the spec's Clarifications, including the evaluator-template revision. |
| II Teaching theory first | Pass | Answers stay out of the learner's view until answered or concluded. `question` checks are hidden, and `grading` expressions are hidden until conclude. Practice doctrine still localizes the first break without revealing the correction. The commitment rule is unchanged: checks run before the commitment is posed. |
| III Learner data is never lost | Pass | Append-only transcript. The check persists as an ordinary tool result. No record format change. |
| IV Honest states | Pass | The label shows only on agreed checks. Failures, undecided outcomes and "unavailable" are shown in words. The live row shows "Checking with Wolfram" while running. Raw output is available on expand once visible. |
| V Consent before cost | Pass | Free service, inside a turn the learner already sent. Oliver decided no per-call consent. The settings toggle turns it off. |
| VI Interface follows DESIGN.md | Pass with exception | New quiet row and label, in the existing tool-card and chip registers. The `shadcn`, `impeccable` and `web-design-guidelines` skills aren't installed in this environment (same as 005), so review is manual against DESIGN.md, with screenshots at 320, 390 and 1440 px. |
| VII Boundaries, tenancy, sandboxing | Pass | `src/core/math-check.ts` stays pure. The MCP client lives in the agent layer. The tenant-scoped client throws without a tenant in hosted mode. Model input is whitelisted, and code runs only in Wolfram's cloud kernel, never on our server. |
| VIII Performance | Pass (to measure) | Dynamic import keeps pi-mcp out of startup. Measure with the 005 `perf.sh` (baseline T001, final T018). |

## Project Structure

```text
package.json                                  # + @earendil-works/pi-mcp 1.4.0
src/core/math-check.ts                        # NEW pure: schema, input problems, wolframCheckCode, parseWolframCheck, mathCheckBindings
src/core/index.ts                             # export; toolActivityLabel gains math_check
src/core/pending.ts                           # TOGGLEABLE_TOOLS + "math_check"
src/core/view.ts                              # parts gain mathCheck (hidden / expressionsHidden) and wolframChecked on question/problem/conclude parts
src/agent/mcp/servers.ts                      # NEW fixed server list (wolfram)
src/agent/mcp/client.ts                       # NEW per-tenant client: lazy connect, timeout, reconnect-once, abort
src/agent/tools/math-check.ts                 # NEW mathCheckTool({ call, limit }) — validation, limit, outcome text + details
src/agent/tools.ts                            # teacher registry + math_check (toggle-filtered)
src/agent/tools/practice.ts, teacher-agent.ts # practice registry + math_check (toggle-filtered)
src/agent/prompts/shared/15-accuracy.md       # reworded computation sentence
src/agent/prompts/teacher/40-jobs.md          # "never for math" line
src/agent/prompts/teacher/35-math-check.md    # NEW: when and how the teacher checks
src/agent/prompts/practice/00-base.md         # **Math checks.** paragraph
components/artifacts/math-check-card.tsx      # NEW row: outcome, label, expressions (when visible), raw on expand
components/artifacts/index.ts                 # register math_check
components/artifacts/live-tool-card.tsx       # math_check: no streaming input body
components/answered-card.tsx, components/chat.tsx, components/practice-cards.tsx  # "Checked with Wolfram" on reveals
components/settings/agent-section.tsx         # toggle row
tests/math-check*.test.ts(x)
DESIGN.md, PRODUCT.md, docs/ui-review.md
```

## Wording (agent decision under Oliver's delegation, 2026-10-28)

**Tool description (`math_check`)**:
> Check with Wolfram whether two expressions are mathematically equal. Write `lhs` and `rhs` in Wolfram Language: Sin[x], Exp[x], Log[x], Sqrt[x], D[f, x], Integrate[f, {x, a, b}], Sum[f, {i, 1, n}], Pi, E, I; multiply with * or a space; no strings, semicolons or assignments. Symbols are scalars: write matrix and vector expressions componentwise or with explicit small matrices ({{a, b}, {c, d}}), or don't check them. For sums over data, check the summand. `assumptions` (optional) narrows the domain, e.g. `x > 0 && Element[n, Integers]`. `purpose`: `question` — the committed answer of the question or problem you are about to pose (hidden from the learner until it is answered or concluded); `grading` — the learner's submitted expression against your committed answer (the outcome shows at once, the expressions after the problem concludes); `lesson` — a result you state in the lesson (shown at once). The result is `agreed` (proved equal), `disagreed` (proved different, or a counterexample was found) or `undecided` (neither — often equal only under a condition; add assumptions or treat the result as unchecked). Only these expressions are sent to Wolfram — never put quiz text or the learner's words in them. At most 5 checks per turn.

**`shared/15-accuracy.md`**, replacing "Thinking — derivations, computations, reasoning — stays yours.":
> Thinking stays yours: derive and reason yourself. When a result is a computation (a derivative, an integral, a simplification, a numeric value) and you have `math_check`, check it before it becomes a question's answer, a verdict or a stated result. A check verifies your work; it never replaces it.

**`teacher/40-jobs.md`**, "Never for internal reasoning or math" becomes:
> Never for internal reasoning or math — computations go to `math_check`.

**`teacher/35-math-check.md`** (new):
> ## Math checks
>
> Before you pose a `quiz` or `explain` whose correct answer comes from a computation, check it with `math_check` (`purpose: "question"`): your committed result against the computation it comes from — `D[Sin[2 x], x]` against `2 Cos[2 x]`. `agreed`: pose it. `disagreed`: your answer is wrong; fix it, and check again before posing. `undecided`: add the missing assumption, or pose without relying on the check — never claim it was checked. When you state a computed result in the lesson that the learner will build on, `purpose: "lesson"`. Conceptual questions need no check. If the check fails or is unavailable, say so in one line and continue; your own derivation stands, flagged as unchecked.

**`practice/00-base.md`**, new paragraph after **Fact checks.**:
> **Math checks.** When a learner's claimed answer is an expression and your commitment is an expression, check equivalence with `math_check` (`purpose: "grading"`) before the verdict — an equivalent form written differently is correct, and you say so. When it disagrees, use the counterexample only to locate the first break for yourself; the hint ladder still applies and the correction stays hidden. Before posing a problem whose model solution rests on a computation, check it (`purpose: "question"`). `undecided` or a failed check: grade by your own reading, and never say it was checked.

**Card copy**:
- Live: "Checking with Wolfram".
- Rows:
  - "Checked with Wolfram · equal" (agreed)
  - "Wolfram · not equal" (disagreed)
  - "Wolfram · couldn't decide" (undecided)
  - "Wolfram check failed" (error)
- Expanded body: the expressions as `lhs = rhs`, assumptions, counterexample, raw output.
- While a grading check's expressions are hidden: "Expressions shown after the problem is concluded".
- Reveal label: "Checked with Wolfram".
- Settings row: "Math check", with the hint "Checks computed answers and equivalent forms with Wolfram".

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle VI skills unavailable | Environment | Substitute: manual review against DESIGN.md and screenshots, documented in progress.md |
| New runtime dependency | Oliver approved it | Hand-written JSON-RPC over HTTP would duplicate session, resume and cancel handling that pi-mcp already tests |
