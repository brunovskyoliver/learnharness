# Plan: Intelligent notes (016-018)

## Constitution Check

| Principle | Result |
| --- | --- |
| I Owner decides | Pass. Owner approved all recommendations and asked for no questions (ROADMAP); decisions are in spec.md, Clarifications. |
| II Teaching theory first | Pass. Notes create no graph evidence and the graph is read only. Generated questions use the existing quiz mechanics. Study notes read only delivered prose, never question payloads. Pages stay unwritable while a question waits. |
| III Learner data is never lost | Pass, with one thing for the owner to see: a saved passage's text and its session's title stay after the session is deleted, at the owner's request in this feature's brief. The constitution's existing exception names only agent-made pages. Drafts commit before a passage or a tutor edit; versions stay append-only. Golden fixtures are untouched. |
| IV Honest states | Pass. Dangling, deleted and unknown links read differently and in words. Loading, empty and failed are distinct, and a failed refresh keeps the last list. Unknown ids get 404, bad bodies 400. |
| V Consent before cost | Pass. No new automatic call. Study notes make no model call. Each AI action sends only on its click, through the existing tutor path, where its usage already shows. |
| VI Interface follows DESIGN.md | Pass. Raised steps only, no side rules, amber only for focus and Done. Hidden scrollbars, Escape innermost first, coarse targets 44px, 320/390/1440 checked. DESIGN.md updated. See "Not run" in progress.md for the skills. |
| VII Boundaries and tenancy | Pass. Filesystem writes only in `src/store`; `src/core` modules are pure; every route uses `withTenant`, with a hosted test. Material stays wrapped: pages reach a model only through `@` references. |
| VIII Performance | Pass, measured in progress.md. The editor, pane, panel and dialog load on demand. The transcript gains one small component. |

## Module map

- `src/core/note-links.ts`: scanning, resolution, backlinks, related notes.
- `src/core/note-sources.ts`: passages, source links, study notes, graph relation.
- `src/store/library.ts`: `pageTexts`, `wikiPins`, `appendToPage`, and pinning inside `rename`.
- `src/server/notes.ts` and five routes (below).
- `components/library/page-markdown.ts`: `WikiLink`, `Callout`, `Collapsible`, `CollapsibleSummary`, in the shared schema.
- `components/library/page-note-views.ts`: their browser drawing, with no DOM at import.
- `components/library/page-editor.tsx`, `page-editor-extras.ts`, `page-toolbar.tsx`: the `[[` list, slash rows, source link decorations.
- `components/library/use-note-links.ts`, `components/workspace/note-connections.tsx`: the catalog and the Links panel.
- `components/transcript-passages.tsx`, `passage-selection.ts`, `library/save-passage-dialog.tsx`: saving a passage.
- `components/library/page-tutor-actions.ts`: the actions.

## Contracts

### Markdown
See spec.md, Clarifications. Added escapes: a text run holding `[[` or opening a line with `[!` writes brackets as `&#91;`/`&#93;`, as link-like text already did.

### API (all `withTenant`, all `no-store`, none calls a model)

| Route | Answers |
| --- | --- |
| `GET /api/library/wiki?page={id}` | `{ entries, pins, sources }`: every catalog entry including deleted ones, this page's pins, and its source rows |
| `GET /api/library/pages/{id}/connections` | `{ links, backlinks, related, sources, sessions, graph }`; 404 for an unknown page |
| `POST /api/library/pages/{id}/passages` `{ markdown, chatId, messageId }` | 201 `{ item, version }`; 400 bad body; 404 unknown page, session or message; 413 too long, or the page would pass 1 MB |
| `GET /api/chats/{id}/pages` | `{ pages: [{ id, name, kind, size, passages }] }`; 404 unknown session |
| `POST /api/chats/{id}/study-notes` | 201 `{ item, head }`; 404 unknown; 409 practice, an empty lesson; 413 too large |

### Store (`LibraryStore`, additive)
`pageTexts()`, `wikiPins()`, `appendToPage(id, block, { chatId })`. `PageVersionCause` gains `passage`.

### UI strings
- Header: `Links` (toggle). In a pane under 720px wide, Outline, Links, Export and History are named icons.
- `[[` list: `aria-label="Link to a page"`. Rows: the name and kind; a free text row with `Link it now, make the page later`. Status: `Keep typing a page name.`, `Your Library has no other pages yet.`, `Loading your Library…`, `Your Library could not be loaded.`
- Panel: `Links to this page`, `Links from this page`, `Related notes`, `Lessons`, `Ideas in your graph`, each with its empty line.
- Slash: `Callout`, `Collapsible section`. Callout: `Callout type`, `Callout title`. Section toggle: `Collapse {title}` / `Expand {title}`.
- Passage: `Save to a page`, `Find a page, or name a new one`, `New page: {name}`, `Saved to {name}, with a link back to this lesson.`, `Open page`, `Done`.
- Palette: `Turn this lesson into study notes`, `Save the selected text to a page`.
- Messages sent are in `page-tutor-actions.ts` and pinned by `tests/page-tutor-messages.test.ts`.

## Migration

None. Nothing is rewritten at load. `> [!NOTE]`, `<details>` in the written form and `[[x]]` in existing pages start showing as their new nodes, with their stored bytes unchanged until edited.

## Rollback

Going back to an older build loses nothing:
- `[[x]]` reads as text with brackets; callouts as quotes; `<details>` as raw source.
- `library/wiki-pins.json` is ignored, and is rewritten by nothing in an older app.
- A version line with cause `passage` reads as any other: `cause` is displayed only for `undo-agent`, and `isUnseenTutorVersion` needs `agent-revise`.
- The catalog's version and shape are unchanged, with a test.

## Accessibility criteria

- The `[[` list is a `listbox`; focus stays in the text. Up, Down, Enter, Tab and Escape act as in the slash menu, and Escape closes only the list.
- Keyboard follows a link with Ctrl/Cmd+Enter beside it, or from the Links panel, whose rows are buttons.
- Ctrl/Cmd+Enter inside a section opens or closes it; Enter on its title opens it and moves in; Backspace on an empty title removes the section and keeps its text. The toggle is a named button with `aria-expanded`.
- A link's state is in its accessible name and the panel's words, not only its style.
- Callout controls take focus visibly; Escape returns to the text.
- Save to a page: a Radix dialog that traps focus and returns it, reached by the palette as well as the pointer.
- Reduced motion removes the chevron's one transition.

## Known limits

- The scanner approximates the parser on raw HTML: a `[[x]]` inside a `<div>` block counts for backlinks though the editor shows it as raw source.
- Connections read every page's text on each request, while the panel is open. Fine for a personal Library; no cache yet.
- History and print render through the chat's Markdown renderer, so `[[x]]` shows with its brackets and a callout as a quote there.
- Below 768px the session's Notes list is unreachable, because feature 014 has no context view on phones. Study notes and passages still work there, by the palette.
- A later link typed in the same page, with a pinned old name, keeps meaning the pinned item. It shows that item's current name, so it can be seen and changed.
