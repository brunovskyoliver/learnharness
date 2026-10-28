# Data model: Study ink and prompt bar

No persisted data changes. Two client-side models drive the UI.

## Prompt bar state (derived, not stored)

Derived in `DockFooter` from existing values: `pending` (question), `practice` (active problem), `nextReady`, `busy`, `canSend`, `expanded`, `configured`/`zeroKeys`.

| State | Turn strip | Body | Field label | Primary action |
|-------|-----------|------|-------------|----------------|
| chat-empty / chat-draft | none | none | placeholder only | round send (disabled when empty) |
| streaming | none | none | "Steer the answer" placeholder when typing | Stop (labelled) |
| question-expanded | Your turn · kind · collapse | question, note, choices, confidence row | Your thinking / Your answer | Submit answer |
| question-compact | Your turn · teaser · Answer | hidden | hidden | none |
| problem-expanded | Your turn · Problem · collapse | statement | Your thinking | Skip + Submit |
| problem-compact | Your turn · teaser · Solve | hidden | hidden | none |
| between-problems | none | none | placeholder | Next problem (labelled) |
| no-setup | unchanged | unchanged | unchanged | toolbar shows setup button instead of model/thinking |

Transitions are unchanged from today (compact on history scroll, expand at bottom, focus/composition force expansion).

## Design tokens

Ground, raised, raised-2; ink, ink-2, ink-3; accent; edge, hairline; type steps 12–40; radii 6/10/full; motion 160/240 ms. Values in research.md R1, R3, R5. Custom background preference keeps deriving card/accent/border from the chosen ground (`derivedPalette`).
