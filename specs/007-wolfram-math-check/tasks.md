# Tasks: Wolfram math check through an MCP client layer

**Input**: `specs/007-wolfram-math-check/` plan.md, spec.md, research.md, data-model.md, contracts/math-check-tool.md, quickstart.md

**Tests**: included. The constitution requires tests without model requests, and the spec requires stubbed MCP tests (SC-006).

## Phase 1: Setup

- [X] T001 Performance baseline: copy `~/agent-runs/2026-10-28-feature-005/perf.sh` to `~/agent-runs/2026-10-28-feature-007/perf.sh`, then run `perf.sh baseline` on a production build of the current tree
- [X] T002 Add the runtime dependency `@earendil-works/pi-mcp` pinned at `1.4.0` in `package.json` and `package-lock.json` (`npm install --save-exact`)

## Phase 2: Foundational (blocks all stories)

- [X] T003 [P] Failing tests in `tests/math-check.test.ts`:
  - `mathCheckInputProblems` rejects: `lhs`/`rhs` empty or over 400 characters; `assumptions` over 200; characters outside the whitelist (`"`, `;`, `:`, `` ` ``, `#`, `$`, `@`, `%`); a lone `=` (allows `==`, `<=`, `>=`, `!=`); unbalanced or crossed brackets.
  - `wolframCheckCode` splices each value inside parentheses, defaults assumptions to `True`, and wraps the program in `TimeConstrained[…, 20, …]`.
  - `parseWolframCheck` handles `Out[1]= "OUTCOME: agreed"`, disagreed with `COUNTEREXAMPLE`, undecided with `REDUCED`, `REASON: timed out`, and a quoted string with `\n` escapes. It throws on `$Failed` or `::sntx` ("Wolfram could not read the expressions") and on a missing outcome.
- [X] T004 Implement `src/core/math-check.ts` (`MathCheckInputSchema` with `purpose` enum `question|grading|lesson`, `mathCheckInputProblems`, `wolframCheckCode`, `parseWolframCheck`, `MathCheckDetails`, `MATH_CHECK_TOOL`, `MATH_CHECK_LIMIT = 5`) per research R2/R3, and export it from `src/core/index.ts`
- [X] T005 [P] Failing tests in `tests/mcp-client.test.ts`, using `createInMemoryTransportPair` from `@earendil-works/pi-mcp/testing` with a scripted server:
  - `callMcpTool` returns the text content;
  - a transport failure on the first call leads to a reconnect and a retry that succeeds;
  - two consecutive failures throw "unavailable";
  - an aborted signal rejects;
  - an unknown server id throws;
  - hosted mode without a tenant throws.
- [X] T006 Implement `src/agent/mcp/servers.ts` (fixed list: `wolfram` → `https://agenttools.wolfram.com/mcp`, `streamable-http`, timeout 30 s) and `src/agent/mcp/client.ts`:
  - `callMcpTool(serverId, tool, args, signal)`;
  - per-tenant clients via `tenantScoped("__lhMcpClients", …)`;
  - lazy connect, with pi-mcp loaded by dynamic `import()`;
  - a transport factory seam for tests (`setMcpTransportFactory`);
  - reconnect and retry once on transport errors.
- [X] T007 [P] Failing tests in `tests/math-check-tool.test.ts`, with a stubbed `call`:
  - each outcome produces the model text from the contract and `details`;
  - an invalid input returns `invalidInputResult`;
  - "unavailable" gives an error result with the contract text;
  - a syntax failure gives an error result;
  - the 6th call in one tool instance is refused;
  - the code sent equals `wolframCheckCode(input)`;
  - only `code` and `timeConstraint` are sent.
- [X] T008 Implement `src/agent/tools/math-check.ts` (`mathCheckTool({ call? })`, which defaults to `callMcpTool("wolfram", "WolframLanguageEvaluator", …)`) with the tool description from plan.md verbatim, `serverExecute` conventions and the per-instance counter
- [X] T009 Add `math_check` to `TOGGLEABLE_TOOLS` in `src/core/pending.ts` and `toolActivityLabel` ("Checking with Wolfram"); register `math_check` in `createTeacherTools` (`src/agent/tools.ts`, filtered by toggles) and in `practiceTools(ctx, enabled?)` (`src/agent/tools/practice.ts`, filtered for `math_check` only), passing `opts.toolToggles` from `createPracticeAgent` (`src/agent/teacher-agent.ts`); update the pinned registry lists in `tests/practice-agents.test.ts` and `tests/question-tools.test.ts`, and add assertions for prober absence and toggle removal

## Phase 3: User Story 1 — Practice accepts a correct step written differently (P1)

**Goal**: practice checks equivalence before a verdict; the grading row shows its outcome with expressions hidden until conclude; the conclude card shows the label.
**Independent test**: a seeded practice session with grading checks renders the correct rows and labels before and after conclude.

- [X] T010 [P] [US1] Failing tests in `tests/math-check-bindings.test.ts` for grading:
  - binds to the active problem;
  - `expressionsHidden` stays true until a `conclude` follows, then false;
  - `hidden` stays false;
  - an agreed `question` check before the `problem` call labels both the problem and its conclude;
  - a lesson check is never hidden.
- [X] T011 [US1] Implement `mathCheckBindings(messages)` in `src/core/math-check.ts` (research R5) and decorate parts in `projectView` (`src/core/view.ts`): `part.mathCheck` on `tool-math_check`, and `part.wolframChecked` on question, problem and conclude parts
- [X] T012 [P] [US1] Failing render tests in `tests/render-math-check.test.tsx`:
  - row copy per outcome ("Checked with Wolfram · equal", "Wolfram · not equal", "Wolfram · couldn't decide", "Wolfram check failed");
  - hidden renders nothing;
  - `expressionsHidden` shows "Expressions shown after the problem is concluded" and no lhs/rhs;
  - visible shows `lhs = rhs`, assumptions and the counterexample on expand;
  - ConcludeCard shows "Checked with Wolfram" only when `wolframChecked`.
  - The label is plain text in the accessibility tree, not an icon only (FR-015).
- [X] T013 [US1] Implement `components/artifacts/math-check-card.tsx` and register it as `math_check` in `components/artifacts/index.ts`; `components/artifacts/live-tool-card.tsx` hides the streaming input body for `math_check`; `components/practice-cards.tsx` ConcludeCard shows the label
- [X] T014 [US1] Add the **Math checks.** paragraph from plan.md to `src/agent/prompts/practice/00-base.md`, and the reworded sentence to `src/agent/prompts/shared/15-accuracy.md`

## Phase 4: User Story 2 — Teacher checks computed answers before posing (P2)

**Goal**: question checks are hidden until the quiz or explain is answered; the answered card shows the label when the last bound check agreed.
**Independent test**: a seeded lesson with a question check, an answered quiz and an unanswered one.

- [X] T015 [P] [US2] Failing binding tests:
  - a question check is hidden while the quiz is unanswered and visible after a real answer result;
  - the quiz gets `wolframChecked` only if the last bound check agreed (disagreed→agreed is labelled, agreed→disagreed is not);
  - a check with no question before the next user message is visible;
  - explain works like quiz.

  Also a failing render test: AnsweredCard shows "Checked with Wolfram" for a flagged quiz (in the Why/explanation area) and a flagged explain (by the committed answer).
- [X] T016 [US2] Pass `checked` from `components/chat.tsx` to `AnsweredCard` (`components/answered-card.tsx`) and render the label
- [X] T017 [US2] Add the new fragment `src/agent/prompts/teacher/35-math-check.md` and the `40-jobs.md` line from plan.md; update prompt snapshot or segment tests if any pin the list

## Phase 5: User Story 3 — Honest states (P3)

**Goal**: failures and undecided outcomes never carry the label.
**Independent test**: render and binding tests for error and undecided parts.

- [X] T018 [P] [US3] Tests: an error part renders "Wolfram check failed" with the reason on expand and never labels its item; an undecided bound check doesn't label its quiz; an aborted turn (part left `input-available` with no result) renders the quiet "not finished" row
- [X] T019 [US3] Settings toggle row "Math check" with hint "Checks computed answers and equivalent forms with Wolfram" in `components/settings/agent-section.tsx` (`TOGGLE_TOOLS`, `TOOL_COPY`); settings write validation accepts `math_check` (via `TOGGLEABLE_TOOLS`)

## Phase 6: Polish

- [X] T020 [P] Opt-in live test `tests/math-check-live.test.ts`, skipped unless `LH_LIVE_WOLFRAM=1`: agreed `D[Sin[2 x], x]` vs `2 Cos[2 x]`; disagreed `(a + b)^2` vs `a^2 + b^2`. Run it once and log to `~/agent-runs/2026-10-28-feature-007/live-wolfram.log`
- [X] T021 [P] DESIGN.md (math check row and label), PRODUCT.md (one sentence), docs/ui-review.md
- [X] T022 Browser check: seeded practice session and lesson with math-check results (`~/agent-runs/2026-10-28-feature-007/seed-math.ts`, `check-math.mjs`) on a production build; screenshots at 1440, 390 and 320 px in `shots/`, plus the settings toggle; manual DESIGN.md review
- [X] T023 `perf.sh final` vs T001 (within 5%)
- [X] T024 `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `smoke-sidebar-ui`; write the Report in `specs/007-wolfram-math-check/progress.md`

## Dependencies

- T001–T002 → T003–T009 (foundation) → US1 (T010–T014) → US2 (T015–T017) → US3 (T018–T019) → Polish.
- US2 and US3 reuse the bindings and card from US1, so they run after it.

## Parallel examples

- Foundation: T003, T005 and T007 (test files) in parallel; then T004, T006 and T008.
- US1: T010 and T012 in parallel, then T011 and T013.
- Polish: T020 and T021 in parallel.

## Implementation strategy

The MVP is the foundation plus US1 (practice grading). Then US2 (the teacher's pre-checks) and US3 (honest states and the toggle). One commit for the whole feature, following the 003–006 pattern.
