# Screen reader announcements while streaming

## Findings

- `components/ai-elements/conversation.tsx:18` sets `role="log"` on the whole transcript. `log` implies `aria-live="polite"`, so streamed block re-renders can be announced repeatedly or in fragments.
- The only explicit live regions today: session find count, a few `role="status"` loaders, the braille spinner.

## Proposed change

- Keep `role="log"` for semantics but set `aria-live="off"` on the transcript.
- Add one visually hidden `role="status"` region near the composer that announces turn state changes only: "Responding", "Response finished", "Stopped", and errors (errors use the alert from ticket 01).
- Do not move focus when a response finishes.

## Decisions (Oliver, 2026-10-27)

- Announce state changes only: "Responding", "Response finished", "Stopped". No response text.

## Verification

- Render tests for announcement transitions (submitted → streaming → ready, stop, error) with no duplicate announcements per transition.
- Manual VoiceOver pass on macOS Safari.
