# TurnStrip

Zone 1 of the prompt bar: says it is the learner's turn and what kind of turn it is. Hand-written from `components/prompt-controls.tsx`.

- Kind is one of Lesson check, Question, Prediction, Explain, Recall, Problem.
- Expanded: label, kind and a collapse control.
- Collapsed (reading history): label, kind, a one-line plain-text teaser and a quiet Answer (or Solve) button. Strip markdown from the teaser.
- The amber `primary` on `primary-soft` label is the only accent in the strip.
- Consumer provides: `kind`, optional `teaser`, `actionLabel`, `onAction`, `onCollapse`.
