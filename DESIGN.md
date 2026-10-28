# Interface design

Study ink, approved by Oliver on 2026-10-27 (feature 001, [specs/001-study-ink-prompt-bar](specs/001-study-ink-prompt-bar/spec.md)). It replaces the T3 Code black theme. The design reference is the canvas at https://claude.ai/artifact/5oZhYiW8seh7WbxCDn9nFh. Its tokens, type and prompt-bar components are mirrored in [design-system/](design-system/README.md) (also published at https://claude.ai/artifact/1RjQhdzMDVeypi1nbnBWYP). The mirror does not update itself; where it and this file disagree, this file wins.

Run `npm run dev:review` for persistent example threads. See [the UI review guide](docs/ui-review.md) for review routes and behavior checks.

## Study ink

- Surfaces: ground `#0b0b0a` for canvas, sidebar, lesson and demo chrome; raised `#151513` for composer, cards and demo frame; raised-2 `#1d1d1a` for menus, hover and selection. Elevation comes from these steps only: no drop shadows, no backdrop blur. Loading uses opaque scrims or in-place skeletons.
- Inks: `#edece8` (prose, titles, values), `#b4b2ab` (`ink-2`: labels, secondary copy), `#8a8881` (`muted-foreground`: timestamps, hints, meta). Each passes 4.5:1 on every surface. Never derive text color from an opacity modifier.
- Accent: amber `#e3a957`, reserved for the learner's turn (turn label, waiting status), the primary action, the selected choice and keyboard focus. Text on the accent uses the ground color. Links and decoration do not use it.
- Edges: `rgb(255 252 240 / 7%)` hairline for table rules; `rgb(255 252 240 / 14%)` edge for inputs and choices. No dashed borders, no side rules on quotes or thinking.
- Radii: 6px for controls, 10px for cards, composer and demo frame, fully round only for the chat send, status dots and avatars.
- Motion: 160ms for state, 240ms for layout. Reduced motion keeps the state change without the transition.

## Typography and surfaces

- Source Sans 3 is the default for interface text, prose, questions, and demo controls. Lesson headings (prose `h1`/`h2`) and titles use Newsreader at 500–600. A user's explicit reading-font preference applies consistently to interface and titles.
- Type scale: 12 (monospace metadata only), 13 (UI floor), 15, 17 (reading), 22, 30, 40. No hard-coded sizes outside the scale.
- Reserve monospace for code and numeric metadata. Retain the 17px/27px reading baseline and existing reading-size settings.
- Use spacing and headings for grouping. Remove structural separator lines between panes, headers, footers and settings/chain rows. Retain input, choice, selection and focus boundaries. Resize handles remain available on hover and keyboard focus.
- Raised surfaces, selection, borders and muted text use the shared Study ink tokens. Chart data keeps its own colors. Preserve explicit custom background and reading preferences.
- Scrollbar tracks and thumbs stay hidden across app-owned content and rendered demos. Preserve wheel, touch, keyboard and programmatic scrolling, visible focus and access to overflow content. The project scrolling rule lives in AGENTS.md.
- Session icons retain their lesson/practice meaning with a shared size and stroke. Running and waiting status occupy a separate trailing slot. App and demo headers share a 52px alignment; native window gutters and drag regions remain.

## Lessons and controls

- Transcript blocks share one reading edge: assistant prose, the user turn (a raised 10px block with a "You" label), agent thinking rows and phase running heads ("Planning", "Teaching", left-aligned, no rule) all start on the same x. While the workspace shows a demo, its place in the lesson is a single row linking to it. The turn rail appears from three turns.

### Prompt bar

One raised shell, four zones in fixed order; only their contents change.

1. Turn strip: "Your turn" in the accent plus the kind (Lesson check, Question, Prediction, Explain, Recall, Problem) and a collapse control. Collapsed while reading history, the strip replaces the prompt body: label, a one-line teaser (markdown rendered or stripped) and an Answer or Solve button. The answer well stays, so a draft is never hidden.
2. Prompt body: the question at reading size, any note in secondary ink, choices as full-width rows, then confidence with "I don't know" as a text button. Only this zone scrolls; a fade at its bottom edge shows there is more.
3. Answer field: sits directly on the shell, no inner box or fill, with a visible label ("Your thinking", "Your answer") that brightens while the field has focus.
4. Toolbar: labelled model and thinking triggers ("Choose a model" and "Thinking" when unset, never "—") and the usage ring with a percentage ("?" when the limit is unknown). Without a key or models, the toolbar shows "Add a provider key" or "Set up your models" in their place. It ends in one primary action named with a verb: Submit answer, Submit (with Skip beside it on practice problems; Skip takes the Escape confirmation), Next problem, Stop. Plain chat keeps the round send.

Queued steers sit above the shell as right-aligned rows. Scroll-to-latest sits just above the shell's top-right edge.

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
