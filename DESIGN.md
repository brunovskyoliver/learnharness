# Interface design

Approved by Oliver on 2026-10-27; implemented in the thread UX redesign.

## Typography and surfaces

- Source Sans 3 is the default for interface text, prose, questions, and demo controls. Titles follow the reading family. A user's explicit reading-font preference applies consistently to interface and titles.
- Reserve monospace for code. Retain the 17px/27px reading baseline and existing reading-size settings.
- Use spacing and headings for grouping. Borders distinguish inputs and adjacent panes. Demo panels do not add nested card frames.
- Preserve the existing dark palette and appearance controls. Use shared CSS variables rather than per-component palettes.

## Lessons and controls

- The question, choices, and confidence controls scroll with the lesson. Only the answer composer floats at the bottom; a measured tail spacer keeps the last content reachable. No divider or opaque footer band cuts off the transcript.
- Normal answer, question reasoning, confidence, and practice controls remain. The separate reading-thinking field is removed.
- Model, reasoning level, and usage controls live behind the labeled sliders icon. Demo expand, brightness, and download icons share the workspace title row. Existing session navigation and sidebar resizing remain.

## Demos

- A question's exact demo reference opens the workspace automatically once for that question. Closing or switching it is respected.
- One live iframe serves the inline, workspace, and focused presentations. Its original location shows a preview while the workspace is active.
- Kit graph focus uses a native modal dialog and places parameters to the right. Narrow viewports use a collapsible lower parameter area.
- Expand animates from the selected graph. Reduced motion removes that transition. Escape and Close restore focus and reading position without resetting simulation state.
- Legacy HTML expands as a whole demo. Do not infer graph boundaries or extract arbitrary controls.
- Preserve the sandbox. Bridge messages require the expected source window and validated payload fields.
