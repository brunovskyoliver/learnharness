# Bug Assessment: Page selection bubble is not above the highlighted text

- **Slug**: page-selection-toolbar-position
- **Created**: 2026-10-31
- **Source**: pasted text and a screenshot
- **Verdict**: valid
- **Severity**: low (the actions still work; the bubble sits away from the text, and DESIGN.md says "over selected text")

## Report (verbatim or summarized)

> also fix when highlighting somethign the popup is not above thaat being displaye.d..

The screenshot shows the word "snwksn" highlighted at the top-left of a one-word page, with the bubble below it and centred on the pane.

## Symptom

On the first lines of a page the bubble opens below the selection, and with select-all it also centres on the pane instead of the text. Expected: the bubble sits directly above the highlighted text.

## Reproduction

1. Open a page in the Library and select text on its first line.
2. The bubble opens below the selection.
3. Press Ctrl+A on a short page: the bubble also centres on the pane.

Measured at 1440 × 900 (x and y in px; the editor's scroll area starts at y=136):

| Selection | Selected text | Bubble | Result |
| --- | --- | --- | --- |
| Drag, first line | x 972–1025, y 145–169 | y 177–217 | Below |
| Select-all, one word | word as above; range x 972–1428 | x 999–1401, y 179–219 | Below, centred on the pane |
| Word lower on the page | y 372–396 | y 324–364 | Above, correct |

Script: `~/agent-runs/2026-10-31-page-bubble/repro.mjs`.

## Suspected Code Paths

- `components/library/page-toolbar.tsx:155` — `BubbleMenu` passes no `appendTo`, so the library mounts it in `view.dom.parentElement`, inside `.lh-page-editor-host` (`components/library/page-editor.tsx:264`).
- `node_modules/@tiptap/extension-bubble-menu/dist/index.js:71` — default `flip` treats that scroll area as the boundary, so without room above it the bubble flips below.
- `node_modules/@tiptap/extension-bubble-menu/dist/index.js:33` — the default reference is `posToDOMRect(from, to)`. Select-all's positions are block boundaries, so the rectangle is the block's width, not the text's.

## Root Cause Hypothesis

Confidence: high. Two separate causes. The bubble is clipped by the editor's scroll area, so it cannot go above the first lines and flips. The reference rectangle for block-boundary selections is the whole block, so the bubble centres on it. The screenshot's pane-centred position matches the select-all measurement; how the owner made that selection was not reported.

## Proposed Remediation

**Preferred**: mount the bubble in `.page-workspace` with fixed positioning, so it can overlap the toolbar above the first lines. Keep flip and shift inside the workspace, so it stays in the pane and only goes below when the workspace itself has no room. Use a reference built from the first and last text positions in the selection. Because a fixed bubble no longer scrolls with the content, reposition it when the editor scrolls and hide it when the selection scrolls out of view.

**Files likely to change**:

- `components/library/page-toolbar.tsx`
- `components/library/page-editor.tsx`
- `scripts/check-library-ui.mjs`

**Tests to add or update**:

- Browser check: bubble above and horizontally near the selection for a first-line drag and for select-all; stays inside the pane; follows scrolling.

## Risks & Considerations

- Above the first lines, the bubble covers part of the formatting toolbar while text is selected.
- Moving the bubble's DOM parent must keep Escape handling, focus containment and the tutor actions working.
- A bubble wider than the pane cannot centre on text near an edge, so it stays offset there.

## Open Questions

None.
