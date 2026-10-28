# AnswerField

Zone 3 of the prompt bar: where the learner writes. Hand-written from `components/prompt-controls.tsx`.

- Sits directly on the shell: no inner box, fill or edge.
- A visible label ("Your thinking", "Your answer") that brightens from `ink-2` to `foreground` while the field has focus. With a label, no placeholder.
- Chat has no label; its placeholder says what the field is for ("Ask about this lesson").
- Text is the `reading` style (17/27).
- Consumer provides: `label` or `placeholder`, `id`, `rows`.
