# Plan: Document intelligence (019-020)

## Constitution Check

| Principle | Result |
| --- | --- |
| I Owner decides | Pass. Owner approved all recommendations and asked for no questions (ROADMAP); decisions are in spec.md, Clarifications. |
| II Teaching theory first | Pass. Generated questions use the tutor's quiz mechanics, so answers stay on the server until answered. The reader holds no question or answer. Nothing writes to a graph ledger. |
| III Learner data is never lost | Pass. Files are never edited. The index is rebuildable and separate. Annotations are additive, stay through the trash, and a mismatch is listed. A damaged annotations file is set aside. A saved passage commits the draft first. Golden fixtures are untouched. The reading position persists per browser. |
| IV Honest states | Pass. Five item states, in words. Loading, empty and failed are distinct; a failed refresh keeps results. A citation says when its quote isn't on the page. Unknown ids get 404, bad bodies 400. |
| V Consent before cost | Pass. Indexing calls no model. Selecting and opening a citation send nothing, shown by the browser check. Each tutor action sends on its click. |
| VI Interface follows DESIGN.md | Pass. Raised steps only, no amber except focus and a dialog's primary. Highlight colours on paper are data and recorded in DESIGN.md. Hidden scrollbars, Escape innermost first, coarse targets 44px, 320/390/1440 checked. One known keyboard limit: see Known limits. |
| VII Boundaries and tenancy | Pass. Writes only in `src/store`; `src/core` modules are pure; every route uses `withTenant`, with tests. PDF content runs nothing, and a passage is wrapped as material. |
| VIII Performance | Pass, measured in progress.md. pdf.js, the reader, its CSS and the search panel load on demand. PDF parsing stays in a per-tenant background queue. |

## Module map

- `src/core/document-search.ts`: folding, passages, queries, hits, snippets, filters, wire types.
- `src/core/document-anchors.ts`: quote location, anchors, citations, marked passages.
- `src/core/command-palette.ts`: `passageGroup`.
- `src/store/library-index.ts`: generations and shards. `src/store/library-annotations.ts`: annotations. `src/store/library.ts`: removes annotations on purge.
- `src/server/library-index.ts`: queue, catch-up, rebuild, search, watcher. `src/server/documents.ts`: handlers and the asset route.
- `src/agent/subagents/pdf-ops.ts`: `pdfPageTexts`. `src/server/library-text.ts`: `enqueuePdfWork`.
- `components/library/document-search.tsx`, `use-document-search.ts`, `doc-snippet.tsx`: search UI.
- `components/library/pdf-reader.tsx`, `pdf-reader.css`, `pdf-options.ts`: the reader.
- `components/library/page-pane.tsx`, `page-pane-context.tsx`, `components/workspace/workspace-context.tsx`: the pane door and `jump`.
- `components/library/page-editor.tsx`, `page-editor-extras.ts`: `jumpToText`, the jump decoration, citation links.
- `components/transcript-passages.tsx`, `components/user-turn-text.tsx`: citations in the transcript.

## Contracts

### Files (tenant-scoped, under `library/`)

```
search/current.json              { version: 1, generation: "g_x" }
search/g_x/<itemId>.json         { v, itemId, signature, state, reason?, passages: [{ block | line | page, text }] }
annotations/<itemId>.json        { version: 1, annotations: [{ id, itemId, anchor, note?, fingerprint, createdAt, updatedAt }] }
```
`anchor`: `{ page, quote, prefix, suffix, start, rects: [[x, y, w, h], …] }`, rects as fractions of the page. `signature`: `page:{head}:{size}`, or `{kind}:{size}:{mtime}`.

### API (all `withTenant`, all `no-store`, none calls a model)

| Route | Answers |
| --- | --- |
| `GET /api/library/search?q&kind&tag&folder&archived=hide&limit` | `{ query, results, total, status }`; 400 for an over-long query or an unknown kind |
| `GET /api/library/search/status` | `{ counts, notSearched, building }` |
| `POST /api/library/search/reindex` | 202 `{ started }`, returning at once |
| `GET /api/library/items/{id}/annotations` | `{ annotations, fingerprint }`; 404 unknown, trashed, another tenant's, or not a PDF |
| `POST` same `{ anchor, note? }` | 201 `{ annotation }`; 400 bad anchor or note |
| `PATCH /api/library/items/{id}/annotations/{aid}` `{ note }` | `{ annotation }`; null clears the note |
| `DELETE` same | `{ ok }`; 404 |
| `POST /api/library/pages/{id}/document-passages` `{ text, itemId, page }` | 201 `{ item, version }`; 400, 404, 413 |
| `GET /pdfjs/{…}` | The local worker, fonts, cmaps, wasm and ICC profiles, by allow-list; 404 otherwise |

A result: `{ id, itemId, name, kind, size, location, archived, tags, state, reason?, snippet: { text, ranges, before, after } | null, jump: { page, quote, terms } | { line, terms } | { block, quote, terms } | null }`.

### Events
`library-index-changed { building }`, added to the vocabulary.

### UI strings
- Field: `Names`, `Full text`, placeholder `Search inside your notes and files…`.
- Panel: `Folder`, `Anywhere`, `Hide archived`, `{n} matches`, `Showing {n} of {m} matches`, `Nothing matched`, `Type at least 2 characters.`, `Searching…`, `The search could not be run.`, `Searching the whole Library, not only {view}.`, `Reindex`, `Show which`, `Reading {n} of {m}…`, `{n} searched · {n} waiting to be read · {n} with no readable text · {n} that can't be searched · {n} that could not be read`.
- Palette: `Inside your documents`, `Searching inside your documents…`, `Your documents could not be searched.`
- Reader, bubble: `Highlight`, `Add a note`, `Save to a page`, `Ask the tutor. Sends this passage, from page {n}:`, `Only the part on page {n} is used.`
- Reader: `Highlights ({n})`, `Nothing highlighted yet. Select text in the PDF to start.`, `No text could be read in this PDF, so passages can't be selected, highlighted or searched. It may be a scan.`, `Highlight on page {n} removed.`, `This file changed after some of these were made. Each is checked again on its page.`
- Page: `That passage isn't in the page as it is now. It may have changed since the search index read it.`

## Migration

None. The first sync after upgrade builds the index in the background, and items read as pending until then. No catalog or page data is rewritten; `CATALOG_VERSION` stays.

## Rollback

An older build ignores `library/search/` and `library/annotations/`, and PDFs go back to a new tab. A saved passage stays ordinary Markdown with an ordinary link; on an older build `/library?item=…` shows the Library without opening anything. A `<library_passage>` in old messages shows as raw text there. Both folders can be deleted at any time; deleting `annotations/` loses highlights, deleting `search/` loses nothing.

## Accessibility criteria

- The result count is an `aria-live="polite"` status, in the panel and the palette. Reindex progress and each failure are worded.
- Result rows are buttons named with the item and place. Snippet matches are `<mark>` with an underline, not colour alone.
- The reader's page area is a focusable named region, so arrows and Page keys scroll it. Toolbar controls are named; the page field has a label.
- Escape closes the selection, then the Highlights list, then leaves the pane (on a phone, closes it).
- The note dialog is a Radix dialog that traps focus; closing returns focus to its opener, or to the page area when the opener has gone.
- Coarse targets are 44px. Reduced motion removes the one transition. Scrollbars are hidden in the results, the highlights list and the pages.

## Known limits

- **Selecting PDF text needs a pointer or the browser's caret browsing.** The bubble, the Highlights list and citations are keyboard-usable, but there is no keyboard way built in to start a selection. A real gap against constitution VI's "whole app usable by keyboard"; carried to 023.
- pdf.js parses on the server's main thread with a yield between pages, so one very large page can still delay requests by its own parse time. A worker thread would remove this.
- The search scan is linear over cached folded text, capped at 32 MiB per tenant, past which shards reload. Fine for a personal Library; a posting list would be the next step. The cache isn't freed when a tenant goes idle.
- A PDF's own links, bookmarks and form fields aren't active in the reader. Open in a new tab gives them.
- Rotated pages and right-to-left text were not tried. Marks come from the browser's ranges, so they should follow, but that is untested.
- A page's jump finds the first block holding the words, which may be an earlier repeat. `block` is reported but not used to choose.
- Over 1 MiB, a text file's hit opens "Too long to preview", so the line can't be shown.
- Search doesn't reach the agent: `library_read` keeps its own PDF search.
