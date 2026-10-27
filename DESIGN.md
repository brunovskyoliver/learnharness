# Interface design

Approved by Oliver on 2026-10-27; implemented in the thread UX redesign.

Run `npm run dev:review` for persistent example threads. See [the UI review guide](docs/ui-review.md) for review routes and behavior checks.

## Typography and surfaces

- Source Sans 3 is the default for interface text, prose, questions, and demo controls. Titles follow the reading family. A user's explicit reading-font preference applies consistently to interface and titles.
- Reserve monospace for code. Retain the 17px/27px reading baseline and existing reading-size settings.
- Use spacing and headings for grouping. Borders distinguish inputs and adjacent panes. Demo panels do not add nested card frames.
- Use one graphite canvas for sidebar, lesson, composer and demo chrome. Raised surfaces, selection, borders and muted text derive from shared semantic tokens. Chart data keeps its own colors. Preserve custom background and reading preferences.
- Session icons retain their lesson/practice meaning with a shared size and stroke. Running and waiting status occupy a separate trailing slot. App and demo headers share a 52px alignment; native window gutters and drag regions remain.

## Lessons and controls

- The question, choices, and confidence controls scroll with the lesson. Only the answer composer floats at the bottom; a measured tail spacer keeps the last content reachable. No divider or opaque footer band cuts off the transcript.
- Normal answer, question reasoning, confidence, and practice controls remain. The separate reading-thinking field is removed.
- Model, reasoning level, and usage controls live behind the labeled Options trigger in the integrated composer toolbar. Its popover anchors to that trigger. Escape closes the innermost menu first. Demo expand, brightness, and download icons share the workspace title row. Existing session navigation and sidebar resizing remain.

## Settings and secondary views

- Settings uses searchable icon categories, a Settings / section header, grouped fields and a live reading preview. Category navigation scrolls horizontally on narrow screens; field controls stack below labels.
- Settings, setup and connection dialogs contain focus. Menus portal into the active modal boundary. Closing returns focus to the opening control; settings retain immediate persistence and existing section/row deep links.
- Home, chains and activity share the same surface and control tokens. Loading, empty and failed requests remain distinct; refresh failures retain the last successful data.

## Demos

- A question's exact demo reference opens the workspace automatically once for that question. Closing or switching it is respected.
- One live iframe serves the inline, workspace, and focused presentations. Its original location shows a preview while the workspace is active.
- Kit graph focus uses a native modal dialog and places parameters to the right. Narrow viewports use a collapsible lower parameter area.
- Expand animates from the selected graph. Reduced motion removes that transition. Escape and Close restore focus and reading position without resetting simulation state.
- Legacy HTML expands as a whole demo. Do not infer graph boundaries or extract arbitrary controls.
- Preserve the sandbox. Bridge messages require the expected source window and validated payload fields.
- Appearance changes update the live iframe's theme bridge without replacing its document. Preserve parameter values, simulation history and 3D camera; authored demo CSS may override injected defaults.
