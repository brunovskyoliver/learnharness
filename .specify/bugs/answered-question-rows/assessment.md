# Bug Assessment: Answered questions are heavy boxes and push the next question's tether up

- **Slug**: answered-question-rows
- **Created**: 2026-11-11
- **Source**: owner screenshot (live probe session, two answered setup questions, then a third)
- **Verdict**: valid (UX)
- **Severity**: medium

## Symptom
Each answered question rendered as a full card (shelf fill, rule border, every option listed). In dark mode the shelf is darker than the paper, so the boxes read as foreign to the transcript. A new question asked straight after two answered ones tethered to the tutor's last sentence, above both boxes, so it looked like it belonged before them.

## Root cause
- `AnsweredCard` always rendered the full record as a boxed card.
- `checkAnchorPartId` anchors only to assistant text; answered question parts were skipped over.

## Owner decisions (2026-11-11)
- Answered questions fold into one quiet row (the Wolfram/tool row register); clicking opens the full record on the shelf panel.
- All kinds fold; graded checks show the verdict in the row.
- A question asked right after answered ones tethers to the last answered row.
