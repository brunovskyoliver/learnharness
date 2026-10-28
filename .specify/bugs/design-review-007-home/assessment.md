# Bug Assessment: Math check row and Home edges don't follow Study ink

- **Slug**: design-review-007-home
- **Created**: 2026-10-28
- **Source**: design review of PR 5 (feature 007) and Home (PRs 3–4), canvas https://claude.ai/artifact/B31xbCBeAcXLhDScZrdm4A (host claude.ai, review written in this session; not fetched)
- **Verdict**: valid
- **Severity**: low

## Report (summarized)

Seven findings from a visual review of a production build at 1440 and 390 px with seeded lesson and practice sessions. Oliver approved all seven on 2026-10-28 ("do all fixes"):

1. Quiet tool rows (math check, tool call, live tool) start at the card edge, about 95 px left of the reading edge that prose, thinking rows and phase heads share (DESIGN.md, Lessons and controls).
2. The math check panel repeats the parsed fields in Wolfram's raw reply ("Reduced to: True", then "REDUCED: True").
3. The failure reason, a sentence for the learner, is set in 12 px monospace. Study ink keeps mono for code and numeric metadata.
4. `select-none` on the whole `details` stops the learner copying the expressions and counterexample.
5. The headlines have three shapes ("Checked with Wolfram · equal", "Wolfram · not equal", "Wolfram check failed"). New copy: "Wolfram · equal", "Wolfram · not equal", "Wolfram · couldn't decide", "Wolfram · check failed", "Wolfram · check not finished". "Checked with Wolfram" stays as the label on answered and concluded cards only.
6. On phones, the meta line of a Home row ("{title} · {time}") truncates as one string, so a long title hides the time.
7. Home section headings ("Waiting for you", "Calibration", "Knowledge graph") carry `px-1`, so they start 4 px right of the page title and the cards (452 vs 448 at 1440).

## Symptom

The math check row and the generic tool rows sit off the transcript's reading edge. The math check panel is twice the height it needs, its failure text reads as code, and nothing in it can be selected. On Home, phone rows lose their time and section headings step 4 px in from the column edge.

## Reproduction

1. `npm run build && npm start` with review sessions seeded and a session holding `math_check` calls (agreed, disagreed, undecided, failed).
2. At 1440 px, open the session: the row's left edge is at x = 432, "Agent's thinking" at about 527. Expand rows: an agreed row shows "Reduced to" and the same field again in "Wolfram's reply"; a failed row shows its reason in red mono; text can't be selected.
3. Open Home at 390 px with a long session title: the meta reads "UI review · Math check (active problem) · 20…". At 1440, headings start at x = 452 and the title and cards at 448.

## Suspected Code Paths

- `components/artifacts/math-check-card.tsx` — `className="… w-full max-w-2xl select-none"`, `headline()`, the Error row (mono), the raw reply row.
- `components/artifacts/tool-call-card.tsx` — the same `w-full max-w-2xl select-none` wrapper (finding 1, 4).
- `components/artifacts/live-tool-card.tsx` — the running rows use `w-full max-w-2xl` (finding 1).
- `app/globals.css:.lh-reading` — the reading column (76ch, centred) that prose, thinking and phase heads use.
- `components/waiting-section.tsx:WaitingRow/LessonRow`, `components/calibration-section.tsx:MissRow` — meta as one truncated span.
- `components/waiting-section.tsx`, `components/calibration-section.tsx`, `components/home.tsx:GraphSection` — `px-1` on headers and the text lines under them.

## Root Cause Hypothesis

The tool rows predate the shared reading column and were never moved onto it. Feature 007 copied their wrapper, the mono rows and `select-none`. The headlines come from plan.md, before the label and the row copy were compared side by side. The Home meta is one text node, so `truncate` cuts its end. The `px-1` was an optical inset that doesn't match the title and rows. Confidence: high.

## Proposed Remediation

**Preferred**:
- Give the quiet rows the reading column. In the three tool cards, replace `w-full max-w-2xl` with `lh-reading`, keeping `text-sm` on the row so the prose size doesn't apply. Move `select-none` from `details` to `summary`.
- Math check card: show "Wolfram's reply" only for an undecided outcome; render the Error row in sans (`mono={false}`); use the new headlines.
- Home: render the meta as a flex line with a truncating title and a `shrink-0` "· time", in the two waiting rows and the calibration miss row. Remove `px-1` from the section headers and their text lines.
- Update DESIGN.md (Math check) and docs/ui-review.md for the copy.

**Files likely to change**:
- `components/artifacts/math-check-card.tsx`, `components/artifacts/tool-call-card.tsx`, `components/artifacts/live-tool-card.tsx`
- `components/waiting-section.tsx`, `components/calibration-section.tsx`, `components/home.tsx`
- `DESIGN.md`, `docs/ui-review.md`
- `tests/render-math-check.test.tsx`, plus any render test pinning the changed classes or meta markup

**Tests to add or update**:
- Math check render: the new headline copy; no raw reply for agreed or disagreed, raw reply for undecided; the error renders without `font-mono`; `select-none` only on the summary; the row uses `lh-reading`.
- Waiting and calibration rows: the time is its own non-shrinking element and the title truncates.

## Risks & Considerations

- `lh-reading` sets the prose font size. The rows keep `text-sm` explicitly, so their size doesn't change with the reading-size preference.
- Hiding the raw reply removes debugging detail on agreed or disagreed checks. The parsed fields carry everything the template returns.
- Spec 007 calls the agreed row "Checked with Wolfram · equal". The owner changed that on 2026-10-28, and FR-007 still holds: only agreed checks get the card label.

## Open Questions

None. All seven were approved by the owner.
