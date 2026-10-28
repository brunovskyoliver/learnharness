# UserTurn

The learner's own message in the lesson transcript. Hand-written from `components/chat.tsx`.

- A `message-surface` block with `radius-lg`, on the same left edge as the assistant's prose (the reading column).
- "You" label in `meta` and `muted-foreground`; the text in `reading` and `foreground`, never faded.
- Plain text: learner input is not run through the math or markdown pipeline.
- Consumer provides: `children` (the message text).
