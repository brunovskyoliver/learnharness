# Quickstart: verify feature 007

1. Unit (`tests/math-check.test.ts`): input problems (forbidden characters, a lone `=`, unbalanced brackets, too long); `wolframCheckCode` splices inside parentheses and includes assumptions (default `True`); `parseWolframCheck` covers agreed, disagreed with a counterexample, undecided with the reduced form, `$Failed`/syntax, and no verdict.
2. Tool (`tests/math-check-tool.test.ts`): the in-memory MCP pair stubs Wolfram. Check the three outcomes and their details; unavailable gives an error result; a dropped connection triggers a reconnect and a successful retry; abort cancels; the 6th call is refused; hosted mode without a tenant is refused.
3. Bindings (`tests/math-check-bindings.test.ts`):
   - a question check is hidden before the quiz is answered, visible after, and the quiz gets `wolframChecked`;
   - a disagreed-then-agreed sequence is labelled, and agreed-then-disagreed is not;
   - a grading check shows its outcome while the problem is active, with expressions hidden until conclude, and the conclude card gets the label;
   - lesson checks are visible at once;
   - a question check with no question in the same turn is visible.
4. Render (`tests/render-math-check.test.tsx`): the row copy for each outcome and for errors; nothing rendered while hidden; hidden expressions show the placeholder; AnsweredCard and ConcludeCard show "Checked with Wolfram" only when flagged.
5. Registries: math_check is in the teacher and practice tool lists, absent for the prober, and dropped by the toggle.
6. Live (opt-in): `LH_LIVE_WOLFRAM=1 npx tsx --test tests/math-check-live.test.ts` runs the real check for an agreed case and a disagreed case.
7. Browser: a seeded practice session and lesson with math_check results, on a production build. Screenshots at 1440, 390 and 320 px are saved to `~/agent-runs/2026-10-28-feature-007/shots/`.
8. `npm test && npm run lint && npm run typecheck && npm run build`; perf vs the baseline; `smoke-sidebar-ui`.
