# Features 019-020: Document intelligence

**Branch**: `feat/019-document-intelligence`, from `feat/016-intelligent-notes`
**Created**: 2026-10-31
**Status**: Implemented, not merged or deployed

**Input (owner)**: "Implement full-text search across notes and supported files with snippets, filters and jump-to-passage. Extend PDF.js with selections, highlights, annotations, contextual AI questions and verifiable page citations. Extract notes/questions from source passages. Start with deterministic indexing, handle unsupported/scanned files explicitly, enforce tenant boundaries and safe reindexing."

The two roadmap features share these documents.

## Clarifications

The owner approved every recommended option and asked for no questions (ROADMAP standing rules). Each decision below was made under that approval.

### Index
- **Form**: one JSON shard per item under `library/search/g_<generation>/`, with `library/search/current.json` naming the live generation. No database. Deleting `library/search/` loses nothing.
- **Matching**: every term must appear, as a substring, after folding case, accents and whitespace. A quoted phrase is one term. If no single passage holds them all but the item does, its fullest passage is the hit. No stemming, no fuzzy matching, no model.
- **What is read**: a page's head version; Markdown, text, code and CSV up to 8 MiB; PDF text per page. Never a draft or an old version. Markdown syntax and link targets aren't indexed, so a source link's URL can't match.
- **Names, folders and tags** come from the catalog at query time. A rename or move changes the results immediately and re-reads nothing.
- **Archived**: the brief says archived items are excluded "only if a filter says so". So they are searched by default, labelled "Archived", and "Hide archived" drops them. This differs from the Library's All view, which hides them.
- **Trashed**: the catalog decides what exists, so a trashed item leaves results at once, before its shard is removed. Restore reads it again.
- **States**: indexed, pending, failed, no-text, unsupported. A file over 8 MiB is unsupported, with the reason "Too large to search." A name match on a file with no text still returns it, with the reason and no snippet.
- **Triggers**: every Library write emits `library-changed`, including the agent's. One listener debounces it into a catch-up, in the emitter's tenant context. A search or status request that finds something behind schedules a catch-up too, so a change from outside (a file dropped in `files/`) is still picked up.
- **Reindex** is a full rebuild into a new generation with a swap at the end. A catch-up writes shard by shard, each atomically.

### Search surface
- The Library field gets **Names | Full text**. Names stays the default and remains the client-side filter it always was; the choice persists per browser with sort and layout.
- Full text uses the Library's existing Type select and tag links, and adds Folder and Hide archived. Sort, direction and layout hide, because they don't apply to a ranked list. It searches the whole Library, and says so when a view such as Favorites is open.
- The palette keeps its name matches and adds a group, "Inside your documents", after them.
- Up to 3 hits per item, 50 per response by default.

### Reader
- PDFs open in the right pane with a tab. Images keep the new tab. The pane header has "Open in a new tab" and "Download"; a Library row's menu has both too.
- **Scripting**: the reader uses pdf.js's core API only. It has no annotation layer, no scripting manager and no sandbox bundle, so nothing in a file can run, and a PDF's own links and form fields aren't active. `isEvalSupported: false`, `enableXfa: false`.
- **Worker and assets**: served from the installed package at `/pdfjs/...`, outside `/api` so a worker's request needs no desktop header. No CDN. The legacy build is used for the wider browser range; it loads only with the first PDF.
- A selection crossing pages uses the part on its first page, and says so.
- Highlight colour on paper is data, like a chart's, not the accent. A note also underlines, so colour isn't the only signal.

### Anchors
- An annotation stores a page, a quote with 32 characters each side, a start offset, and rectangles as fractions of the page. The quote decides where a mark goes on a drawn page; the rectangles only fill the moment before the text layer is ready.
- Quote comparison ignores case, accents and all whitespace. Repeats are told apart by context, then nearness to the offset.
- A quote no longer on its page, or a page past the end, is listed as "This text is no longer on that page." It keeps its row and can be removed; it is never dropped.
- Annotations stay through the trash and go when the item is purged or deleted. Removing one offers Undo.
- A damaged annotations file is renamed aside, not overwritten.

### Citations
- A citation is `[PDF: name, p. 3](/library?item=ID&page=3&quote=words)`, an ordinary Markdown link. It works from a note, the transcript, a new tab or an export.
- Quote at most 200 characters, cut on a word.
- The viewer checks it on the page: "Quote found on page 3.", "This quote isn't on page 3, so the citation can't be confirmed. Showing the page anyway.", "This PDF has 3 pages, so page 9 doesn't exist.", and for no words "This link names no words to check."
- The tutor is told the form in a new shared prompt fragment, `shared/32-documents.md`, and to cite only words it read on that page. Feature 009's approved wording is untouched. A tutor can still write a wrong citation; the viewer's check is what makes that visible.

### Contextual questions and extraction
- Explain, Summarize, Challenge, Generate questions and Ask…, on explicit click only. No edit actions: the file can't change.
- The passage goes in the message as `<library_passage item page>`, with its closing tag escaped from the body. The prompt says it is material. An `@name` inside it attaches nothing. The learner's transcript shows a quote and "Sent from page N", and the reader shows "Sent to the tutor: this passage from page N of {name}."
- The bubble states before the click that the passage is what gets sent.
- Questions go through the tutor's existing quiz mechanics, so answers stay on the server until answered. The reader holds none.
- Save to a page reuses feature 017's dialog and `appendToPage`: one learner version with cause `passage`, the draft committed first. The source name comes from the server, never the client.

### Dependencies
None added. `pdfjs-dist` was already installed. It loads on demand in the browser.

## User stories

1. **Find it (019, P1).** Search inside notes and files, see the words in context, narrow by type, tag or folder, and land on the passage.
2. **Know what wasn't searched (019, P1).** A scan, an image or a broken file is named, with why.
3. **Read in place (020, P1).** A PDF opens beside the lesson.
4. **Mark it up (020, P1).** Highlights and notes survive a reload and a zoom, and never touch the file.
5. **Ask about it (020, P1).** A question on a passage goes on a click, labelled.
6. **Check a citation (020, P1).** A citation opens the page, marks the quote, and says when it can't.
7. **Keep it (020, P2).** A passage goes to a note with its citation, or becomes graded questions.

## Requirements

- **FR-001** Search parses no PDF on the request path and yields while scanning.
- **FR-002** A reindex of unchanged sources writes identical shard bytes and reads nothing on a catch-up.
- **FR-003** A torn shard or pointer reads as missing and is rebuilt. A rebuild's old generation serves until the swap.
- **FR-004** Every item has an explicit state. An empty result still names what wasn't searched.
- **FR-005** Snippets are text nodes and `<mark>` only.
- **FR-006** Results never include trashed items, drafts or old versions.
- **FR-007** Every index, highlight and annotation path is tenant-scoped. Another tenant's id is a 404.
- **FR-008** Annotations never write to the file. A mismatch is listed, not dropped.
- **FR-009** Every citation carries item id, page and quote, and the viewer reports whether the quote is on that page.
- **FR-010** Nothing reaches a model without an explicit click.
- **FR-011** pdf.js and the reader's CSS load with the first PDF; initial JS stays within 5%.

## Success criteria

- `tests/document-search.test.ts`, `document-anchors.test.ts`, `document-index.test.ts`, `render-documents.test.tsx` pass.
- `scripts/check-documents-ui.mjs` passes at 1440, 390 and 320, on the dev server and on the standalone server.
