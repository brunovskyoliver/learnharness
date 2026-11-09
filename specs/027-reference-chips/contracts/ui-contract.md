# UI contract: Reference chips (027)

Paper tokens only (DESIGN.md, feature 025). Items marked **[owner, approved]** were approved by the owner at gate 2 ("go", 2026-11-08) as written; everything else follows from the spec and the code.

## 1. The chip

| Part | Sent message / tutor reply | Composer |
|---|---|---|
| Ground | `bg-shelf`, radius 6px, `px-1.5`, no vertical padding | the other surface from `box-shadow: 0 0 0 3px` + radius 6px: `--paper` on the shelf prompt shell, `--shelf` elsewhere; no padding or margin (research R3; phase 4) |
| Icon | 12px, graphite, before the name, `aria-hidden` | 12px, graphite, centred over the transparent `@` |
| Name | ink, the surrounding size and weight | ink, the field's size and weight (same characters) |
| Hint | ` · p. {n}` or the passage's first line, faint, one line, ellipsis; the whole chip is one line and never breaks inside its name: past the column's width the hint gives way, then the name ends in an ellipsis (`title` = the full name; owner, phase 3 review) | PDF form: the literal `, page {n}` drawn faint. Page form: the `>` lines drawn as the chip's passage body, graphite italic, markers transparent, on the same shelf block |
| Hover | name underline ink 40% → ink (as links) | none (not a link) |
| Focus | 2px `--nb-focus` outline, offset 2px | the field's caret only |
| Coarse pointer | 44px hit box (inline-flex, transparent padding) | n/a |
| Deleted for good | faint name, no ground, no underline, not focusable, followed by ` · no longer in your Library` (the existing `NO_LONGER_IN_LIBRARY`) | drawn faint like sent messages, not a link: the server still resolves the name and attaches a "no longer in your Library" reference, so the composer and the transcript agree with what is attached (analyze M1, 2026-11-08) |
| Removed from the repo (026) | as deleted, followed by ` · Removed from the repo` (026's constant) | drawn faint like the deleted case (owner, 2026-11-08); the names come from `GET /api/library`'s `removed: [{ id, names }]` |
| Mirrored item (026) | name = display name (the file name); the chip covers the whole `@{linked folder}/{repo path}` token | the path as typed (the overlay restyles characters only) |
| Equal names (analyze M2) | when two chips in one text would show the same name for different items (two mirrored `notes.md`), each shows its parent folder as a faint hint after the name (` · week1`), and its accessible name uses the full Library path ("Open Lecture notes/week1/notes.md, Markdown") | n/a: the path is typed out |

Class names: `.lh-ref-chip`, `.lh-ref-chip-icon`, `.lh-ref-chip-hint`, `.lh-ref-chip-folder` (M2), `.lh-ref-chip[data-state="deleted"]` (and `"removed"`), `.lh-ref-field`, `.lh-ref-mirror` in `app/paper.css`. Data attributes: `data-ref-chip="{messageId}:{key}"`, `data-source` (the exact underlying text, for copy). Test ids: `ref-chip`, `ref-chip-hint`, `ref-mirror`, `back-pill`, `library-full-view`.

### Kind icons **[owner, approved]** (lucide; none exists per kind today: tabs use FileText and Network)

| Kind | Icon |
|---|---|
| page | `NotebookTextIcon` |
| markdown | `FileTextIcon` |
| text | `FileTextIcon` |
| code | `FileCodeIcon` |
| csv | `SheetIcon` |
| pdf | `FileTypeIcon` |
| image | `ImageIcon` |
| diagram | `NetworkIcon` (as tabs) |
| other | `FileIcon` |

### Accessible names (FR-004)

| Case | Name |
|---|---|
| Whole item | `Open {name}, {kind label}` (kind label from `KIND_LABEL`, e.g. "Open Untitled note, Page") |
| PDF page | `Open {name}, page {n}` |
| Passage | `Open {name} at the passage "{first 80 characters}"`; the full passage in `aria-description` |
| Trashed | `Open {name} in the trash` |
| Deleted | text, read as `{name} · no longer in your Library` |

## 2. Sent messages

- LEAD words as text, the chip, then the tail words (e.g. "About this part of [chip]:"). The quoted lines / passage block are carried by the chip (hint = first line) and not shown as a separate block. **[owner, approved]** (today the PDF passage shows as an italic quote with "Sent from page {n}"; this replaces it with the chip.)
- "Sent from page {n}" is removed (the chip's "· p. {n}" replaces it).
- Reference rows above the message: unchanged wording; the name is a link that opens like a chip (live, trashed) or ink text (deleted, missing).

## 3. Tutor replies

- `[label](/library?item=…)` links and resolving `@name` render as chips. The chip shows the current name; a citation's page shows as `· p. {n}`.
- Prompt addition in `src/agent/prompts/shared/32-documents.md`, appended to the existing paragraph **[owner, approved]**:

  > When you name an item from his Library, link it so he can open it: `[name](/library?item=ID)`, with the id from `library_list` or the `<library_item>` block.

## 4. Library full view

- Any `/library?item=ID…` address shows this view (chips, reloads, pasted addresses, new tabs, the notebook links panel, card source links) **[owner, approved]**; citation clicks inside Library pages keep opening the side pane.
- `/library?item=ID…`: the top bar and tabs as on `/library`, then the item's surface across the content column (no list, no resize edge). Header as the pane's header, its ✕ replaced by a toolbar word: `← Library` (`aria-label="Back to Library"`) **[owner, approved]**.
- Pages: the page editor; PDF: the reader; diagram: the diagram surface; Markdown, text, code, CSV: the read-only view; image: the image fit to the column width, its name as `alt`; other: `{Kind} · {size}` and `Download` as a text action.
- Landing lines (existing unless marked new):
  - PDF, tutor citation: "Quote found on page {n}." / "This quote isn't on page {n}, so the citation can't be confirmed. Showing the page anyway." / "Showing page {n}. This link names no words to check."
  - PDF, his passage: "That passage wasn't found on page {n}. The file may have changed. Showing the page anyway."
  - PDF, page past the end: "This PDF has {n} pages, so page {p} doesn't exist."
  - Page, passage gone (new) **[owner, approved]**: "That passage is no longer in this page. Showing it from the top."
  - Item gone (existing): "That document is no longer in your Library, so the citation can't be checked."
- Trash: `/library?view=trash&entry=ID` scrolls the entry into view, gives it the shelf for 2s (the Documents landing style) and focuses its Restore.

## 5. Back pill

- Text: `Back to {title}` with `ArrowLeftIcon` before it (the spec's "←"); `{title}` is the session's current title, or `UNTITLED_SESSION` ("Session") when it has none.
- The primary pill (`.nb-pill`), fixed at the content column's left edge, 12px under the tabs; on phones 16px above `env(safe-area-inset-bottom)` at the left gutter. The column gets 44px extra top padding while it shows, so it never covers the first line.
- Keyboard: it is the first stop after the band; Enter or Space activates. Announced once in a polite live region: "Back to {title} is available."
- After return: the clicked chip has focus (visible ring), the message at the saved reading position.

## 6. States

| State | Composer | Sent / tutor |
|---|---|---|
| List loading | plain text, as today | chips render from the message's own references (sent) or plain text and links (tutor) |
| List failed | plain text, as today | as loading; nothing claims an item is gone |
| Offline on click | n/a | the Library's existing failed state; the pill still works |

## 6a. Owner fixes (owner-approved 2026-11-08)

- Composer, under the field with the "Attaching {names}" line: each reference whose name reaches an item in the Trash or deleted for good adds a faint line "{name} is no longer in your Library"; one removed from its repo, "{name} was removed from the repo" ({name} as written, a mirrored path included). Gone names are no longer listed on the Attaching line. Sending is never blocked.
- At 360px and below, when the compact composer row shows the model/usage controls (no models set up), they move below the field so the "Message" placeholder has the full width.
- A chip and the punctuation right after it (`.,:;!?…)]}»”’"'`) never break apart: they share one `white-space: nowrap` group and the chip gives up width (bug fix, the quote form's ":" on phones).

## 7. Motion and scrolling

Colour transitions 150ms; none under reduced motion. The mirror and the full view hide scrollbars like every scroller.

## 8. DESIGN.md

Add "Reference chip" under "Library, @ list, page pane and notes", summarising §1, §2, §5 and the full view, and a line under Layout for the Back pill. Done in the polish phase.
