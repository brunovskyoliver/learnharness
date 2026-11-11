# Fix: answered-question-rows

- `components/answered-card.tsx`: a `SessionDetails` (open state kept per session, `answered/{toolCallId}`) with a `lh-quiet-summary` row (kind, verdict, question lead-in, " — " his answer) and the old record inside `lh-quiet-panel` without its own box. The reading-thinking block moved into the panel. Dismissed: one quiet line. Both carry `data-check-anchor-id`.
- `app/globals.css`: `.lh-row-inline` keeps the row's markdown (KaTeX included) on one line in the row's type.
- `components/study/check-geometry.ts`: walking back from a check, an answered question part met before any prose is its anchor.
- `components/study/check-thread.tsx`: looks up `data-check-anchor-id` too; a row's tether starts past its chevron (`rowEnd`).
- Tests: `tests/render-cards.test.tsx` (folded row), `tests/render-check-thread.test.tsx` (tether rule). DESIGN.md updated.
- Checked in the browser against a local copy of the reported session (1440 and 390 wide).
