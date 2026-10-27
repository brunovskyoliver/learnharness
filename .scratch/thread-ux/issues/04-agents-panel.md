# Background agents panel, job timer, slow demo builds

Reported 2026-10-27 by Oliver: the demo card said "building demo 14s" while the sidebar showed minutes; the background agents panel looked broken; the demo took very long.

## Findings

- The card computed elapsed time only on render, so it froze at the last job update.
- The panel's stop button sat at the row's vertical middle and drifted into the details when expanded; the face reserved room for "ChatGPT" as a cost, truncating the title; raw activity (`run_demo: clean`) and model ids showed.
- The slow demo: 11 minutes, 10 model calls, 33,775 output tokens (11,571 reasoning), 29 KB custom HTML. The teacher's brief demanded "single-file HTML", "zero dependencies" and a hand-made canvas 3D projection plus drag-to-pick and orbit controls, so the builder skipped the kit. The vision slot ran gpt-6-luna at xhigh.

## What changed

- `components/activity-text.ts`: plain activity lines and the shared elapsed format.
- Dispatch card ticks each second, uses the sidebar's format and names (Researcher, Demo builder, Figure maker, PDF reader).
- Panel: kind and elapsed on the first line, activity below, stop button inline on the first line, header on one line, cost only when priced in dollars, details list session link, short model name, context, model calls.
- Prompts: teacher briefs describe what the learner sees and controls, never how to build it, and stay short; the builder ignores implementation instructions and uses the kit unless it cannot show the core idea.
- Oliver's vision slot thinking: xhigh → medium (server settings, approved option 1).

## Verification

- 2448/2448 tests (new `tests/activity-text.test.tsx`), typecheck, lint.
- Browser check with the real job intercepted as running (`~/agent-runs/2026-10-27-learning-workflow-audit/agents/`): card ticks 5m 58s → 6m 00s with plain activity; stop button on the first line open and closed; header one line; no "ChatGPT" or raw tool text; readable at 390px. Card and sidebar can differ by one second (independent one-second ticks).

## Deployment

- Commit `be6294c` on `main`, pushed to GitHub. Built on the VM: `learnharness:agents-panel-20261027-be6294c` (`sha256:06d4c020…`), running, 0 restarts. Live routes 307/200/401, kit 200. Running container reads `thinkingLevel: "medium"` for the vision slot and contains the new client text and builder prompt.
- Rollback: `docker tag learnharness:rollback-agents-panel-20261027 learnharness:amd64 && docker compose up -d --no-deps --no-build app`; settings backup in `~/agent-runs/2026-10-27-agents-panel-deploy/` on the VM.

## Remaining

- Not yet observed: a model-built demo with the new prompts (expected to use the kit and finish much faster).
