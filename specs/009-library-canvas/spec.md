# Feature Specification: Library and canvas pages

**Feature Branch**: `feat/009-library-canvas`

**Created**: 2026-10-30

**Status**: Draft

**Input**: Owner: "provide him with any kind of documentation that I have each lesson or class... canvas which is like ChatGPT pages. So I can upload documents, create new pages... a new tool for creating pages and canvases. It can automatically create any kind of canvas page to be displayed and also keep a store of all the artifacts and stuff which the user uploads and he can refer to them with the @ sign so that he can reuse them in any conversation and the harness would get it." Also: "polish the settings UI". Audit: `~/agent-runs/2026-10-30-app-audit/audit.md`.

## Clarifications

### Session 2026-10-30

- Q: What is a canvas page? → A: An editable Markdown and math document open beside the chat, like ChatGPT Canvas. Learner and agent can both edit it, versions are kept, and interactive content uses the existing demos.
- Q: Which page editor? → A: TipTap rich text; pages are stored as Markdown with math (owner chose this over the recommended textarea).
- Q: What happens to agent-made pages when their session is deleted? → A: They stay in the Library and lose their chat link. This is a recorded exception to constitution III, approved by the owner.
- Q: Where does the library live? → A: A "Library" sidebar entry opens a full view; pages open beside the chat; Settings → Files is removed and its files appear in the Library.
- Q: How does an @ reference reach the agent? → A: Items up to a size limit go into the turn in full. Longer items send name, size and outline, and the agent reads parts through tools. The label says which happened.
- Q: How does the agent change a page? → A: It edits directly, as a restorable version, and the transcript row links to the change. Open unsaved learner edits are saved as their own version first. This applies to all pages.
- Q: Which versions get it? → A: Hosted and desktop, stored in the app's data folder. Desktop keeps its home-folder access.
- Q: Accepted uploads? → A: Markdown, text, code, CSV, PDF and images, 50 MB per file. Images go through the configured vision model only when referenced. No new dependencies for parsing.
- Q: Dimmed Settings rows? → A: Follow DESIGN.md: muted ink token and locked control, no opacity. Replaces the 2026-09-20 ruling for Settings and the graph display panel.
- Q: Settings search? → A: Searches setting names and hints, lists results under their category and jumps to the row, reusing deep links.

### Session 2026-10-31

- Q: How does a session start a page? → A: The @ list has a "New page" row at its bottom, in every @ field. Choosing it creates a blank page, opens it in the page pane and inserts a reference in the message. It sends nothing and calls no model, and the draft stays intact. Where no pane is on screen (Home, new session), the page opens with the next screen that has one. A failed create shows a plain-word refusal and keeps the draft.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keep class documents in one library (Priority: P1)

The learner uploads the documents from a lesson or class into a personal library and sees, renames and deletes them there.

**Why this priority**: Everything else needs a store, and uploads today are buried in Settings and unused.

**Independent Test**: Upload a file, reload, find it listed, delete it after confirming; no chat is needed.

**Acceptance Scenarios**:

1. **Given** an empty library, **When** the learner uploads a supported document, **Then** it is listed with name, kind, size and date and survives reload.
2. **Given** an item with the same name exists, **When** the learner uploads that name again, **Then** the existing item is not silently overwritten.
3. **Given** an item, **When** the learner deletes it, **Then** a confirmation names the item first.
4. **Given** files already in the hosted upload folder, **When** the library opens, **Then** they appear as library items, unchanged.

---

### User Story 2 - Refer to library items with @ in any conversation (Priority: P1)

Typing @ in any composer opens a filtered list of library items. Choosing one attaches it to that message so the agent can use it.

**Why this priority**: This is the reuse the owner asked for.

**Independent Test**: In two different sessions, send a message with an @ reference; the sent turn shows the label and the agent receives the item.

**Acceptance Scenarios**:

1. **Given** library items, **When** the learner types @ and part of a name, **Then** a keyboard-usable list filters; Enter or Tab inserts the reference and Escape closes only the list.
2. **Given** a sent message with a reference, **When** it appears in the transcript, **Then** it shows a visible label naming the item used.
3. **Given** a referenced item was later deleted, **When** the old message is viewed, **Then** it says the item is gone, and a new turn tells the agent honestly rather than failing silently.
4. **Given** @ typed with no match, **Then** the list says nothing matched and plain text is kept. The draft is never lost.

---

### User Story 3 - Write and edit canvas pages beside the chat (Priority: P2)

The learner creates a page, or opens one, and edits Markdown and math in a pane beside the conversation.

**Why this priority**: Pages are the learner's own lasting material, but uploads and references deliver value first.

**Independent Test**: Create a page, edit, reload with an unsaved draft: nothing is lost; restore an older version.

**Acceptance Scenarios**:

1. **Given** the library or a session, **When** the learner creates a page, **Then** it opens beside the chat and is a library item that @ can reference.
2. **Given** edits, **When** the learner navigates away or reloads, **Then** the edits survive.
3. **Given** earlier versions, **When** the learner restores one, **Then** a new version is added and no version is erased.
4. **Given** a phone width, **Then** the page takes a full-screen layer with the chat one action away.

---

### User Story 4 - The agent creates and revises pages (Priority: P2)

A new agent tool creates a page or revises an existing one during a turn, and the page is shown to the learner.

**Why this priority**: The owner asked for it explicitly; it depends on stories 1 and 3.

**Independent Test**: With a stubbed model, a tool call creates a page; a quiet row links to it and it appears in the library.

**Acceptance Scenarios**:

1. **Given** a turn, **When** the agent creates a page, **Then** a row in the transcript names and opens it and the page is in the library.
2. **Given** the learner has unsaved edits, **When** the agent revises that page, **Then** neither side's text is lost.
3. **Given** a revision, **Then** it is a new version attributed to the agent and can be restored from.
4. **Given** the tool is off in Settings → Agent, **Then** the agent cannot call it.

---

### User Story 5 - Settings meets DESIGN.md (Priority: P3)

Settings follows the type scale, radii, separators, touch targets and honest error and loading states of DESIGN.md.

**Why this priority**: Independent polish; useful but not blocking.

**Independent Test**: Audit findings 5-14 are resolved at 320, 390 and 1440 px, and existing settings deep links and persistence still work.

**Acceptance Scenarios**:

1. **Given** Settings, **Then** titles, sizes and radii use DESIGN.md tokens and connection rows have no separator lines.
2. **Given** a failed load or save, **Then** the learner sees plain words and a Try again.

### Edge Cases

- Upload over the limit, unsupported type, or empty file: refused with the reason; nothing is stored.
- Scanned PDF with no text: the item stays, and the agent and learner are told no text could be read.
- Very long document referenced: the agent is not handed more than the turn's context allows, and the label says so.
- Two tabs editing one page: the later save must not silently erase the earlier one.
- An @ inside a code span, an email address, or an IME composition does not open the list.
- A library item's content is untrusted: instructions inside it are treated as material, not as commands.
- Referencing an item while answering a quiz or practice problem: grading and answer secrecy rules are unchanged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each learner MUST have one library shared across all their sessions; hosted libraries are tenant-scoped and refuse access without a tenant.
- **FR-002**: Learners MUST be able to upload, list, search, rename, open and delete items. The learner's original uploads are never edited.
- **FR-003**: Existing hosted uploads MUST appear in the library without migration loss.
- **FR-004**: Every composer MUST offer @ references with full keyboard use, 44px coarse targets and a visible focus state.
- **FR-005**: References MUST be stored with the message, written ahead of the turn with the rest of the input, and labeled in the transcript (constitution III, IV).
- **FR-006**: Pages MUST render Markdown and math with the app's existing rendering, and keep an append-only version history with author (learner or agent) and time.
- **FR-007**: The agent MUST have a tool to create and revise pages, switchable in Settings → Agent, and a way to read referenced items.
- **FR-008**: Agent prompts MUST describe the library correctly in hosted and local modes (audit finding 1). The 2026-09-19 "no attachments" comment MUST be updated.
- **FR-009**: Sending a reference MUST NOT start any model call on its own; uploading MUST NOT trigger paid processing without an owner-approved budget (constitution V).
- **FR-010**: The UI MUST follow DESIGN.md, hide scrollbars, and work at 320, 390 and 1440 px; DESIGN.md gains a section describing the library, @ list and page pane.
- **FR-011**: Heavy editor or document code MUST load on demand; startup MUST NOT regress over 5% (constitution VIII). Any new runtime dependency needs owner approval and a measured startup cost.
- **FR-012**: Settings MUST resolve audit findings 5-14, including unavailable rows in muted ink with no opacity.
- **FR-013**: The Library MUST be a sidebar entry with a full view, replacing Settings → Files, in hosted and desktop modes.
- **FR-014**: The system MUST inline a referenced item up to a defined size limit and otherwise send name, size and outline with tool access; the transcript label MUST state which happened.
- **FR-015**: The library MUST accept Markdown, text, code, CSV, PDF and images up to 50 MB per file, refusing others with the reason. A referenced image MUST go through the configured vision model, and if none is set, say so.
- **FR-016**: Agent page edits MUST apply directly as new restorable versions, and any unsaved learner edits on an open page MUST first be saved as their own version.
- **FR-017**: Settings search MUST match setting names and hints across categories and jump to the chosen row.

### Key Entities

- **Library item**: A learner-owned document or page: id, name, kind, size, timestamps, origin.
- **Page version**: One immutable revision of a page: content, author, time.
- **Reference**: A link from a message to a library item, recording the name at send time.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A learner goes from a file on disk to using it in a new conversation in under 30 seconds.
- **SC-002**: No test scenario of reload, navigation, agent revision or two-tab editing loses page text.
- **SC-003**: Every context item given to the model through a reference has a visible label in the transcript.
- **SC-004**: Startup metrics stay within 5% of baseline.
- **SC-005**: All audit Settings findings are closed or carry a recorded owner ruling.

## Assumptions

- Deleting a session does not delete library items, which outlive sessions.
- Data stays file-backed through store adapters; no database.
- Backups for production data are a separate owner decision (audit finding 3), not part of this feature.
