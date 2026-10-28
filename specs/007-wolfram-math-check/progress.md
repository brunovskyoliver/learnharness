# Progress: 007 Wolfram math check

## Stage

Implemented and verified 2026-10-28. Commit, push and PR are recorded in the Report below. Not deployed.

## Decisions

- **Oliver's decisions** (research report, 2026-10-28): the server-run route (the session's model picks the tool, the LearnHarness server calls MCP); the `@earendil-works/pi-mcp` dependency; no per-call consent, labelled "Checked with Wolfram"; a fixed server list; teacher pre-question checks hidden until answered.
- **Agent decisions under Oliver's delegation** ("I fully support your judgment"), recorded in spec Clarifications:
  - hosted and desktop;
  - 5 checks per turn;
  - the doctrine wording;
  - revised after a live probe: one fixed evaluator template instead of exposing WolframAlpha/WolframContext (research R1–R2).
- **Analysis remediations** (F1, F2, U1): grading expressions are hidden until conclude (spec FR-006); SC-003 accounts for the first-connect cost; an accessibility assertion was added to the label test.
- **Implementation decisions:**
  - A failed math check renders its own row instead of the generic "Retrying…" line. "Retrying…" would be a false state, because nothing retries an unavailable service. Invalid input and the per-turn limit still show "Retrying…" (`isShownMathCheckFailure`).
  - The settings switch's accessible name is "tool math check" (test id `toggle-tool-math-check`). The other switches are unchanged.
  - A question check still waiting for its question at the end of the record stays hidden. The live turn may be about to pose it, and showing the result first would leak the answer.

## Log

- T001: baseline (production build of `6f303af`): JS 712,593 B, API 17,191 B, ready 738 ms, FCP 88 ms (medians of 9).
- T002: `@earendil-works/pi-mcp` 1.4.0 pinned.
- T003–T004: `src/core/math-check.ts` (schema, whitelist, template, parse, read-time fold); `tests/math-check.test.ts` (12).
- T005–T006: `src/agent/mcp/servers.ts`, `src/agent/mcp/client.ts`, with per-tenant lazy clients, one reconnect, no retry after a timeout or a server tool error, and abort; `tests/mcp-client.test.ts` (9, in-memory MCP server).
- T007–T008: `src/agent/tools/math-check.ts`; `tests/math-check-tool.test.ts` (7).
- T009: registries (teacher filtered by toggles; practice drops only `math_check` on its toggle), `TOGGLEABLE_TOOLS`, the activity label; pinned lists updated in `tests/question-tools.test.ts`, `tests/practice-agents.test.ts`, `tests/render-settings.test.tsx` and `tests/tool-toggles-bridge.test.ts`.
- T010–T011: view decoration (`part.mathCheck`, `part.wolframChecked`); `tests/math-check-bindings.test.ts` (12).
- T012–T013: `components/artifacts/math-check-card.tsx`, registry entry, a live row without input, the label on ConcludeCard; `tests/render-math-check.test.tsx` (9).
- T014, T017: doctrine in `shared/15-accuracy.md`, `teacher/40-jobs.md`, the new `teacher/35-math-check.md`, and `practice/00-base.md`.
- T015–T016: the AnsweredCard label via `chat.tsx`.
- T018–T019: honest-state tests; the settings row "Math check".
- T020: live test against Wolfram Cloud through the real tool and client (`~/agent-runs/2026-10-28-feature-007/live-wolfram.log`):
  - agreed in 5.1 s (including the connection);
  - disagreed with {a -> 3, b -> 2} in 3.7 s;
  - undecided, then agreed with `x > 0`, in 3.6 and 3.7 s.
- T021: DESIGN.md (Math check section), PRODUCT.md, docs/ui-review.md.
- T022: browser check on a production build with isolated seeded data (`seed-math.ts`, `check-math.mjs`, `check-math.log`):
  - Lesson: three rows (two equal, one failed); the check for the unanswered quiz is hidden; one label on the answered quiz.
  - Practice, concluded: two rows, with the label on the conclude card.
  - Practice, active: the pre-problem check is hidden; the grading row shows "Wolfram · not equal" and "Expressions shown after the problem is concluded".
  - Settings row present. Overflow 0 at 1440, 390 and 320 px. Screenshots are in `shots/`.
  - The first run showed the failed check as "Retrying…"; fixed (Decisions).
- T023: final JS 713,064 B (+0.07%), API unchanged, ready 706 ms, FCP 84 ms. Within 5%.
- T024: `npm test` 2681/2681, lint, typecheck, build, and `smoke-sidebar-ui` (exit 0) all pass.

## Report

**What changed**
- New `math_check` tool for the teacher and the practice agent. It checks whether two expressions are equal by running one fixed Wolfram Language program in Wolfram's cloud kernel, through a new MCP client layer (`src/agent/mcp/`, fixed server list, per-tenant connections). Only the expressions leave the server.
- Transcript:
  - a quiet verdict row, expandable to the expressions, counterexample and Wolfram's reply;
  - checks for unanswered questions stay hidden, and grading expressions wait for the conclude;
  - answered and concluded cards show "Checked with Wolfram" when the check agreed;
  - failures read "Wolfram check failed" with the reason.
- Doctrine: check computed answers before posing them; in practice, check equivalence before a verdict and don't reveal the correction.
- Settings → Agent → Math check (on by default).

**How it was verified**
- 50 new tests (no network), plus 3 opt-in live tests that passed against Wolfram Cloud.
- Full suite, lint, typecheck and build.
- Browser check with screenshots at 3 widths, performance, and the sidebar smoke test.

**What is left**
- A live model run: whether the teacher and practice agents actually call `math_check` at the right moments with valid Wolfram syntax. Prompt-only behavior, such as no call for plain prose, can't be tested without a model (analysis U2). Do it after deploy, or in a local session with a model.
- Deployment to the AI server (separate approval). Hosted: confirm that Wolfram doesn't block the server's IP.
- The shadcn, impeccable and web-design-guidelines skills aren't installed in this environment. The UI was reviewed by hand against DESIGN.md.
