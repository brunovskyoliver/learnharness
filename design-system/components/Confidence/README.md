# Confidence

The confidence row under a lesson check's choices: four stops plus "I don't know". Hand-written from `components/question-dock.tsx`.

- Stops are Guessing, Unsure, Fairly sure, Certain; the app saves each as a probability (25, 50, 75, 95).
- "I don't know" is a text button, not a fifth choice row. Choosing it greys the stops and sends no confidence.
- The track sits on `background`; the selected stop on `surface-raised-2`.
- Consumer provides: `value` (0–3), `dontKnow`, `onChange`, `onDontKnow`.
