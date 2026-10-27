# Feature Specification: Study ink visual system and prompt bar

**Feature Branch**: `claude/quirky-babbage-9zc43l`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Study ink visual system and prompt bar redesign (feature 001). Replace the T3 Code pure-black theme with the approved Study ink direction; redesign the prompt bar (composer, question dock, practice dock) into four fixed zones; ship the audit's bug-level fixes alongside. Design reference: https://claude.ai/artifact/5oZhYiW8seh7WbxCDn9nFh. Decisions approved by Oliver on 2026-10-27."

## Clarifications

### Session 2026-10-27

- Q: Theme background? → A: Warm near-black ground replaces pure black, with two raised surface steps.
- Q: Accent? → A: One amber accent, reserved for "your turn", the primary action and keyboard focus.
- Q: Title typeface? → A: A display serif (Newsreader) for lesson and session titles, replacing the bold-only legacy serif and the weight-900 workaround.
- Q: User turns in the transcript? → A: A quiet raised block aligned to the shared reading edge.
- Q: Practice Skip button? → A: Visible on active practice problems; behaves like the existing dismiss (same confirmation as Escape); the transcript still records "Problem dismissed."
- Q: Usage shows a percentage next to the ring? → A: Yes.
- Q: Send control? → A: Round arrow for plain chat only; every other primary action is a labelled button.
- Q: Feature scope? → A: Tokens and type, the prompt bar, the user-turn block and the audit's bug-level fixes. The home redesign ("Waiting for you") and sidebar simplification move to a later feature.
- Q: Constitution conflict (theme pinned to T3 Code)? → A: Amend the constitution to 1.1.0 (MINOR) inside this feature: the theme becomes "Study ink, as defined in DESIGN.md". DESIGN.md is updated in the same feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Answer a lesson check without hunting for the field (Priority: P1)

A learner reaches a lesson check. The bar at the bottom says it is their turn and what kind of turn it is, shows the question at reading size with its choices and confidence, and gives them a clearly labelled place to write their thinking. One named button submits.

**Why this priority**: Answering is the product's core loop. Today the question, choices, confidence, answer field and controls share one undifferentiated box, and the learner cannot tell reading from writing.

**Independent Test**: Open the "Knowledge check" review thread, expand the pending check, select a choice, set confidence, type reasoning and submit using only the bar.

**Acceptance Scenarios**:

1. **Given** a pending lesson check, **When** the bar is expanded, **Then** it shows, top to bottom: a turn strip ("Your turn" plus "Lesson check" and a collapse control), the question body (question, note, choices, a confidence row with "I don't know" as a text button), a labelled answer field ("Your thinking"), and a toolbar ending in a "Submit answer" button.
2. **Given** a choice is selected, **When** the learner looks at the choices, **Then** the selected choice is distinguished by the accent and by a filled radio mark, not by color alone.
3. **Given** the answer field has keyboard focus, **Then** the focus ring surrounds the answer field only, not the whole bar.
4. **Given** the question body is taller than its cap, **When** the learner scrolls inside it, **Then** only the body scrolls; the turn strip, answer field and toolbar stay in place, and a visible cue says more content is below.
5. **Given** "I don't know" is chosen, **Then** confidence is visibly disabled and, on submit, no confidence is sent (existing behavior).

---

### User Story 2 - One bar that keeps its shape in every state (Priority: P1)

Whether chatting, streaming, reading history, solving a practice problem or waiting between problems, the learner sees the same bar with the same zones in the same places. Only the contents change, and the main action is always bottom right and named with a verb.

**Why this priority**: The bar is on screen in every session. Inconsistent states (blue pill, grey disabled circle, placeholder dashes, raw markdown) are the most visible source of the unfinished feel.

**Independent Test**: Walk the four review threads and a live chat through each state and compare against the canvas's "Every state, same frame" board.

**Acceptance Scenarios**:

1. **Given** plain chat with an empty field, **Then** the toolbar shows the model and thinking triggers with readable text, and a round send arrow that is visibly disabled.
2. **Given** a turn is streaming, **Then** the primary action reads "Stop" with its icon; typing makes Enter queue a steer (existing behavior), and each queued steer appears as a row above the bar that can be removed.
3. **Given** the learner scrolls into history, **When** the bar compacts, **Then** it becomes a single row: for a pending question or problem, "Your turn" plus a one-line teaser and an "Answer" (or "Solve") button; for a draft, the draft's first line and send. Inline markdown in the teaser is rendered or stripped, never shown raw.
4. **Given** an active practice problem, **Then** the toolbar shows "Skip" and "Submit"; Skip opens the existing dismiss confirmation.
5. **Given** the between-problems pause, **Then** the primary action reads "Next problem" with the same shape and height as Submit, with the Enter-on-empty shortcut hinted beside it.
6. **Given** any state, **Then** the scroll-to-latest control sits just above the bar's top edge and never covers transcript text.

---

### User Story 3 - Honest setup and usage in the toolbar (Priority: P2)

A learner without a provider key sees one clear "Add a provider key" action inside the toolbar instead of floating buttons and "— ⌄" placeholders. A learner with a key sees which model and thinking level are active and how much context the session uses.

**Why this priority**: Missing setup currently looks broken; usage is an unlabeled empty ring.

**Independent Test**: Run with no key configured and confirm the toolbar state; then configure a key and confirm the labelled triggers and usage readout.

**Acceptance Scenarios**:

1. **Given** no provider key, **Then** the toolbar shows an "Add a provider key" button in place of the model and thinking triggers, no "—" placeholder appears, and no setup button floats over the transcript.
2. **Given** a key and a selected model, **Then** the model trigger shows the model's name and the thinking trigger shows the level (for example "Thinking: medium"; on phones the level alone).
3. **Given** a session with a known context limit, **Then** the usage control shows the ring and a percentage; **Given** the limit is unknown, **Then** it shows "?" instead of a number, never 0%.

---

### User Story 4 - The app reads as a calm study room (Priority: P2)

Across sidebar, transcript, demo workspace, settings, menus and dialogs, the learner sees a warm near-black ground, three ink levels, one amber accent, a serif for titles and a consistent type scale, with no invisible shadows, blurred overlays or side-ruled blocks.

**Why this priority**: The tokens carry the identity; the prompt bar depends on them.

**Independent Test**: Visual review of every primary surface at 320, 390 and 1440 px against the System board, plus automated contrast checks.

**Acceptance Scenarios**:

1. **Given** any app-owned surface, **Then** backgrounds use only the ground and the two raised steps; elevation never relies on drop shadows or backdrop blur.
2. **Given** any app-owned text, **Then** it uses one of the three ink levels, the accent or a semantic status color; no text color is produced by an opacity modifier.
3. **Given** a lesson or session title, **Then** it renders in the display serif at a normal (not black) weight. An explicit reading-font preference still applies.
4. **Given** a user turn in the transcript, **Then** it is a raised block whose left edge matches the assistant prose's left edge.
5. **Given** a blockquote or the agent's thinking block, **Then** it is distinguished by indent and ink level, not by a side border.
6. **Given** the accent, **Then** it appears only on the active turn label and status dot, the primary action and keyboard focus; links and decoration do not use it.

---

### User Story 5 - Audit fixes ride along (Priority: P3)

The bug-level findings from the audit are fixed in the same pass.

**Independent Test**: Each item below is checked on the review threads.

**Acceptance Scenarios**:

1. Phase labels ("Planning", "Teaching") read as left-aligned running heads on the reading edge, with no rule line.
2. The demo stand-in in the lesson column shows a one-row link ("Open in the workspace") instead of an empty tall box while the workspace is open.
3. The turn rail stays hidden until a session has at least three turns.
4. App-owned UI text is never smaller than 13 px; 12 px is used only for monospace metadata.
5. Corner radii use only three values: small (controls), medium (cards, composer, demo frame) and full (round send and status dots).

### Edge Cases

- Long question plus long choices on a 320 px phone: the body is capped at half the visual viewport, scrolls internally with hidden scrollbars, and the answer field stays above the software keyboard.
- Compacting while the answer field holds a draft or a choice is selected: nothing is lost; expanding restores it exactly.
- Input method composition in progress: the bar never compacts.
- A queued steer is removed after the turn has already consumed it: the row disappears and nothing else changes.
- Skip pressed while a turn is streaming: the same guard as Escape applies (existing abort rules).
- Saved custom background preference: it overrides the ground, and the raised steps stay distinguishable on it.
- Reduced motion: compact/expand and state changes happen without animation.
- Model catalog unavailable: the model trigger names the selected model if known, otherwise says so plainly; never "—".
- Coarse pointer: every bar control is at least 44 × 44 px.

## Requirements *(mandatory)*

### Functional Requirements

**Visual system**

- **FR-001**: The app MUST use a warm near-black ground (#0B0B0A) for canvas, sidebar, lesson and demo chrome, a raised surface (#151513) for composer, cards and demo frame, and a second raised surface (#1D1D1A) for menus, hover and selection.
- **FR-002**: App-owned text MUST use exactly three ink levels: primary (#EDECE8), secondary (#B4B2AB) and tertiary (#85837C). Each MUST meet 4.5:1 contrast on the ground and both raised surfaces. Opacity-derived text greys MUST be removed.
- **FR-003**: A single accent (#E3A957) MUST be used only for the active-turn label and status dots, the primary action, selected-choice emphasis and keyboard focus. Text on an accent fill MUST use the ground color.
- **FR-004**: Lesson and session titles MUST use the Newsreader display serif at weight 500–600. The legacy bold-only serif and the weight-900 title workaround MUST be removed. The reading-font preference continues to apply.
- **FR-005**: The type scale MUST be 12, 13, 15, 17, 22, 30 and 40 px, each with a defined line height. The reading baseline stays 17/27 and existing reading-size settings keep working. Hard-coded sizes outside the scale MUST be removed from app-owned UI.
- **FR-006**: Corner radii MUST be limited to three values: 6 px, 10 px and fully round (round send and status dots only).
- **FR-007**: App-owned surfaces MUST NOT use drop shadows or backdrop blur. Loading states use in-place skeletons instead of blurred overlays.
- **FR-008**: Blockquotes and the thinking block MUST NOT use side borders; dashed borders MUST be removed from app-owned UI.
- **FR-009**: User turns MUST render as a raised block on the same left edge as assistant prose.
- **FR-010**: Existing rules stay: no structural separator lines, hidden scrollbar tracks with working scrolling, visible keyboard focus, 52 px header alignment, saved custom background and reading preferences honored.

**Prompt bar**

- **FR-011**: The composer, the lesson question dock and the practice dock MUST share one four-zone layout inside the single mounted shell: turn strip, prompt body, answer field, toolbar.
- **FR-012**: The turn strip MUST show "Your turn" in the accent plus the turn kind ("Lesson check", "Problem", "Question") and a collapse control whenever a question or problem is active. In compact presentation it MUST be the whole bar: label, one-line teaser with inline markdown rendered or stripped, and an "Answer"/"Solve" button.
- **FR-013**: The prompt body MUST show the question at reading size, any note in secondary ink, choices as full-width rows with a radio or checkbox mark, and a confidence row holding the four existing stops and "I don't know" as a text button. It is the only zone that scrolls, capped at half the visual viewport on phones, with a visible "more below" cue when overflowing.
- **FR-014**: The answer field MUST sit inset on the ground color with a visible label ("Your thinking", "Your answer" or a purpose-specific placeholder for chat). The keyboard focus ring MUST surround this field only.
- **FR-015**: The toolbar MUST show labelled model and thinking-level triggers, and a usage control with the context ring plus a percentage when the limit is known (or "?" when it is not).
- **FR-016**: Without a provider key, the toolbar MUST show one "Add a provider key" action in place of the model and thinking triggers. The floating setup button above the bar MUST be removed. No "—" placeholder may appear in the toolbar.
- **FR-017**: The toolbar MUST end in exactly one primary action named with a verb: "Submit answer" (lesson check), "Submit" (practice), "Next problem" (between problems), "Stop" (streaming). Plain chat keeps a round send arrow. Disabled primary actions keep their label and use the raised-2 surface.
- **FR-018**: Active practice problems MUST show a "Skip" button beside Submit. Skip MUST open the existing dismiss confirmation used by Escape; confirming records the dismissal exactly as today.
- **FR-019**: Queued steers MUST appear as rows above the bar, each with a remove control.
- **FR-020**: The scroll-to-latest control MUST sit just above the bar's top edge and MUST NOT overlap transcript text.
- **FR-021**: Behavior MUST NOT change for: Enter, Shift+Enter, ⌘/Ctrl+Enter, Escape layering, ←/→ confidence, Enter-on-empty next problem, steering while busy, the confidence stops and their saved values, drafts and selections across compact/expand, the compact-on-history and expand-at-bottom rule, dock height animation and reduced motion.

**Audit fixes**

- **FR-022**: Phase labels MUST render as left-aligned running heads on the reading edge, without rules.
- **FR-023**: While the demo workspace shows a demo, its stand-in in the lesson column MUST be a single row linking to the workspace.
- **FR-024**: The turn rail MUST stay hidden in sessions with fewer than three turns.
- **FR-025**: App-owned UI text MUST be at least 13 px; 12 px only for monospace metadata.

**Governance and docs**

- **FR-026**: The constitution MUST be amended to 1.1.0 (MINOR), replacing the theme line with "Theme: Study ink, as defined in DESIGN.md", with a Sync Impact Report entry.
- **FR-027**: DESIGN.md MUST replace the T3 Code theme description with the Study ink rules and the prompt bar anatomy; PRODUCT.md and docs/ui-review.md MUST be corrected where they describe the old theme or controls.

### Key Entities

- **Prompt bar state**: one of chat (empty, drafting), streaming (with zero or more queued steers), pending lesson check or question (expanded or compact), active practice problem (expanded or compact), between problems, no provider key. Determines the turn strip, body, field label and primary action.
- **Design tokens**: ground and raised surfaces, three inks, accent, edge and hairline, type scale, radii, motion. The single source every surface reads.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the four review threads, a first-time viewer can point to where to type an answer within 3 seconds of the bar expanding (checked in owner review).
- **SC-002**: 100% of app-owned text and essential icon/text pairs meet 4.5:1 contrast on their surface (3:1 for text 24 px and larger), verified automatically on every primary surface.
- **SC-003**: Zero occurrences of opacity-derived text color, drop shadows, backdrop blur, side borders, dashed borders or off-scale font sizes in app-owned UI.
- **SC-004**: Every prompt bar state in Key Entities matches the canvas frame: same zone order, one verb-labelled primary action, no "—" placeholders, no raw markdown.
- **SC-005**: No floating control covers transcript text at 320, 390 or 1440 px in any review thread.
- **SC-006**: Initial JavaScript, cold sidebar readiness and app startup do not regress by more than 5% against the recorded baseline, including the added title font.
- **SC-007**: All existing keyboard, draft-persistence and dock-motion regressions pass unchanged.

## Assumptions

- The canvas at https://claude.ai/artifact/5oZhYiW8seh7WbxCDn9nFh (Composer, ComposerMobile, System, Lesson and Mobile boards) is the visual reference. Its Home board and the sidebar simplification are out of scope (later feature).
- Chart data inside demos keeps its own colors; only demo chrome (frame, controls, axis ink and font via the existing theme bridge) follows the tokens.
- Status colors (success, warning, destructive) remain as semantic tokens, adjusted only where needed to meet contrast on the new ground.
- The Newsreader font is loaded so it does not block startup.
- Practice "Skip" reuses the existing dismissal record and confirmation; no new data is written.
- Hosted, desktop (Electron) and local modes all receive the same visual change; window gutters and drag regions remain.
