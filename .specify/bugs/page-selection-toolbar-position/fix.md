# Bug Fix: Page selection bubble is not above the highlighted text

- **Slug**: page-selection-toolbar-position
- **Fixed**: 2026-10-31
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

The bubble now mounts in `.page-workspace` instead of the scrolling editor, so it has room above the first lines, and it measures from the selected text instead of the whole block.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `components/library/page-toolbar.tsx` | modified | `appendTo`, a text-based reference, flip and shift bounded by the workspace, reposition on scroll, hide when scrolled away |
| `components/library/page-editor.tsx` | modified | Passes the scrolling element to `PageBubble` |
| `scripts/check-library-ui.mjs` | added test | Bubble is above the selection and inside the pane |

## Tests Added or Updated

- `scripts/check-library-ui.mjs` (`selectFirst`): each first-line selection asserts the bubble is above the text and inside the pane.

## Local Verification

Measured with `~/agent-runs/2026-10-31-page-bubble/repro.mjs` at 1440 × 900, with the selected word at x 972–1025, y 145–169 in a pane starting at x=960:

| Selection | Bubble before | Bubble after |
| --- | --- | --- |
| Drag, first line | y 177–217, below | y 97–137, above |
| Select-all | x 999–1401, y 179–219, below and centred on the pane | x 968–1371, y 97–137, above |
| Double-click and triple-click | not measured | y 97–137, above |

Also checked with that script: the bubble follows a 60 px scroll, hides when the selection scrolls away, and Bold still applies.

Commands run:

- `LH_UI_TOOLS_ONLY=1 node scripts/check-library-ui.mjs` → passes, including the new bubble assertion at 1440 and 390 px.
- `npm test` → 3,422 tests, 3,395 pass, 0 fail.
- `npm run typecheck`, `npm run lint` → pass.

## Deviations from Assessment

- Kept `absolute` positioning, relative to the workspace, instead of the proposed `fixed`. With `fixed`, the first show landed at x=8, because the library computes coordinates while the element is still `absolute`.

## Follow-ups

- Near the pane's edges the bubble is wider than the space beside the text, so it stays inside the pane and is not centred on the word. At the first line it covers part of the toolbar's second row while text is selected.
- `impeccable` and `web-design-guidelines` were not run.
