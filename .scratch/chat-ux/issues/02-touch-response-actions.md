# Response actions reachable on touch

## Findings

- `components/assistant-response.tsx:22`: the Copy response action is `opacity-0` and `pointer-events-none` until hover or focus-within. Touch devices have no hover, so the action is unreachable on phones and tablets.
- Space is already reserved (`h-6`), so showing it never shifts layout.

## Proposed change

- On coarse pointers (`@media (pointer: coarse)`) show the action at all times, with a hit area of at least 44×44 px. Desktop keeps hover/focus reveal.
- Actions stay after the response text in DOM order (already true).

## Decisions (Oliver, 2026-10-27)

- Always visible on coarse pointers with a 44px hit area; desktop keeps hover/focus reveal.

## Verification

- Render test for classes; browser at 390px with touch emulation: action visible and tappable, copy works, no layout shift.
