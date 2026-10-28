# Fix: Math check row and Home edges

- **Slug**: design-review-007-home
- **Fixed**: 2026-10-28
- **Approved by**: Oliver ("do all fixes", 2026-10-28)

## Changes

1. Reading edge: `tool-call-card.tsx`, `live-tool-card.tsx` and `math-check-card.tsx` use `lh-reading` (the column prose, thinking rows and phase heads use) instead of `w-full max-w-2xl`. Sizes stay on the summary and panel, because `.lh-reading` is unlayered and would win over a `text-sm` on the same element. The live math check row wraps its contents for the same reason.
2. Raw reply: the math check panel shows "Wolfram's reply" only when the outcome is undecided.
3. Failure reason: the Error row renders in sans (`mono={false}`), in destructive ink.
4. Selection: `select-none` moved from `details` to `summary` in the three tool cards.
5. Copy: "Wolfram · equal", "Wolfram · not equal", "Wolfram · couldn't decide", "Wolfram · check failed", "Wolfram · check not finished". "Checked with Wolfram" is now only the answered and concluded card label. DESIGN.md and docs/ui-review.md are updated.
6. Home meta: the new `RowMeta` (`waiting-section.tsx`) renders a truncating title and a `shrink-0` "· time". The waiting row, the lesson row and the calibration miss row use it.
7. Home edges: removed `px-1` from the section headers and the text under them in the waiting, calibration and graph sections.

## Tests

- `tests/render-math-check.test.tsx`: new copy; no raw reply for agreed or disagreed; raw reply for undecided; `lh-reading`, `select-none` on the summary only, failure reason not in mono.
- `tests/render-waiting-section.test.tsx`: the meta truncates the title, not the time; no `px-1`.
- `tests/render-calibration-section.test.tsx`: the meta assertion follows the new markup.
