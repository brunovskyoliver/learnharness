# ChoiceRow

One answer option in the prompt body. Hand-written from `components/question-dock.tsx`.

- Full-width row with a radio mark (a checkbox mark for multi-select).
- Unselected: `ink-2` text on an `input` edge. Selected: `primary` edge and filled mark on `primary-soft`, so selection shows by shape as well as colour.
- At least 44px tall. Never dashed.
- Consumer provides: `children` (the option text), `selected`, `multi`, `onSelect`.
