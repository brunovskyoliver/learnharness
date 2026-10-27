# 001 Study ink and prompt bar: progress

## Stage

Implementing (plan and tasks done). Owner asked for an unattended full cycle on 2026-10-27; technical choices are logged in research.md (marked "agent").

## Decisions

Owner decisions (2026-10-27): warm near-black ground; amber accent; Newsreader titles; user turn as a raised block on the reading edge; visible Skip using the existing dismiss confirmation; usage percentage beside the ring; round send for chat only; scope = tokens, prompt bar, user turn and audit bug-level fixes (home and sidebar redesign deferred); constitution amended to 1.1.0 inside this feature.

## Log

- 2026-10-27: UI audit and design canvas published (https://claude.ai/artifact/5oZhYiW8seh7WbxCDn9nFh). Spec written; quality checklist passed.

- 2026-10-27: Baseline: `npm test` 2507 tests, 3 pre-existing failures (tests 96 and 97 in chatgpt-connection-ui, 773 provider runtime loader). Typecheck passes. `npm run lint` runs out of memory at the default heap; passes with `NODE_OPTIONS=--max-old-space-size=6144`.
- 2026-10-27: plan.md, research.md, data-model.md, contracts/prompt-bar.md, quickstart.md, tasks.md written.

## Report

Not started.
