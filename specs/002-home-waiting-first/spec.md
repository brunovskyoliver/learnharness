# Feature Specification: Home leads with what's waiting

**Feature Branch**: `claude/fervent-bohr-l648pg`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Feature 002 — Home leads with what's waiting. Design canvas: https://claude.ai/artifact/SChjbajeREM23XcaxEGb1E. Home opens with the topic composer, then a 'Waiting for you' list of every unanswered check and open problem across sessions, each with an Answer or Solve button. The centred-icon empty state goes. The knowledge graph sits below, and 'Import notes' moves into that section. A calmer sidebar: one 'New' button replaces the three unlabelled icons next to Search; the repeated '?' icon becomes an amber dot for waiting sessions so titles stop truncating; Settings only at the bottom of the sidebar; the date-shelf headers move to the Newsreader serif. Leftovers from 001: queued messages can be removed before they are sent (needs a server cancel route); the scroll-to-latest button stops covering text on phones; the dock smoke test passes here (it fails at the same step on unchanged code)."

## Clarifications

### Session 2026-10-28

- Q: Design system for the canvas? → A: Study ink.
- Q: Which "session-name headers" move to Newsreader? → A: The sidebar date shelves (Today / Yesterday / Earlier).
- Q: "Settings joins the bottom row"? → A: Settings appears only as the gear icon at the bottom of the sidebar; other Settings entry points go.
- Q: Where does the session filter go once "New" replaces the three header icons? → A: Inside the Search field, as a small filter control at its right end. "New" opens a menu with Lesson and Practice.
- Q: What form does the knowledge graph take on Home? → A: The live interactive graph (pan, zoom, search, node cards) at a fixed height inside its section, with an Expand control for full screen.
- Q: In what order does "Waiting for you" list its items? → A: Newest first, matching the sidebar.
- Q: How do the Answer / Solve buttons look? → A: Quiet (raised grey, like the collapsed prompt bar's Answer); amber only on the kind label.
- Q: What happens when × is pressed on a queued message? → A: It is removed immediately; no confirmation, no undo.
- Q: Does the removed message's text return to the composer? → A: No, it is discarded; the composer draft is untouched.
- Q: The gear over the graph opens graph display settings, not app Settings. What happens to it? → A: It is removed; its display controls move into a graph section of the Settings dialog.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See and answer what is waiting, straight from Home (Priority: P1)

A learner opens the app. Home starts with the topic composer, and right under it a "Waiting for you" list shows every unanswered lesson check and every open practice problem across all sessions. Each item names its kind, its session, how long it has waited and a one-line teaser of the question, with an "Answer" (checks and questions) or "Solve" (problems) button that takes the learner straight to it.

**Why this priority**: Unanswered checks are the product's core loop stalling. Today they are hidden behind a repeated "?" icon in the sidebar, and Home leads with a graph or an empty placeholder.

**Independent Test**: With review data containing two sessions with a pending check and one practice session with an open problem, open Home and use only the list to reach and answer each one.

**Acceptance Scenarios**:

1. **Given** sessions with pending checks or open problems, **When** Home opens, **Then** the topic composer comes first, followed by a "Waiting for you" heading with the count of open items, followed by one row per waiting item.
2. **Given** a waiting lesson check, **Then** its row shows the kind ("Lesson check", "Question", "Prediction", "Explain", "Recall"), the session title, the time since it was posed, the question's teaser on one line (markdown rendered or stripped, never raw) and an "Answer" button.
3. **Given** an open practice problem, **Then** its row shows "Problem", the session title, the time, the teaser and a "Solve" button.
4. **Given** the learner presses Answer or Solve, **Then** the session opens with its prompt bar expanded on that question or problem, ready for input.
5. **Given** nothing is waiting, **Then** the section shows its heading and one sentence saying nothing is waiting; no centred icon or placeholder illustration appears anywhere on Home.
6. **Given** the learner answers a check in a session, **When** they return to Home, **Then** that item is no longer listed and the count drops.
7. **Given** the waiting list fails to load, **Then** the section says so in words with a way to try again; a failed refresh keeps the last list shown.

---

### User Story 2 - The knowledge graph as a section of Home (Priority: P1)

Below the waiting list, the knowledge graph is its own section with a "Knowledge graph" heading. "Import notes" sits in that section's header instead of floating over the canvas.

**Why this priority**: The graph moves from being the whole of Home to one section of it; without this the redesign of US1 has nowhere to put the graph or the import entry point.

**Independent Test**: Open Home with and without graph nodes; import notes from the section header.

**Acceptance Scenarios**:

1. **Given** a graph with nodes, **Then** the section shows the live interactive graph (pan, zoom, search, node cards) at a fixed height below its header, with an Expand control that shows it full screen and returns to Home on Escape or Close; **Given** an empty graph, **Then** the section shows one sentence saying how the graph fills (start a session or import notes) instead of the centred icon.
2. **Given** the learner presses "Import notes" in the section header, **Then** the existing import flow runs and its progress and errors show in that section.
3. **Given** graph rendering is turned off in settings, **Then** the section shows the existing minimal summary in place of the canvas.
4. **Given** a phone-width screen, **Then** Home scrolls as one page (composer, waiting list, graph section) with no horizontal overflow.

---

### User Story 3 - A calmer sidebar (Priority: P2)

The sidebar header holds the Search field and one labelled "New" button. Rows show the session type icon, the full title and, for sessions waiting on the learner, a small amber dot instead of a "?" icon. Date shelves read in the title serif. Settings is the gear at the bottom.

**Why this priority**: The sidebar is on screen in every view; today three unlabelled icons and repeated "?" icons crowd it and truncate titles.

**Independent Test**: Compare the sidebar to the canvas's Sidebar artboard; create a lesson and a practice session from "New"; filter to Practice from inside Search.

**Acceptance Scenarios**:

1. **Given** the sidebar, **Then** the header shows the Search field and a labelled "New" button, and no separate filter, new-lesson or new-practice icon buttons.
2. **Given** the learner opens "New", **Then** a menu offers "Lesson" and "Practice"; choosing one starts the same flow the old icon did.
3. **Given** the learner opens the filter control inside Search, **Then** a menu offers All sessions, Lessons and Practice; while a filter other than All is active, the control is visibly on.
4. **Given** a session waiting for the learner, **Then** its row shows an amber dot with the accessible name "Waiting for you"; a running session keeps its running indicator.
5. **Given** a long session title, **Then** the row shows the whole title, wrapping onto a second line rather than truncating.
6. **Given** the date shelves, **Then** "Today", "Yesterday" and "Earlier" render in the title serif.
7. **Given** any view, **Then** Settings is reachable from the gear icon at the bottom of the sidebar, and from no other button on Home or the graph; the graph's display controls are in a graph section of Settings and still change the live graph.

---

### User Story 4 - Take back a queued message (Priority: P2)

While a turn runs, a learner who queued a message they no longer want can remove it before the agent receives it.

**Why this priority**: Left over from 001 (FR-019 partly met). A queued steer currently cannot be withdrawn.

**Independent Test**: Start a long-running turn, queue two messages, remove one; the agent receives only the other and the transcript shows only the other.

**Acceptance Scenarios**:

1. **Given** a queued message row above the prompt bar, **Then** it has a remove button named "Remove queued message" plus its text.
2. **Given** the learner presses remove before the message is delivered, **Then** the row disappears immediately, the message is never shown to the agent, and it never appears in the transcript.
3. **Given** the message was delivered in the meantime, **When** remove is pressed, **Then** the row is replaced by the message's card in the transcript as usual and the learner is told in words that it was already sent.
4. **Given** a queued message parked after the turn ended (waiting for the next run), **Then** it can be removed the same way.

---

### User Story 5 - Scroll-to-latest never covers text on phones (Priority: P3)

On a phone, scrolled up in a session, the scroll-to-latest button sits in its own space above the prompt bar so no transcript text is hidden behind it.

**Why this priority**: Left over from 001 (FR-020 partly met).

**Independent Test**: At 320 and 390 px width, scroll up in a long session and confirm the last visible line of text is never under the button.

**Acceptance Scenarios**:

1. **Given** a phone-width screen scrolled up, **Then** scroll-to-latest shows in a band above the prompt bar and the transcript's reachable end stops above that band.
2. **Given** queued messages, **Then** they stack above the band and the button stays reachable.

---

### User Story 6 - The dock smoke test passes in this environment (Priority: P3)

`scripts/smoke-dock-ui.mjs` runs to completion here.

**Why this priority**: It fails at the setup-focus-restore step on unchanged code (recorded in 001's progress), which hides real regressions.

**Independent Test**: Run the script on unchanged code and after the fix.

**Acceptance Scenarios**:

1. **Given** this environment, **When** the dock smoke test runs, **Then** it passes, and the cause of the old failure is recorded (test defect or app defect) with the fix in the right place.

### Edge Cases

- A session has both a pending check and a running turn: it is listed (the learner can still answer); the sidebar shows the running indicator.
- Many waiting items (20+): the list shows them all in order without nesting a second scroll area inside Home.
- A waiting item's session is deleted while Home is open: the item disappears on the next refresh; pressing its button gives an honest "session no longer exists".
- A question teaser is very long or contains math or code: one line, cut with an ellipsis, rendered not raw.
- Removing a queued message while the connection is down: the row stays and the learner is told it could not be removed.
- Hosted mode: the waiting list and cancel route only see the current tenant's sessions.

## Requirements *(mandatory)*

### Functional Requirements

**Home**

- **FR-001**: Home MUST show, in order: the topic composer, the "Waiting for you" section, the "Knowledge graph" section.
- **FR-002**: The waiting section MUST list, newest first, every session with an unanswered lesson question or an open practice problem, one row per waiting item, across all of the learner's sessions.
- **FR-003**: Each row MUST show kind, session title, time since posed, a one-line teaser, and an "Answer" (questions) or "Solve" (problems) button. The buttons use the quiet style; amber appears only on the kind label.
- **FR-004**: The teaser MUST contain only the question or problem text the learner would see; no answer, explanation or grading data reaches the client before the learner answers.
- **FR-005**: Answer/Solve MUST open the session with its prompt bar expanded on that item.
- **FR-006**: The waiting section MUST show distinct loading, empty (one sentence), failed (words plus retry) and populated states; a failed refresh keeps the last list.
- **FR-007**: The centred-icon empty state MUST be removed from Home.
- **FR-008a**: The graph section MUST show the live interactive graph at a fixed height, with an Expand control for a full-screen view that keeps its state and returns focus on close.
- **FR-008**: The graph section MUST carry "Import notes" in its header; the import flow and its errors work as today.
- **FR-009**: With graph rendering off, the graph section MUST show the existing minimal summary.
- **FR-010**: Home MUST work at 320, 390 and 1440 px without horizontal overflow, scrolling as one page with hidden scrollbars.

**Sidebar**

- **FR-011**: The sidebar header MUST show Search and one labelled "New" button opening a menu with "Lesson" and "Practice".
- **FR-012**: The session filter (All sessions, Lessons, Practice) MUST live inside the Search field and show when a narrowing filter is active.
- **FR-013**: Waiting sessions MUST show an amber dot (accessible name "Waiting for you") in place of the "?" icon; running sessions keep the running indicator.
- **FR-014**: Session titles MUST show in full, wrapping instead of truncating.
- **FR-015**: Date shelves MUST use the title serif.
- **FR-016**: Settings MUST be reachable only from the gear at the bottom of the sidebar; keyboard shortcuts and deep links to settings keep working.
- **FR-016a**: The graph's display-settings gear MUST be removed; its controls move into a graph section of the Settings dialog, and changes there apply to the live graph without a reload.

**Leftovers from 001**

- **FR-017**: Each queued message MUST have a remove control (44 px target on touch) that withdraws it before delivery, immediately, without confirmation or undo. The removed text is discarded; the composer draft is untouched.
- **FR-018**: The server MUST offer a cancel operation for one queued message by id: it succeeds only if the message is undelivered, removes it from every queue it sits in, and otherwise answers with an honest conflict; unknown ids get an honest error; tenant-scoped in hosted mode.
- **FR-019**: A removed message MUST never reach the agent or the transcript.
- **FR-020**: On phone widths, scroll-to-latest MUST sit in a reserved band above the prompt bar, and the transcript's reachable end MUST stop above it.
- **FR-021**: The dock smoke test MUST pass in this environment, with the root cause recorded.

### Key Entities

- **Waiting item**: one unanswered question or open problem in a session. Attributes: session id and title, session kind, item kind (Lesson check, Question, Prediction, Explain, Recall, Problem), teaser text, time posed.
- **Queued message**: a learner message sent during a running turn and not yet delivered. Attributes: client-minted id, session id, text, delivered or not.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From opening the app, a learner reaches any waiting check in one action (one press of Answer or Solve).
- **SC-002**: 100% of unanswered checks and open problems in the review data appear in the waiting list, and none that are answered.
- **SC-003**: No session title in the review data truncates in the sidebar at the default sidebar width.
- **SC-004**: A removed queued message appears in 0 transcripts and 0 agent inputs across the cancel regression runs.
- **SC-005**: At 320 and 390 px, scroll-to-latest overlaps 0 lines of transcript text.
- **SC-006**: The dock smoke test passes 3 runs in a row here.
- **SC-007**: Initial JavaScript, cold sidebar readiness and startup stay within 5% of the baseline.

## Assumptions

- The canvas's static graph preview with "Open graph" is superseded by the live fixed-height graph (Clarifications).
- No new runtime dependencies. The agent library can inspect and clear its steering queue, which is enough to withdraw one message.
- Design reference: canvas https://claude.ai/artifact/SChjbajeREM23XcaxEGb1E.
