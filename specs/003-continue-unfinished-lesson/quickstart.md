# Quickstart: verify feature 003

1. `npm run dev:review` (review data). Make sure one teaching session has a plan with topics left and no pending question, and one has both a pending question and topics left.
2. Open Home. "Waiting for you" lists Answer/Solve rows first, then a "Lesson" row: "{title} · {ago}", "{n} of {total} topics left · next: {topic}", Continue. The heading count includes it.
3. The session with a pending question shows one Answer row with the progress line under its teaser, and no Lesson row.
4. Press Continue. The lesson opens at the bottom with "Continue with {topic}" in the composer, not sent. The URL has no `continue` parameter.
5. Go back, type a draft in that lesson, return to Home and press Continue: the draft is unchanged.
6. Answer a check on the next topic, return to Home: the count and next topic moved.
7. Practice sessions never show a Lesson row or a progress line.
8. Check at 320, 390 and 1440 px, keyboard only, visible focus.
9. `npm test && npm run lint && npm run typecheck && npm run build`.
