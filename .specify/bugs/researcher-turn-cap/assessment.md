# Bug Assessment: Research job fails when the researcher spends its 12-turn cap

- **Slug**: researcher-turn-cap
- **Created**: 2026-10-28
- **Source**: pasted text (usage review of the hosted server, `~/agent-runs/2026-10-28-learnharness-usage/report.md`)
- **Verdict**: valid
- **Severity**: medium

## Report (verbatim or summarized)

> Background research job fails after minutes of work when the researcher returns an empty brief. Hosted evidence: job job_mvocmubf_b3066fdd (kind research, chat chat_mvockf18_2ab26c99) ran 2026-10-25 21:37:51 → 21:42:18 UTC and ended status error, "the researcher produced no text" (thrown at src/agent/subagents/runner.ts:390). The teacher received a steer "Research failed ... Continue with what you can establish" and the lesson went on without the research; a second research call a day later succeeded. Expected: an empty brief should not throw away the work — retry once and/or return the fetched sources with a short brief.

## Symptom

A research job runs for several minutes, searching and fetching pages, then ends as an error with "the researcher produced no text". The teacher gets no brief and carries on without it. Expected: the researcher writes a brief from what it gathered.

## Reproduction

1. Start a lesson whose research question needs many searches and fetches (hosted case: identify the Stanford course behind a YouTube playlist and find its notes and problem sets).
2. The researcher is still calling `web_search` / `web_fetch` at its 12th model call.
3. The loop ends after that call. The last assistant message holds only tool calls, so the job fails with "the researcher produced no text".

Evidence from the hosted job records:

| Job | Steps | Last step output tokens | Result |
|---|---|---|---|
| `job_mvocmubf_b3066fdd` | 12 (= cap) | 475 (a tool call) | error: "the researcher produced no text" |
| `job_mvpqluiy_a6a6d725` | 8 | 6,128 (the brief) | done |

## Suspected Code Paths

- `src/agent/subagents/researcher.ts:97-107` — `runResearcherAgent` runs `runSubagent` with `maxTurns: 12` and returns its `text`.
- `src/agent/subagents/pi-run.ts:83-88` — `finishTurn` ends the loop once `turns >= maxTurns`, whether or not the model has written its answer.
- `src/agent/subagents/pi-run.ts:146-153` — `text` is the text parts of the **last** assistant message only. A tool-call-only last message gives `""`.
- `src/agent/subagents/runner.ts:390` — an empty brief throws, and the catch at 393-400 finishes the job with `Research failed: …`.

## Root Cause Hypothesis

High confidence. The turn cap stops the researcher mid-research. Nothing asks it to write the brief before stopping, so the deliverable (the final message's text) is empty and the job is reported as failed. All the gathered pages are discarded. The step count of the failed job equals the cap exactly, and its last step is too small to be a brief.

## Proposed Remediation

**Preferred (approved by Oliver, 2026-10-28): a wrap-up turn.** In `runResearcherAgent`, when the run returns empty text, continue the same conversation once more:

- history: the run's messages (`newMessages`, which include the original research prompt and every search/fetch result);
- one appended user message, the wrap-up instruction (wording below);
- no tools, `maxTurns: 1`;
- same engine, abort signal, `onUsage` (so the extra call is billed in the job's usage) and provider-event recording.

Return that call's text. If it is still empty, behaviour stays as today: `runner.ts` throws "the researcher produced no text" and the job fails.

Proposed wrap-up wording:

> Your research budget is spent and no more tool calls are possible. Write your final brief now, in the required format, from what you have already found. Put anything you could not verify under Gaps.

`runResearcherAgent` sets the job's activity line during the wrap-up via a new optional `onWrapUp` callback; `runner.ts` uses it to set the activity to "writing the brief".

**Not chosen:** retrying the whole job (repeats ~4 min of work and can hit the cap again); raising the cap (rarer, still possible); a sources-only fallback brief.

**Scope:** researcher only. The PDF reader has its own loop; the demo builder's output is files, not final text; compaction already runs with no tools and one turn.

**Files likely to change**:
- `src/agent/subagents/researcher.ts`
- `src/agent/subagents/runner.ts` (activity line only)
- `tests/researcher-wrap-up.test.ts` (new)

**Tests to add or update**:
- Scripted engine that calls `web_fetch` on all 12 turns, then answers the wrap-up with text: the brief is returned, exactly 13 model calls are billed, and the wrap-up call carried no tools and ended with the wrap-up message.
- Same, but the wrap-up also returns empty: `runResearcherAgent` returns `""` (the runner keeps failing the job as today).
- A run that writes its brief within the cap makes no wrap-up call.

## Risks & Considerations

- **Tool-call history without tool declarations.** Some providers reject a request whose history holds tool calls when no tools are declared. If the ChatGPT provider does, the fallback is to keep the researcher's tools declared for the wrap-up call, with the instruction forbidding their use and `maxTurns: 1`. A tool call there just yields empty text and today's failure. This is checked during the fix; if it applies, I'll ask before switching.
- One extra model call on the cheap tier per capped run. It shows in the job's cost.
- Abort: the wrap-up uses the same abort signal, so cancelling the job still stops it.

## Open Questions

- None open. Wording of the wrap-up message and the "writing the brief" activity line await Oliver's approval with this assessment.
