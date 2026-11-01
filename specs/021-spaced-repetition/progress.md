# Feature 021: Flashcards and spaced repetition
Stage: done, not merged or deployed
Updated: 2026-11-01

## Decisions

Owner-facing decisions are in spec.md, Clarifications. Technical ones:

- `ts-fsrs` is a dynamic import in one server file, so the barrel importing the handlers doesn't load it.
- Fuzz is off, so a predicted interval is exactly what the rating does.
- Undo and crash repair share one rule: the log decides each card's standing review.
- `src/core/card-schedule.ts` and `card-evidence.ts` stay out of the browser barrel.
- The cache for weak ideas is keyed on graph revision and each chat's `updatedAt`.
- The global focus rule skips `tabindex="-1"`, so the Answer region draws its own outline.

## Log

- The first test run assumed stability grows between two same-day steps. FSRS short-term steps don't promise that, so the assertion went.
- Markdown fronts lose `$` in the list's plain text, which the browser check's row match hit. The check now matches the words before the formula.
- Audit: Save card was disabled while a side was empty, with no reason given. It now says which side and focuses it.

## Report

**Built**
- Hand-written cards, with no model. The file-backed store with an append-only log and crash repair. FSRS through a port.
- `/review`: daily queue, reveal endpoint, ratings with predicted intervals, Space and 1 to 4, undo, history, suspend, edit, delete with Restore and a confirmed Delete for good, local drafts that survive a reload.
- Generation from a note, a PDF passage and a lesson, on an explicit click, through the submit-agent seam, with cost and abort on the dock. Drafts kept one by one.
- Duplicate warnings at creation, edit and on drafts. Source links marked gone on read. Weak ideas read only, with three queue focuses.
- Home's row, sidebar, palette, Library menu, PDF bubble, session context view, cheat sheet.

**For the owner**
- **Exception candidate, constitution III**: deleting a session keeps its cards and the session's title as text, as asked. That goes beyond "Deleting a session removes its traces" and its 009 exception. Feature 017's saved passages made the same call. An amendment would settle both.
- **Constitution II's wording**: it derives understanding from "the event ledger", which `src/store/graph.ts` purged on 2026-09-27. The ledgers hold no learner evidence, so the brief's "read learner evidence through graph queries" could only be half true. Nodes and their provenance come through graph queries; the evidence itself comes from graded transcripts. The ledger test still holds, and transcripts are compared too.

**Verified**
- `npx tsc --noEmit`: clean. `npx eslint .`: clean. `npx next build`: pass, 4 tracing warnings, the same 4 as the base.
- `TMPDIR=~/lh-tmp CHROME_PATH=/snap/bin/chromium NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx`: 3757 tests, 3755 pass, 0 fail, 2 skipped. 56 of them are new (`tests/cards.test.ts` 40, `tests/render-review.test.tsx` 16). An earlier full run had one failure each in `tests/chatgpt-auth.test.ts` and `tests/chatgpt-connection-ui.test.tsx`; alone they passed 34 of 34 and 52 of 52, and both passed in the final run. The second isn't on the known-flake list; it failed on what looks like the same shared state, but that wasn't proven.
- `scripts/check-review-ui.mjs`: pass, 59 PASS lines at 1440, 390, 320. Screenshots in `~/agent-runs/2026-10-31-workspace/shots/review-*`, read for the main states.
- `scripts/check-workspace-ui.mjs`, `scripts/check-documents-ui.mjs`: pass.
- Standalone server, by hand: creating a card and revealing it loads `ts-fsrs`, and `/review` answers 200.
- `ts-fsrs` strings in `.next/static`: none. Installed size: `ts-fsrs` 992 KB plus its dependency `@open-spaced-repetition/srs-kit` 804 KB, about 1.8 MB, server only.
- Initial JS gzipped, measured with the same script (`~/agent-runs/2026-10-31-workspace/measure-html.mjs`):

| Route | 019-020 | Now | Change | Against pre-014 |
| --- | --- | --- | --- | --- |
| `/` | 287.6 KB | 288.8 KB | +0.4% | +3.4% (279.4) |
| `/library` | 294.1 KB | 293.2 KB | -0.3% | +3.6% (282.9) |
| `/chat/new` | 279.2 KB | 279.5 KB | +0.1% | +3.6% (269.9) |

  Under the 5% ceiling. `/library` fell because chunking shifted (16 scripts, not 15), not because of anything removed, so don't count that room as won. This isn't the constitution's throttled benchmark, whose baseline is still an open TODO.

**Skills**
- `web-design-guidelines` (rules fetched, paraphrased by the fetch tool rather than verbatim) and `impeccable` (context, audit playbook, detector with no findings) were run, and their findings fixed: placeholders, Save stating an empty side, focus on the Answer region, a paged list, field names, overscroll, reduced motion. Left as is: Title Case in the guidelines, since DESIGN.md's strings are sentence case and DESIGN.md wins; the Library row's menu navigating by `window.location`, as Download does.
- `speckit-feature` and `shadcn` were not run: artifacts were written by hand under the no-questions rule, using existing primitives. `node_modules/next/dist/docs/` wasn't read: the route, `Link` and `useSearchParams` follow `/library` as it stands, with no new Next API.

**Tests changed on purpose**
None outside the new files. Golden fixtures are unchanged.

**Not run or not exercised**
- A real model call: generation is covered by the scripted engine in tests only. In the browser, the Generate button itself was never clicked, since no model is configured there: the check covers the refusal, and seeded drafts on disk. The dock row was asserted through `activityFeed()`, not seen rendered.
- PDF bubble's Make flashcards and the session context link: render and code only, with no browser path through them.
- Weak-idea pills in a browser, and reduced motion: unit tests and CSS only.
- Hosted mode in a browser, Electron, and a Docker image. Tenant isolation is by handler tests.
