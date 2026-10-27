# Interface design

Updated direction approved by Oliver on 2026-10-27 in the performance and interface plan. Implementation and verification are tracked in [.scratch/performance-ui/plan.md](.scratch/performance-ui/plan.md).

Run `npm run dev:review` for persistent example threads. See [the UI review guide](docs/ui-review.md) for review routes and behavior checks.

## Typography and surfaces

- Source Sans 3 is the default for interface text, prose, questions, and demo controls. Titles follow the reading family. A user's explicit reading-font preference applies consistently to interface and titles.
- Reserve monospace for code. Retain the 17px/27px reading baseline and existing reading-size settings.
- Use spacing and headings for grouping. Remove structural separator lines between panes, headers, footers and settings/chain rows. Retain input, choice, selection and focus boundaries. Resize handles remain available on hover and keyboard focus.
- Match the default T3 Code web dark theme at upstream revision `d0b81ceb6e225a7386203d590ec84def4abed281`, using a black canvas for sidebar, lesson, composer and demo chrome. Raised surfaces, selection, borders and muted text use shared semantic tokens. Chart data keeps its own colors. Preserve explicit custom background and reading preferences.
- Scrollbar tracks and thumbs stay hidden across app-owned content and rendered demos. Preserve wheel, touch, keyboard and programmatic scrolling, visible focus and access to overflow content. The project scrolling rule lives in AGENTS.md.
- Session icons retain their lesson/practice meaning with a shared size and stroke. Running and waiting status occupy a separate trailing slot. App and demo headers share a 52px alignment; native window gutters and drag regions remain.

## Lessons and controls

- An active lesson question or practice problem follows the floating composer as a compact summary. Tapping expands its content and applicable choices/confidence controls without losing drafts or selection. Reading history compacts it again. Historical answered/dismissed content stays in the transcript.
- Keep the composer mounted through presentation changes. Scrolling into history compacts it until the conversation bottom, where it animates to expand. Editing expands it; do not compact during focus or input composition. Reduced motion preserves the state change without the animation.
- A measured tail spacer keeps the last content reachable. No divider or opaque footer band cuts off the transcript. On mobile, expanded question content occupies at most half the available visual viewport and scrolls internally with hidden tracks. Keep the answer input reachable above the software keyboard.
- Normal answer, question reasoning, confidence, and practice controls remain. The separate reading-thinking field is removed.
- Model and reasoning selectors appear directly in the composer toolbar, with usage as its own control. Escape closes the innermost menu first. Demo expand, brightness, and download icons share the workspace title row. Existing session navigation and sidebar resizing remain.

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
