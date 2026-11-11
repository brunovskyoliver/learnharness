# Bug Assessment: Practice follow-ups don't show in the problem card; checks need a click

- **Slug**: practice-hint-in-card
- **Created**: 2026-11-11
- **Source**: owner screenshots (live chat_mwc47ph6_1137a87d)
- **Verdict**: valid (UX; the data flow was correct)
- **Severity**: medium

## Symptom
1. After a wrong try, the tutor's hint ("Differentiate your answer: does it give back x²?") appeared only in the transcript; the problem card kept showing just the original problem, so it looked stale.
2. After Submit the card stayed expanded while the tutor worked.
3. A new problem (or question) arrived collapsed; the learner had to click "Go to it".

## Root cause
1. `PracticeDock` rendered only the statement and the field.
2. The card's open state is per problem, and a submitted try leaves the problem active.
3. `probeArrivalExpanded` / `revealArrival` returned collapsed by an earlier owner rule.

## Owner decisions (2026-11-11)
- Show the tutor's latest reply in the card, labelled "Tutor"; placeholder "Answer the tutor, or keep working".
- Submit closes the card; when the tutor's turn ends with the problem still open and a reply to show, the card reopens on it with focus.
- Every new problem and question opens itself (teach quizzes included; the reveal step is gone), focused on desktop.
