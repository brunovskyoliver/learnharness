# SendButton

The round send for plain chat, and the only fully round control in the system. Hand-written from `components/prompt-controls.tsx`.

- Use it only in the chat composer. Answers and problems use PrimaryAction.
- Disabled while the field is empty: `surface-raised-2` with `muted-foreground`.
- Consumer provides: `label` (accessible name, default "Send"), `disabled`, `onClick`.
