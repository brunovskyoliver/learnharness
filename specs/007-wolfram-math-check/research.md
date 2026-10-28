# Research: Wolfram math check

Probe evidence: run on 2026-10-28 from this Mac with throwaway scripts in `/tmp/agents/wolfram-probe/` (deleted afterwards) against `https://agenttools.wolfram.com/mcp` with `@earendil-works/pi-mcp@1.4.0`.

## R1. Server and tools

- **Decision**: Wolfram Cloud MCP over Streamable HTTP, with no auth. The tools it lists are `WolframContext`, `WolframLanguageEvaluator` (`code`, `timeConstraint`) and `WolframAlpha` (`query`). Only the evaluator is used, from server-written code.
- **Rationale**: WolframAlpha with `FullSimplify[...]` queries:
  - returned `True` for simple identities;
  - returned "No Results Found" for `Integrate[x Exp[-x], {x,0,∞}] == 1` and for a sum identity;
  - for unequal expressions, printed pages of plots and series instead of a verdict.

  The evaluator returned `True`, a reduced equation, or the unchanged input every time.
- **Alternatives**: exposing raw MCP tools to the model, which would give it free-form code and no verdict contract; a self-hosted SymPy sidecar, which needs an image change (later spec if needed).

## R2. Check template

- **Decision**: one `TimeConstrained[Module[...], 20, ...]` program.
  1. `FullSimplify[lhs == rhs, assumptions]`: `True` means agreed and `False` means disagreed.
  2. Otherwise, numeric sampling at 2 integer points (2–5) and 4 real points (0.3–2.9) over the expressions' Global symbols. Points that violate the assumptions are skipped. A relative difference above 1e-8 means disagreed, with the counterexample.
  3. Otherwise undecided, with the reduced form.

  Output lines: `OUTCOME: …`, then `COUNTEREXAMPLE: …`, `REDUCED: …` or `REASON: …`.
- **Probe results** (each 3.4–4.4 s, plus 3.0 s first connect):

| lhs == rhs (assumptions) | Outcome |
|---|---|
| D[Sin[2x],x] == 2Cos[2x] | agreed |
| … == 3Cos[2x] | disagreed, {x→5} |
| Sqrt[x^2] == x | undecided (the condition case) |
| … with x > 0 | agreed |
| Integrate[x Exp[-x],{x,0,∞}] == 1 | agreed |
| Sum identity over x[i], y[i] | undecided, so doctrine says to check the summand |
| Sin[Pi n] == 0 | disagreed at n = 1.51 |
| … with Element[n, Integers] | agreed |
| (a+b)^2 == a^2+b^2 | disagreed, {a→2, b→2} |
| `Sin[x` (unbalanced) | `$Failed` + `ToExpression::sntx`. The local validator catches this before sending. Any syntax message from Wolfram becomes an error result. |

- **Rationale**: the result is deterministic enough for a label, the counterexamples are useful to the grader, and undecided is honest.

## R3. Input safety

- **Decision**: `lhs` and `rhs` up to 400 characters, `assumptions` up to 200. Whitelist `[A-Za-z0-9 whitespace + - * / ^ ( ) [ ] { } , . < > = ! & |]`. Brackets must be balanced and properly nested. A lone `=` (assignment) is rejected, while `==`, `<=`, `>=` and `!=` are allowed. Each value is spliced inside parentheses into the server-written template.
- **Rationale**: without strings, `;`, `:` or `` ` ``, the model can't reach file, network or string-taking functions, and can't break out of the parentheses. The code runs in Wolfram's cloud kernel anyway, never on our host.

## R4. Connection handling

- **Decision**: one `McpClient` per tenant (`tenantScoped("__lhMcpClients", …)`), connected lazily on first use. Each call gets a 30 s timeout and the turn's abort signal. On a transport failure (`fetch failed`, `GOAWAY`, a closed session), the client is dropped and the call reconnects and retries once. If the retry fails too, the result is "The Wolfram check is unavailable: …".
- **Rationale**: the probe saw Wolfram's server send an HTTP/2 GOAWAY mid-run, and a reconnect fixed it. Per-tenant clients keep tenants apart (FR-010), and `tenantScoped` throws without a tenant in hosted mode.

## R5. Visibility rules

- **Decision**: `mathCheckBindings(messages)` is a pure read-time fold.
  - **`question` checks:** they bind to the next question or problem call (`quiz`, `explain`, `probe`, `recall`, `problem`) before the next user message or marker. A check is hidden until that item is resolved: a real answer result (`details != null`) for questions, a following `conclude` for problems. An unbound check (no question that turn) shows at once.
  - **`grading` checks:** they bind to the active problem (the last `problem` call with no `conclude` after it). The outcome is visible, and the expressions are hidden until the conclude.
  - **`lesson` checks:** always visible.
  - **Labels:** an item is `wolframChecked` when the last bound `question` check agreed. The conclude card takes its problem's label.
- **Rationale**: question tools end the turn, so "same turn, next question" is unambiguous. The rule needs no stored state, which fits Principles II and III.

## R6. Toggle

- **Decision**: `math_check` joins `TOGGLEABLE_TOOLS` and `TOGGLE_TOOLS`. The teacher registry already filters by toggles. The practice registry gets the toggles for this one tool and still doesn't filter its other tools.
