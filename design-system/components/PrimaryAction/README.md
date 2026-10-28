# PrimaryAction

The one labelled action that ends every prompt toolbar: Submit answer, Submit, Next problem or Stop. Hand-written from `components/prompt-controls.tsx`.

- Name it with a verb. Never an icon alone.
- One per toolbar, always at the right end.
- Amber (`primary` with `primary-foreground` text) when it is the learner's move. `quiet` (raised-2) for Stop and for the collapsed strip's Answer.
- Disabled keeps its label on `surface-raised-2` with `muted-foreground` text, so it never reads as on.
- Consumer provides: `children` (the label), `onClick`, optional `icon` ("stop" or "next").
