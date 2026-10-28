# Bug Fix: Research job fails when the researcher spends its 12-turn cap

- **Slug**: researcher-turn-cap
- **Fixed**: 2026-10-28
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

When the researcher's 12-turn cap runs out before it writes a brief, `runResearcherAgent` now makes one more call over everything it gathered, with the approved wrap-up message. The job fails as before only if that call also returns no text.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `src/agent/subagents/researcher.ts` | modified | Wrap-up continuation (`maxTurns: 1`) when the first run's text is empty; `onWrapUp` option; exported `WRAP_UP_MESSAGE`; cap moved to `MAX_TURNS` |
| `src/agent/subagents/runner.ts` | modified | `onWrapUp` sets the job activity to "writing the brief" |
| `tests/researcher-wrap-up.test.ts` | added test | Three scripted-engine cases |

## Diff Highlights (optional)

```ts
const { newMessages, text } = await runSubagent(tools, { ...base, prompt, maxTurns: MAX_TURNS });
if (text.trim()) return text;
opts.onWrapUp?.();
const wrapUp = await runSubagent(tools, {
	...base,
	messages: [...newMessages, { role: "user", content: WRAP_UP_MESSAGE, timestamp: Date.now() }],
	maxTurns: 1,
});
return wrapUp.text;
```

## Tests Added or Updated

- `tests/researcher-wrap-up.test.ts` "asks for the brief once the cap is spent and returns it": 12 search turns, then a brief. Checks 13 calls, 13 usage callbacks, and that the last request contains the original prompt, the gathered tool history, the wrap-up message and the declared `web_search` tool.
- "returns empty text when the wrap-up also produces none": the wrap-up is a single call and returns `""`, so the runner fails the job as before.
- "makes no wrap-up call when the brief arrives within the cap".

## Local Verification

- `NODE_ENV=test npx tsx --test tests/researcher-wrap-up.test.ts tests/researcher-pdf.test.ts tests/job-delivery-recovery.test.ts` → 28 pass, 0 fail
- `npm run typecheck` → clean
- `npx eslint` on the three changed files → clean
- `npm test` → 2560 pass, 0 fail
- Not verified against a live provider. The hosted failure needs a research question long enough to use all 12 turns.

## Deviations from Assessment

- **Tools stay declared in the wrap-up call** instead of being removed. pi-ai's Anthropic transport only sends `tools` when the transcript declares some, and Anthropic rejects tool-use history without tool definitions. `pi-agent-core` does not expose `toolChoice`. This was the fallback the assessment named, and Oliver chose it on 2026-10-28. The wrap-up message forbids tool calls and `maxTurns: 1` caps the run, so a tool call there gives empty text and today's failure.

## Follow-ups

- Deploy to the AI server and watch research jobs whose `usage.steps` is 13. Those are the ones the wrap-up saved.
