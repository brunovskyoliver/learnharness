# Feature 027: Reference chips

**Feature Branch**: `unified-redesign` (harness worktree branch; no branch of its own)

**Created**: 2026-11-08

**Status**: Draft

**Input**: Owner request (verbatim): "also lets have some kind of rich markdown for referencing files [screenshot: the Study composer showing plain text 'About this part of @Untitled note:' then '>' then 'Attaching Untitled note'] ... clicking on it would take me there and i can always return..."

## Clarifications

### Session 2026-11-08 (owner decisions given with the request)

- Q: What happens when he clicks a reference chip? → A: The item opens in the Library, in its full view, scrolled to the quoted passage (or the PDF page) with that passage highlighted. A "← Back to {lesson}" pill returns him to the exact message and scroll position he left; the browser's Back button does the same. This works the same way for every file type.
- Q: Where do chips appear, and what happens to the text field? → A: Chips appear everywhere a reference appears: in the composer, in his sent messages, and in tutor replies when the tutor names a Library item. In the composer the chips are drawn over the existing text field, so typing, paste, undo and IME composition behave as they do now, and Backspace removes a whole chip at once. The "About this part of … >" quote form renders as one chip that carries the quoted passage.
- Q: What does a chip show? → A: The item's kind icon, its name, and a hint such as "· p. 4" or the quoted passage.

### Session 2026-11-08 (gate 1, owner answered "ok": every recommendation)

- Q: What in a tutor reply becomes a chip? → A: Links the tutor writes to a Library item (today's `[name, p. 3](/library?item=…)` page citations, extended to any item) and an `@name` that resolves to a Library item by the server's rules. Plain words that happen to match a name stay text.
- Q: What does a chip show for an item that was renamed, moved to the trash or deleted for good? → A: Renamed: the item's current name, and it opens normally. In the trash: it opens the item's entry in the Library's Trash, where Restore is. Deleted for good: the name as written, faint, not a link, followed by "· no longer in your Library".
- Q: Do the reference rows above a sent message ("Used … · in full" and the rest) stay? → A: Yes, they stay. Their names open like a chip (the Library's full view and the Back pill) instead of the side pane or a new tab.
- Q: Is Notebook in scope? → A: No. Notebook's `[[…]]` links and its chat panel stay as they are.
- Q: How long does the Back pill last? → A: Until he goes back or leaves the Library. It stays while he opens other items or folders there, and it survives a reload.

### Session 2026-11-08 (gate 2, owner answered "go": every item in plan.md "Owner review at gate 2" and the analyze fixes)

- Q: How does the quote form look in the composer? → A: As the icon + name head joined to the passage lines drawn under it, with the `>` markers hidden; in the PDF form the hint is the literal ", page 4" drawn faint. Sent messages and tutor replies get the one-line chip.
- Q: What happens to the separate quoted block in sent messages? → A: The chip carries the passage. The separate quoted block and "Sent from page {n}" are no longer shown in the transcript.
- Q: Which icon for each kind? → A: The table in contracts/ui-contract.md §1, as proposed.
- Q: How does he leave the full view? → A: "← Library" replaces the pane's ✕.
- Q: What does a page say when the passage is gone? → A: "That passage is no longer in this page. Showing it from the top."
- Q: The tutor prompt sentence? → A: As written in contracts/ui-contract.md §3.
- Q: What does a `/library?item=` address open? → A: Any such address means the full view (a chip, a reload, a pasted address, a new tab, other links to it). Citation clicks inside Library pages keep opening the side pane.
- Q: What does a PDF passage of his say when its words are no longer found? → A: The PDF reader's existing line, "That passage wasn't found on page {n}. The file may have changed. Showing the page anyway."
- Feature 026 (implemented before this one, same branch): a git-mirrored item's @ name is its Library path, `{linked folder}/{repo path}` (for example `@Lecture notes/week1/notes.md`); its display name is the file name. An entry removed upstream reads "Removed from the repo". Chips follow both (FR-020).

### Standing rules that apply

- Constitution I–VIII. Under III, chips are presentation only: the text he sends and the text stored on disk stay byte-for-byte what they are today (`@name`, the quoted lines, `<library_passage>` blocks, citation links). No message format changes and no migration.
- Under IV, the existing labels that say how each item reached the agent ("Used … · in full", "outline only", "no text could be read", "no longer in your Library") stay visible to him.
- The UI follows feature 025's paper system in DESIGN.md.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Jump from a sent reference to the source and back (Priority: P1)

Mid-lesson he scrolls up to a message where he asked about a passage of his note. The reference reads as a chip with the note's icon, its name and the start of the passage. He clicks it. The note opens in the Library at that passage, highlighted. He reads around it, then clicks "← Back to {lesson}" (or presses the browser's Back) and lands on the same message at the same scroll position.

**Why this priority**: it is the "clicking on it would take me there and i can always return" half of the request, and it works on every message already on disk, with no change to how he writes.

**Independent Test**: seed a lesson with sent messages that reference a page (whole item), a page with a quoted passage, and a PDF passage with a page number. Click each chip; the Library opens on the right item, scrolled to and highlighting the passage or page. Use the pill once and browser Back once; both restore the message and scroll offset (within one line).

**Acceptance Scenarios**:

1. **Given** a sent message containing `@Untitled note` alone, **When** he clicks its chip, **Then** the Library shows Untitled note in its full view from the top.
2. **Given** a sent "About this part of @Untitled note:" message with a quoted passage, **When** he clicks the chip, **Then** the note opens scrolled to that passage with the passage highlighted.
3. **Given** a sent PDF passage from page 4, **When** he clicks the chip (hint "· p. 4"), **Then** the PDF opens on page 4 with the passage marked; if the words are no longer found, page 4 opens and the reader says so in its existing words: "That passage wasn't found on page 4. The file may have changed. Showing the page anyway."
4. **Given** he arrived in the Library from a chip, **When** he clicks "← Back to {lesson}", **Then** the lesson shows again with the same message in view at the scroll position he left, and focus returns to the chip he clicked.
5. **Given** he arrived from a chip, **When** he presses the browser's Back, **Then** the result is the same as the pill.
6. **Given** a reference to an image or another kind of file, **When** he clicks its chip, **Then** it opens in the Library's full view too, not in a new tab.
7. **Given** a sent message whose item has since been renamed, **When** it renders, **Then** the chip shows the current name and opens the item normally.
8. **Given** a sent message whose item is in the trash, **When** he clicks its chip, **Then** the Library's Trash opens with that item's entry in view and its Restore action reachable, and the Back pill shows.
9. **Given** a sent message whose item was deleted for good, **When** it renders, **Then** the chip shows the name as written, faint, not a link, followed by "· no longer in your Library".
10. **Given** the reference rows above a sent message, **When** he clicks an item's name in a row, **Then** it opens like the chip (Library full view and Back pill), and the row's wording is unchanged.
11. **Given** he arrived from a chip and then opened another item and a folder in the Library, and reloaded, **Then** the Back pill is still there and still returns to the lesson; once he leaves the Library by the sidebar, it is gone.
12. **Given** a sent "About this part of @Untitled note:" message, **When** it renders, **Then** it reads "About this part of", one chip (icon, name, the passage's first line), then ":"; the quoted lines are not shown again as a separate block, and a PDF passage shows no "Sent from page {n}" line.
13. **Given** a sent message referencing a git-mirrored item by its path (`@Lecture notes/week1/notes.md`), **When** it renders, **Then** one chip covers the whole path token and shows the file name "notes.md"; **When** that file was removed upstream, **Then** the chip shows the name faint, not a link, followed by "· Removed from the repo".

---

### User Story 2 - Chips in the composer while writing (Priority: P2)

He picks a Library item from the @ list, or uses "Ask…" on a selection. Instead of raw `@Untitled note` and a block of `>` lines, the field shows one chip (icon and name, with the passage lines drawn under it and their `>` markers hidden) and his cursor after it. He types his question, pastes, undoes, writes with an IME, all as before. Backspace right after the chip removes the whole chip. What is sent is exactly the text the field holds today.

**Why this priority**: it fixes what the screenshot shows (plain text that reads like code) at the point of writing, but sent messages and navigation matter more and stand alone without it.

**Independent Test**: in the chat composer, insert an item from the @ list and run "Ask…" on a page selection and on a PDF selection; each draws one chip. Type, paste, undo, redo and compose with an IME around the chips; Backspace after a chip removes it in one step and undo brings it back. Capture the request body on send and compare it with the same draft sent before this feature: identical.

**Acceptance Scenarios**:

1. **Given** an empty composer, **When** he chooses "Untitled note" in the @ list, **Then** a chip "Untitled note" with the page icon appears where the token was, and the caret sits after it.
2. **Given** "Ask…" on a selection in a page, **When** the composer fills, **Then** it shows one chip: the page icon and name as its head, joined to the passage lines drawn under it with the `>` markers hidden, followed by the caret on an empty line. For a PDF selection the head ends with ", page {n}" drawn faint.
3. **Given** the caret right after a chip, **When** he presses Backspace, **Then** the whole chip (name and any quoted passage it carries) goes in one step, and one undo restores it.
4. **Given** a draft with chips, **When** he reloads, **Then** the draft comes back with the same chips (drafts are text, so nothing new is stored).
5. **Given** a draft with chips, **When** he sends, **Then** the text sent is byte-identical to what the same draft sends today.
6. **Given** text he typed by hand that matches no Library item (for example `@nobody`), **Then** it stays plain text, as today.

---

### User Story 3 - Chips in the tutor's replies (Priority: P3)

The tutor answers and refers to one of his Library items (for example a page citation of a PDF). That reference shows as the same chip, and clicking it behaves exactly as in Story 1.

**Why this priority**: it extends the same affordance to the tutor's side; it depends on the chip and navigation built in Stories 1 and 2.

**Independent Test**: seed a tutor reply containing a page citation of a Library PDF and a reference to a Library page; both render as chips with the right icon, name and hint, and clicking them opens the Library at the right place with the Back pill.

**Acceptance Scenarios**:

1. **Given** a tutor reply that cites `[Notes.pdf, p. 3](…)` from his Library, **When** it renders, **Then** it shows a chip with the PDF icon, "Notes.pdf" and "· p. 3".
2. **Given** that chip, **When** he clicks it, **Then** the PDF opens in the Library on page 3 with the cited words marked, and the Back pill returns to that reply.
3. **Given** a tutor reply still streaming, **When** a reference completes, **Then** it turns into a chip without the text around it jumping.

---

### Edge Cases

- A sent message refers to an item that has since been renamed: the chip shows the current name and opens normally.
- A sent message refers to an item now in the trash: the chip opens that item's entry in the Library's Trash, with Restore.
- A sent message refers to an item deleted for good: the chip shows the name as written, faint, not a link, followed by "· no longer in your Library".
- A chip in a tutor reply names something that is not a Library item (no link to an item, no `@name` that resolves): it stays plain text.
- The quoted passage has been edited out of the page since the message was sent: the page opens at the top with "That passage is no longer in this page. Showing it from the top." For a PDF, the page opens with the reader's existing line "That passage wasn't found on page {n}. The file may have changed. Showing the page anyway."
- A git-mirrored item (feature 026) is referenced by its Library path, which contains "/" (`@Lecture notes/week1/notes.md`): the chip covers the whole path token by the server's rules (longest name first, so `@Lecture notes/…` never stops at an item named "Lecture notes" when the path resolves) and shows the file name. A renamed linked folder keeps old path tokens resolving through the item's previous names. In the composer the overlay can only restyle the characters typed, so the chip there shows the path as written.
- A git-mirrored item removed upstream (or its folder unlinked): faint, not a link, followed by "· Removed from the repo".
- A message refers to eight or more items, or the same item twice: each mention is its own chip; the over-count rule ("not attached, limit is 8 per message") is unchanged.
- An `@name` inside code (inline or fenced) or inside a PDF passage stays plain text, as the reference rules already say.
- A name containing spaces or punctuation, or an item whose name is also a prefix of another item's name: the longest match wins, as the server reads it, so the chip always covers exactly what the server attaches.
- The @ list's items haven't loaded yet in the composer: the text shows plain until they arrive, then chips appear without moving the caret or losing a keystroke.
- The learner selects across a chip and copies: the clipboard gets the underlying text (`@name`, the `>` lines), not a rendering.
- Long names and long passages: the chip truncates its hint to one line and wraps its name inside the column at 320 px; the full text is in the chip's accessible name.
- He opens a chip, then opens other items or folders inside the Library: the Back pill stays and keeps pointing at the lesson he came from. It goes when he uses it, goes back with the browser to the lesson, or leaves the Library by any other way (sidebar, tab, palette). A reload of the Library keeps it.
- He is offline or the Library fails to load after the click: the Library's existing failed state shows, and the Back pill still works.
- Hosted mode: a chip only ever resolves against the current tenant's Library.

## Requirements *(mandatory)*

### Functional Requirements

**The chip**

- **FR-001**: A reference to a Library item MUST render as a chip showing the item's kind icon, its name, and, when the reference carries a place, a hint: "· p. {n}" for a PDF page, or the start of the quoted passage (one line, truncated).
- **FR-002**: A chip MUST be presentation only. The text stored on disk, sent to the server, copied to the clipboard and exported MUST stay byte-identical to what the same input produces today.
- **FR-003**: Chips MUST be recognised by the same rules the server uses to resolve references (boundary before the @, longest name first, nothing inside code or PDF passages), so a chip appears exactly where an item is attached and nowhere else.
- **FR-004**: A chip MUST be keyboard reachable where it is a link (sent messages, tutor replies), have an accessible name stating the kind, name and place (for example "Open Notes.pdf, page 4"), show the visible focus ring, and meet the 44 px touch target on coarse pointers.
- **FR-005**: Chips MUST use feature 025's paper tokens and components, per DESIGN.md; DESIGN.md MUST gain a "Reference chip" entry describing them.

**Composer**

- **FR-006**: In every field that offers the @ list (chat, Home and new-session composers, the check answer fields and the practice field), references MUST be drawn as chips over the existing text field. Typing, paste, undo/redo, IME composition, the @ list, drafts and send MUST behave as they do now.
- **FR-007**: Backspace with the caret directly after a chip, or Delete directly before it, MUST remove the whole chip, including any quoted passage it carries, in one step that one undo reverses.
- **FR-008**: The selection actions' message form (`{lead} @{name}{tail}` followed by the quoted selection, and the PDF form with ", page N" and a `<library_passage>` block) MUST render as one chip carrying the passage; the lead words ("About this part of", "Explain this part of", …) stay readable as text. In the composer that chip is the icon + name head joined to the passage lines drawn under it, with the `>` markers hidden; in the PDF form the literal ", page {n}" is drawn faint as the hint. In sent messages and tutor replies it is the one-line chip of FR-001.
- **FR-009**: The "Attaching {names}" line under the field MUST stay as it is.

**Sent messages and tutor replies**

- **FR-010**: The learner's sent messages MUST render references as chips, including the quote form and PDF passages. The chip carries the passage: the separate quoted block and the "Sent from page {n}" line that PDF passages show today MUST no longer be shown in the transcript.
- **FR-011**: Tutor replies MUST render as chips (a) Markdown links whose address is a Library item (`/library?item=…`, with or without a page and quote) and (b) `@name` tokens that resolve to a Library item under FR-003's rules, with the same look and click behaviour. Nothing else in a reply becomes a chip. The tutor's prompt MUST ask it to link any Library item it names in that form, not only PDF pages.
- **FR-012**: The per-message reference rows required by constitution IV ("Used … · in full", "outline only", "no text could be read", "no longer in your Library" and the rest) MUST stay above the sent message, with their wording unchanged. A row's item name MUST open like a chip (FR-013, FR-015), not the side pane or a new tab.
- **FR-019**: A chip MUST follow the item's current state: a renamed item shows its current name and opens normally; an item in the trash opens its entry in the Library's Trash view, where Restore is; an item deleted for good shows the name as written, faint, not a link, followed by "· no longer in your Library".

**Navigation**

- **FR-013**: Clicking a chip MUST open the item in the Library's full view, for every file kind (pages, diagrams, Markdown, text, code, CSV, PDFs, images and other files), scrolled to the referenced passage or page and highlighting it.
- **FR-014**: When the passage can no longer be found, the item MUST open with an honest line saying so; nothing is guessed. A page opens at the top with "That passage is no longer in this page. Showing it from the top."; a PDF opens on the referenced page with the reader's existing line "That passage wasn't found on page {n}. The file may have changed. Showing the page anyway."; a page past the PDF's end shows the reader's existing page-count line.
- **FR-015**: After a chip opens the Library, a "← Back to {lesson name}" pill MUST be shown; it MUST return to the lesson with the clicked message in view at the same scroll position and focus on the chip. The pill MUST stay while he opens other items or folders in the Library and across a reload, and MUST go once he uses it, goes back to the lesson, or leaves the Library.
- **FR-016**: The browser's Back button MUST return to the same place as the pill, and Forward MUST reopen the item at the passage.
- **FR-017**: Opening a chip MUST NOT start a model call, change the draft, change the open lesson's state, or edit the item.
- **FR-018**: A Ctrl/Cmd-click or middle-click on a chip MUST open the same Library address in a new tab, without the Back pill.
- **FR-020**: Chips MUST handle feature 026's git-mirrored items: an @ name that is a Library path containing "/" (`{linked folder}/{repo path}`) is one chip covering the whole token, showing the item's display name (the file name) outside the composer; an entry removed from the repo (upstream delete or unlink) renders faint, not a link, followed by "· Removed from the repo".
- **FR-021**: Any `/library?item=…` address MUST show the item in the Library's full view and keep the address (a chip, a reload, a pasted address, a new tab, and the app's other links to it). Citation clicks inside Library pages keep opening the side pane.

### Key Entities

- **Reference chip**: a rendering of one reference found in text. Carries the item it points at (id, current name, kind), an optional place (PDF page and/or quoted passage), and the span of underlying text it covers. Never stored.
- **Reference target**: the Library address a chip opens: item, optional page, optional quote. Reuses the existing Library citation address.
- **Return point**: where to come back to: the lesson, the message, the scroll offset and the chip that was clicked. Lives in the browser for the visit (its history and this tab's session storage, so a reload keeps it); never written to the learner's data. Cleared when he goes back or leaves the Library.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a fixed set of drafts (whole-item references, every selection action on pages and PDFs, names with spaces and punctuation, references inside code), the sent text and the stored message are byte-identical before and after the feature (0 differences).
- **SC-002**: From a chip in any visible message, he reaches the referenced passage in one click, and back to the same message in one click or one Back press, with the scroll position restored to within one line.
- **SC-003**: Every chip in seeded transcripts opens the right item at the right place for each of the nine Library kinds.
- **SC-004**: Typing around chips in the composer shows no dropped or reordered keystrokes and no caret jumps across typing, paste, undo/redo and IME tests.
- **SC-005**: Chips and the Back pill pass keyboard-only use, visible focus, 44 px touch targets and layout at 320, 390 and 1440 px without overflow, in light and dark.
- **SC-006**: Startup JavaScript, cold sidebar readiness and app startup stay within 5% of the recorded baseline (constitution VIII).

## Assumptions

- The Library's "full view" of an item is the Library route with that item filling the content area (no side pane), on desktop and phone; for pages it is the existing page editor surface, for PDFs the existing reader. Images and other files, which open in a new tab today, get a read-only full view there. Layout: contracts/ui-contract.md §4 (owner, gate 2).
- Clicking a chip replaces today's open-beside-the-lesson behaviour for chips; other ways of opening an item beside the lesson (the right pane, tabs, the palette) are unchanged.
- The Back pill is a primary-style floating pill on paper, placed so it never covers the content's first line, reachable by keyboard, and announced to screen readers; on phones it sits clear of the safe area.
- The lesson name in the pill is the session's current title.
- Drafts stay plain text in the browser; chips are re-derived from the text and the Library list each time.
- References keep working exactly as today on the server: resolution at send, the 8-per-message limit, modes and labels.
- Out of scope: Notebook mode. Its editor's `[[…]]` wiki links, its chat panel and its instruction line are unchanged (owner, gate 1).
- Feature 026 is implemented before this one on the same branch. A chip treats a mirrored item like any other item, except that its @ name is its Library path (FR-020). A mirrored item removed upstream is shown like the deleted-for-good case (faint, not a link) with 026's wording, "· Removed from the repo", in place of "· no longer in your Library". Chips use 026's helpers for both, so they never drift from it.
- No new runtime dependencies.
