# Feature Specification: Page editor tools

**Feature Branch**: `claude/notes-editing-quality-review-wj8e49` (on top of `feat/009-library-canvas`)

**Created**: 2026-10-31

**Status**: Draft

**Input**: Owner: make the canvas page editor work like ChatGPT Canvas or Notion pages. Scope comes from the approved review on the design canvas (https://claude.ai/artifact/NMvgNxmvrg2vHQ6bYwdn6z, boards "Proposed page editor" and "Tutor edits and history"):
- a formatting toolbar, plus links with Ctrl+K and a link popover;
- table controls, a slash menu and an empty-page placeholder;
- a selection bubble with formatting and tutor actions;
- review and undo of the tutor's change;
- History compare and named versions;
- an outline and a word count;
- export;
- pasted or dropped images.

Pages stay stored as Markdown with math; nothing may change stored bytes that were not edited.

## Clarifications

### Session 2026-10-31

- Q: How does a tutor action on selected text reach the tutor? → A: It sends a message to the session beside the page at once. The message carries an @ reference to the page and quotes the selection, and the tutor answers in chat.
  - Simpler revises the page as a normal tutor edit, which can be undone.
  - Quiz me on this asks a graded check in chat.
  - Ask… opens the composer with the quote filled in, for the learner to finish.
- Q: Where does a pasted, dropped or inserted image live? → A: It becomes a Library image item, under the existing 50 MB and image rules. The page stores a Markdown image link to that item. If the item is deleted, the page shows the image's alt text.
- Q: What does "Undo the tutor's edit" do after the learner has typed since? → A: It reverts only the blocks the tutor changed, and the learner's later typing stays. A block both changed is left as it is, and a line says so. The undo is a new version in History.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Format without knowing Markdown (Priority: P1)

The learner formats notes with visible controls: a toolbar, a bubble over selected text, a slash menu on an empty line, and keyboard shortcuts. A blank page says how to start.

**Why this priority**: Today every format needs Markdown syntax typed by hand, and links, tables and images cannot be made at all. This is the core of an editable page.

**Independent Test**: On a blank page, without typing any Markdown, make a heading, bold text, a link, a checklist, a 3 × 3 table with an added row, an inline formula and a quote. Reload: all are kept, and the stored text is Markdown.

**Acceptance Scenarios**:

1. **Given** an empty page, **When** it opens, **Then** a placeholder says how to start, including "/" for blocks, and disappears on the first character.
2. **Given** a caret in a paragraph, **When** the learner uses a toolbar button or its shortcut, **Then** the format applies. The button shows its pressed state wherever the caret sits in formatted text.
3. **Given** selected text, **When** the learner presses Ctrl/Cmd+K or Link, **Then** a link popover lets them add, edit, open in a new tab or remove the link, entirely from the keyboard.
4. **Given** an empty line, **When** the learner types "/", **Then** a filtered menu inserts the chosen block: headings, lists, checklist, quote, code block, formula block, table, image or divider. Arrow keys, Enter and Escape work as in the @ list.
5. **Given** a caret in a table, **Then** controls add or remove a row or column and delete the table.
6. **Given** a phone width, **Then** the toolbar wraps or scrolls within its row, and every control is at least 44 px with a visible focus state.

---

### User Story 2 - Ask the tutor about what I'm reading (Priority: P1)

The learner selects text on a page and asks the tutor to explain it, simplify it, quiz them on it, or anything else.

**Why this priority**: This loop is what makes Canvas a study tool, not just an editor, and it ties pages to teaching.

**Independent Test**: Select a sentence and choose Explain. A message with the page reference and the quote appears in the chat and is answered. Choose Quiz me on this, and a graded check appears.

**Acceptance Scenarios**:

1. **Given** a selection, **Then** a bubble shows the formatting actions and Explain, Simpler, Quiz me on this and Ask….
2. **Given** Explain, Simpler or Quiz me on this, **When** chosen, **Then** a message is sent at once in the session beside the page, with the page referenced and the selection quoted. The transcript labels it like any other referenced message.
3. **Given** Ask…, **When** chosen, **Then** the composer gets focus with the quote filled in, and nothing is sent until the learner sends it.
4. **Given** no session is beside the page (the Library view), **When** a tutor action is chosen, **Then** [behavior decided in /speckit-clarify].
5. **Given** a question is waiting for the learner's answer or a problem is active, **Then** tutor actions are unavailable, and a line says why.

---

### User Story 3 - See and undo what the tutor changed (Priority: P2)

When the tutor edits an open page, the learner sees exactly what changed, steps through the changes, and can undo them in one action.

**Why this priority**: Today a 4-second line is all the learner gets. Trusting a shared page needs visible changes.

**Independent Test**: The tutor revises two places on an open page. Both are highlighted, Next and Previous move between them, Undo restores the earlier text in those places only, and History shows the undo as a version.

**Acceptance Scenarios**:

1. **Given** a tutor version arrives on a clean open page, **Then** its changed blocks are highlighted and a bar names the count ("The tutor changed 2 places · version 8"), with Previous, Next, "Undo the tutor's edit" and Done.
2. **Given** removed text, **Then** it is shown struck through in muted ink until Done, and is never stored.
3. **Given** the learner typed since, **When** they choose Undo, **Then** only the blocks the tutor changed revert. A block both changed stays, and a line names how many.
4. **Given** Done, or leaving the page, **Then** the highlights clear and nothing in the stored text changes.

---

### User Story 4 - Compare versions and name the ones that matter (Priority: P2)

History shows what changed between versions, not only the old text, and lets the learner name a version (for example "Before exam").

**Why this priority**: A list of timestamps does not help the learner find the version they want.

**Independent Test**: Pick a version, choose Changes, and see added and removed blocks against the previous version. Name it; the name survives reload and shows in the list.

**Acceptance Scenarios**:

1. **Given** a selected version, **Then** Changes, the default view, lists its added and removed blocks compared with the version before it, with words beside the colours ("added", "removed"). Full text shows the rendered version.
2. **Given** a version, **When** the learner names it, **Then** the name shows in the list, survives reload, and can be cleared. Naming changes no page text and adds no version.
3. **Given** a version, **Then** Copy this version copies its Markdown.

---

### User Story 5 - Find my way in long notes, and take them elsewhere (Priority: P3)

An outline of headings, a word count, and export: copy as Markdown, download a .md file, or print to PDF.

**Why this priority**: These are useful for lecture notes, but not core.

**Independent Test**: On a page with four headings, the outline lists them and jumps to each. The header shows the word count. Each export produces the page's stored text, or a printout of it.

**Acceptance Scenarios**:

1. **Given** headings, **When** Outline is on, **Then** a list of h1–h3 is shown beside the text, or as a menu at phone width, and selecting one scrolls to it and moves the caret there.
2. **Given** any page, **Then** the header shows "{n} words" next to the save state. Formulas and code are not counted.
3. **Given** Export, **Then** Copy as Markdown copies the current text, Download .md saves "{page name}.md", and Print opens the browser's print dialog with only the page, rendered.

---

### User Story 6 - Put pictures in my notes (Priority: P3)

The learner pastes, drops or inserts an image, and it appears in the page.

**Why this priority**: Notes from slides and whiteboards need pictures, but text tools come first.

**Independent Test**: Paste a screenshot. It uploads to the Library with progress, appears in the page, and the stored text has an image link. After reload it still shows.

**Acceptance Scenarios**:

1. **Given** a pasted, dropped or chosen image, **Then** it uploads as a Library image item with progress, and is inserted at the caret with alt text taken from its file name, which the learner can edit.
2. **Given** a file that is too large or not an image, **Then** nothing is inserted and the existing refusal sentence shows.
3. **Given** the image item is deleted from the Library, **Then** the page shows the alt text in its place.

### Edge Cases

- A toolbar or slash-menu action inside a formula's source, a code block or a raw block applies nothing that would change bytes there.
- Undo and redo span toolbar, slash-menu and bubble actions; a tutor edit arrives as a reload, not as an undo step.
- Opening and saving a page with no edit still stores identical bytes (feature 009 corpus test), including pages with tables, images and links.
- A tutor action while the page has unsent text: the text is saved first, and the message references the saved version.
- A tutor edit arriving while History or the outline is open.
- Very long pages: the outline and word count stay responsive.
- Print in the desktop app (Electron) and in a hosted browser.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The page pane MUST have a formatting toolbar with: undo, redo, text style (paragraph, heading 1–3), bold, italic, strikethrough, inline code, link, bulleted list, numbered list, checklist, quote, formula, table, image and Ask the tutor.
- **FR-002**: Each toolbar action MUST have a keyboard shortcut where a common one exists, shown in its accessible name. Ctrl/Cmd+K opens the link popover.
- **FR-003**: Links MUST be addable, editable, removable and openable in a new tab, and stored as Markdown links.
- **FR-004**: A slash menu MUST open on "/" at the start of an empty line, filter as the learner types, and insert the blocks listed in User Story 1.
- **FR-005**: Tables MUST offer add or remove row, add or remove column, and delete table.
- **FR-006**: An empty page MUST show a placeholder that is not stored.
- **FR-007**: A selection MUST show a bubble with bold, italic, link, Explain, Simpler, Quiz me on this and Ask….
- **FR-008**: Explain, Simpler and Quiz me on this MUST send a message at once in the beside-the-page session, referencing the page and quoting the selection. Ask… MUST only fill the composer.
- **FR-009**: Tutor actions MUST follow constitution II. Quiz me on this produces a graded check, and the answer never reaches the client before the learner answers. Pages are never written while a question waits.
- **FR-010**: A tutor version arriving on an open page MUST show its changed blocks highlighted, with step-through, Undo and Done.
- **FR-011**: Undo of a tutor edit MUST revert only the tutor's changed blocks, MUST keep the learner's later edits, and MUST be stored as a new version.
- **FR-012**: History MUST show a block-level comparison with the previous version, and offer naming, renaming or clearing a version's name, and copying a version's Markdown.
- **FR-013**: The pane MUST offer an outline of h1–h3 and a word count.
- **FR-014**: Export MUST offer Copy as Markdown, Download .md and Print. Print MUST show only the rendered page.
- **FR-015**: Pasting, dropping or choosing an image MUST upload it as a Library image item and insert a Markdown image link to it.
- **FR-016**: The stored text MUST stay Markdown with math. Untouched blocks keep their bytes (feature 009 codec rules).
- **FR-017**: The UI MUST follow DESIGN.md and Study ink:
  - one amber accent, used only for focus, the primary action and the selected item;
  - no gradients, shadows or side rules;
  - hidden scrollbars;
  - 44 px coarse targets;
  - layouts that work at 320, 390 and 1440 px.
- **FR-018**: New editor code MUST load with the editor, on demand. Startup MUST NOT regress (constitution VIII). Any new runtime dependency needs owner approval.

### Key Entities

- **Page version** (feature 009): gains an optional learner-given name.
- **Tutor change set**: the blocks a tutor version changed relative to its base, used for highlighting and undo. Derived, never stored.
- **Library image item** (feature 009): the target of an image link in a page.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A learner who knows no Markdown can make every block in User Story 1's independent test with mouse or keyboard alone, in under 3 minutes.
- **SC-002**: Opening and closing each page of the feature 009 corpus with no edit, and with an edit undone, stores identical bytes (100%).
- **SC-003**: Every toolbar, bubble, slash-menu, popover, outline and History control is reachable and operable by keyboard, with visible focus, at 320, 390 and 1440 px.
- **SC-004**: After a tutor edit, the learner can identify every changed place, and undo them with one action that keeps their own later typing (verified on a scripted two-place edit).
- **SC-005**: App startup and first page open stay within the constitution VIII budget.

## Assumptions

- The canvas boards are the approved starting look: toolbar row, bubble, slash menu, outline column, the tutor change bar and History compare. Exact strings not written here are settled in /speckit-clarify and the plan.
- The comparison is per block (paragraph, heading, list item, table, formula), not per character.
- Version names are learner-only; the tutor cannot name versions.
- Print uses the browser's own print dialog; no PDF library is added.
- A "practice question" entry in the slash menu (shown on the canvas) is out of scope; Quiz me on this covers it. This is confirmed in /speckit-clarify.
- Feature 009 bug fixes (.specify/bugs/page-editing-fixes) are in place.
