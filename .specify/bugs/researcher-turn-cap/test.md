# Bug Verification: Research job fails when the researcher spends its 12-turn cap

- **Slug**: researcher-turn-cap (explicit)
- **Tested**: 2026-10-28
- **Assessment**: [assessment.md](assessment.md)
- **Fix**: [fix.md](fix.md)
- **Result**: partial

## Summary

The hosted failure (12 tool-call turns and no brief) was replayed offline with a scripted engine. After the fix the researcher returns a brief from one wrap-up call, and nothing else regressed. The result is partial because the bug was not reproduced against a live provider.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproduction (post-fix, scripted) | `tests/researcher-wrap-up.test.ts` case 1: 12 `web_search` turns, then text | pass | Brief returned; 13 calls billed; wrap-up request holds prompt, tool history, wrap-up message, declared tools |
| Reproduction (live provider) | Long research question on the hosted ChatGPT provider | not-run | Needs a deployed build and a question that uses all 12 turns |
| New tests | `NODE_ENV=test npx tsx --test tests/researcher-wrap-up.test.ts` | pass | 3 pass, 0 fail |
| Regression suite | `npm test` | pass | 2560 pass, 0 fail |
| Type-check | `npm run typecheck` | pass | |
| Lint | `npx eslint` on the 3 changed files | pass | |

## Output Excerpts

```
ℹ tests 2560
ℹ pass 2560
ℹ fail 0
```

## Residual Risks

- Real models may still call a tool in the wrap-up despite the instruction. That returns empty text and the job fails as it did before the fix.
- Provider acceptance of the wrap-up request (tool history + declared tools + trailing user message) is only covered by the faux engine here.

## Recommendation

Hold open until a live check: after the next deploy, find a research job with `usage.steps` of 13 and a `done` status, or run a deliberately broad research question once. Close the bug when one such job finishes with a brief.
