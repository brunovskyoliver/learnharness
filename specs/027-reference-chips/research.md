# Research: Reference chips (027)

Grounded in the code at `adc0021` (branch `unified-redesign`). Each entry: decision, rationale, alternatives.

## R1. One recogniser for server and client: `referenceSpans`

**Today**: `src/core/library-refs.ts` `parseReferences(text, entries)` walks every `@` with the boundary rule, skips `codeRanges()` and `<library_passage>` blocks, matches the longest name first (`nameTable`, live name > old name > tombstone) and returns the entries found. It returns no positions.

**Decision**: add `referenceSpans(text, entries)` in the same file. It runs the same walk and returns, for each match in order, `{ start, end, entry }` (offsets into the NFC text; `start` is the `@`). `parseReferences` becomes "the distinct entries of `referenceSpans`", so the server and every chip use one scanner (FR-003 by construction). A second pass, `referenceForms(text, spans)`, groups a span with the quote that follows it when the text has one of the two selection-action forms (R2).

**NFC**: `parseReferences` normalises to NFC first. Offsets must index the text the field holds, so `referenceSpans` maps NFC offsets back to the raw text (the same map technique as `foldWithMap`). Drafts from the app are already NFC; the map only matters for pasted decomposed text.

**Alternatives**: a second, client-only regex (rejected: it would drift from the server's rules); returning spans from the server on send (rejected: the composer needs them before send, and stored messages from before this feature carry no spans).

## R2. The quote forms

**Today** (`components/library/page-tutor-actions.ts`):
- Page: `{LEAD} @{name}{TAIL or ":"}\n\n{> lines}` and, for Ask…, `\n\n` after.
- PDF: `{LEAD} @{name}, page {n}{DOCUMENT_TAIL}\n\n<library_passage item="…" page="n">\n…\n</library_passage>` and, for Ask…, `\n\n` after.

**Decision**: `referenceForms` recognises a span as a quote form when, after the name, the text is (a) any run on the same line ending in `:` followed by a blank line and one or more lines starting `>` (page form), or (b) `, page {n}` then a run ending in `:` then a blank line and a `<library_passage>` block whose `item` is the span's item (PDF form). The LEAD words are not required to be one of the nine (text he edited still forms a chip as long as the shape holds), but the `@name` must be the last reference on its line. The form records `quote` (the `>` lines with markers stripped, or the passage body) and `page`. Anything that doesn't match stays a plain whole-item chip.

**Rationale**: the shape is fixed by `tutorMessage`/`documentTutorMessage`; recognising the shape rather than the exact LEAD keeps a chip on a lightly edited draft. A `<library_passage>` alone (no `@name` before it) still renders as a passage chip in sent messages, as `userTextRuns` already finds it by its `item` attribute.

## R3. The composer overlay

**Constraint (owner)**: chips are drawn over the existing `<textarea>`; typing, paste, undo/redo, IME, the @ list, drafts and send stay as they are.

**Decision**: a mirror layer, the standard "highlight within textarea" technique.
- The textarea keeps its value, events and focus. Its text is transparent (`color: transparent; caret-color: var(--ink)`), and its `::selection` keeps the paper selection colour, so the caret and selection are the browser's own.
- A `div` mirror (`aria-hidden`, `pointer-events: none`) sits under the textarea in the same grid cell, with identical text metrics: font family, size, weight, line-height, letter-spacing, padding (`px-4 pt-3 pb-1`), `white-space: pre-wrap`, `overflow-wrap: break-word`, `tab-size`, box-sizing and width. Scrollbars are hidden in both (AGENTS.md), so there is no gutter difference. The mirror renders the same string, with each chip's characters wrapped in a styled span; a trailing newline gets a zero-width space so the last empty line keeps its height.
- **Chips cannot change layout**: a chip may only restyle the characters it covers. Its background and radius come from `box-shadow` and `border-radius` with `box-decoration-break: clone` (no padding or margin, which would move later characters). The `@` glyph is drawn transparent and the 12px kind icon is centred over it (the `@` at the note size is wider than the icon in Instrument Sans). In the PDF form the literal `, page 4` is drawn faint as the hint. In the page form, the `>` lines stay where they are, drawn as the chip's passage body: graphite italic, the `> ` markers transparent, inside the chip's shelf block. So in the composer a quote-form chip is a head (icon + name) joined to the passage lines under it, not a one-line hint. Approved by the owner at gate 2 (plan.md item 1).
- **Scroll sync**: the textarea is `field-sizing-content max-h-48`; when it scrolls, the mirror's `scrollTop` follows on `scroll` (one listener, no React state).
- **IME**: during composition the value updates and `onChange` fires; the mirror re-renders with the composed text (so it is visible), and draws a 1px underline under the composition range from `compositionupdate` (the textarea's own underline is drawn in the transparent text colour, so it would not show).
- **Selection inside a chip** is allowed; the caret is never moved by code. Typing inside a chip's name makes it stop matching, and it reverts to plain text on that render: the draft is the source of truth.
- **Pointer**: the mirror ignores the pointer; clicks land on the textarea as today. No chip in the composer is a link (FR-004 applies to sent and tutor chips).
- **a11y**: the field stays the `combobox` it is today. The mirror is `aria-hidden`; screen readers read the real text (`@Untitled note`, the `>` lines), which is also what is sent. The "Attaching {names}" line stays (FR-009).
- **Before the list loads**: no spans, so the mirror draws plain text identical to today's. Chips appear when the list arrives; layout cannot move (chips don't change metrics), so the caret and keystrokes are untouched (edge case "@ list not loaded").
- **Fallback**: if `CSS.supports("field-sizing", "content")` is false or the metrics check (R4) fails, the overlay is off and the field is exactly today's.

**Alternatives**: contenteditable with atomic chip nodes (rejected by the owner's "drawn over the existing text field" and by IME/undo risk); replacing tokens with placeholder characters in the textarea (rejected: changes the sent text, III).

## R4. Metrics guard

**Decision**: on mount and on `resize`, compare the mirror's and textarea's `scrollHeight` for the current value; if they differ by more than 1px, turn the overlay off for that field and log once to the console (no UI). This catches a font not loaded yet (`document.fonts.ready` re-checks) and any style drift. The e2e test (quickstart §2) pins caret x/y against chip edges at 320, 390 and 1440.

## R5. Backspace and Delete remove a whole chip

**Decision**: in the field's `onKeyDown`, after the @ list's handler: with no selection, not composing, no modifier, Backspace at a chip's `end` or Delete at its `start` selects `[start, end)` with `setSelectionRange` and runs `document.execCommand("delete")`. That edit goes through the browser's own editing, so it fires `input` (React's `onChange` updates the draft) and joins the native undo stack: one Ctrl/Cmd+Z restores the chip (FR-007). For a quote form the range runs from the `@` through the last `>` line or `</library_passage>`; the LEAD words stay. If `execCommand` returns false (not supported), the key falls through to the browser's normal one-character delete.

**Rationale**: replacing the value through React would wipe the textarea's undo history, which is today's behaviour for typing and would break "one undo".

**Note**: inserting from the @ list sets the value through React today and so is not undoable natively; that is unchanged.

## R6. Chips in sent messages

**Today**: `UserTurn` (`components/user-turn-text.tsx`) renders `UserTurnText`, which splits `<library_passage>` blocks out as an italic quote with "Sent from page {n}". The message's `data-library-references` part holds the `LibraryReference[]` resolved at send (id, name at send, kind, mode, reason) and renders as `ReferencesCard` above the text.

**Decision**: `UserTurn` takes the message's references and builds the catalog for `referenceSpans` from them (`{ id: itemId, name, kind }`), so a chip covers exactly what the server attached at send, even after a rename (R8 maps the id to the current name). `<library_passage>` blocks resolve by their `item` attribute. Text between chips stays `whitespace-pre-wrap` text. A quote form renders as LEAD text, then one chip (icon, name, hint = the passage's first line, one line, truncated; "· p. {n}" for PDFs), then the tail words. The passage's full text is the chip's accessible description and is what the Library highlights.
- The same applies to the other carriers `referencesOf` knows: the practice thinking marker (`ThinkingCard`) and a check answer's tool result (`answered-card.tsx`), which already render `ReferencesCard`.
- **Copy**: a `copy` handler on the turn rebuilds the clipboard text from the selection, replacing each chip element (whole or partly selected) by its `data-source` text (the exact underlying characters), so copying across chips gives `@name` and the `>` lines (edge case).

## R7. Chips in tutor replies

**Today**: tutor prose renders through `MessageResponse` (Streamdown, `components/ai-elements/message.tsx`) with `mdComponents` (code, table, span, strong, blockquote; no `a` override). `TranscriptPassages` (`components/transcript-passages.tsx`) catches clicks on citation links in the capture phase and opens the PDF in the right pane. `parseCitationHref` accepts only `/library?item=…&page=…`.

**Decision**:
1. `parseLibraryHref(href)` in `src/core/document-anchors.ts`: `/library?item=ID` with optional `page` and `quote`; `parseCitationHref` keeps its contract (page required) for its other callers.
2. A pure `chipMarkdown(markdown, catalog)` runs on the reply's text before Streamdown (after `completedMarkdownPrefix`). It rewrites each `@name` span from `referenceSpans` (outside code, by the shared rules) into a link `[@name](/library?item=ID "lh-ref")`, escaping `[`, `]` and `\` in the label, and skips spans inside an existing link's label or address, an autolink or raw HTML. Existing `/library?item=` links are left as written. The stored reply is untouched (III).
3. An `a` override in a tutor-only components set renders `ReferenceChip` for any href `parseLibraryHref` accepts, and a normal link otherwise. The chip's name is the item's current name from the catalog by id (the link text is the fallback); its hint is "· p. {n}" when a page is given.
4. `TranscriptPassages` ignores clicks inside `[data-ref-chip]`; the chip navigates (R9).
5. The catalog is the live Library list (R8), fetched once a reply contains `@` or `/library?item=`. Until it arrives, `@name` stays text and links render as links; when it arrives, MessageResponse's class gains `lh-refs-ready` so Streamdown's memo re-renders the blocks (the 025 note: its memo keys on className, not plugins).
6. Streaming: `chipMarkdown` sees only the completed prefix, so a half-typed `@Untit` is text until its name completes. Chips keep the line's font size and line height (no vertical padding), so a reference turning into a chip doesn't move the lines around it (US3 scenario 3). Ink-in already treats a link as one unit.
7. Prompt: `src/agent/prompts/shared/32-documents.md` gains one sentence asking the tutor to link any Library item it names as `[name](/library?item=ID)`. Its wording is in contracts/ui-contract.md §3, approved at gate 2.

**Alternatives**: a rehype plugin splitting text nodes (rejected: needs the catalog in plugin options, whose cache key and memo interplay 025 found fragile, and loses the source's boundary characters across node edges); chipping plain item names without `@` (rejected by Q1).

## R8. Item state: live, renamed, trash, deleted, removed from the repo

**Decision**: one small client module `components/reference-catalog.ts` (outside `components/library/`, R13) keeps the live list from `GET /api/library` with the 30s TTL that `references-card.tsx` already uses (it moves there and both use it), refreshed on `library-changed`. An id not in the live list triggers one `GET /api/library/trash` per TTL; an id found in a trash entry's `items` is `trashed` (with the entry id). An id in neither is `deleted`. A mirrored entry removed by 026 (a tombstone with `removedBecause`, R15) is `removed`. A failed fetch keeps the chip as sent (name at send, opens as live): the same rule the reference rows use today, so nothing is guessed (IV).

## R9. Navigation, the full view and the Back pill

**Today**: `/library?item=…&page=…&quote=…` opens the item in the right pane (`workspace.openItem` / `pane.open`) and then `router.replace("/library")`, so the address does not stay. The pane's item is shared state that follows the learner between routes (`PagePaneProvider`, saved in localStorage), and opening an item opens a tab.

**Decision**:
- **Address**: a chip's `href` is `/library?item=ID[&page=N][&quote=…]` (the citation address, `citationHref` encoding). For a trashed item it is `/library?view=trash&entry=ENTRY`. A plain click is intercepted (`event.preventDefault()`) and does a `router.push` after saving the return point; Ctrl/Cmd-click, Shift-click and middle-click are left to the browser, which opens the same address in a new tab with no return point (FR-018).
- **Full view**: on `/library`, an `item` parameter now renders the item's surface filling the Library's content column instead of the list, and the address stays (so Back and Forward work, FR-016, and a reload shows it again). The surfaces are the existing ones from `page-pane.tsx` (PageSurface, PdfSurface, DiagramSurface, ReadOnlySurface) in a new `full` presentation of `WorkspacePane` (no resize edge, no saved width, the column's width). They get a local `PagePaneApi` adapter, not the shared pane context, so a full view never changes the right pane, its tabs or the lesson's state (FR-017). Images get a new read-only image view; `other` gets a line with the file's kind and size and Download. The header's ✕ becomes the toolbar word "← Library" (`aria-label="Back to Library"`, to `/library` at the item's folder; owner, gate 2).
- **Every `/library?item=` address** is the full view (owner, gate 2): a reload, a pasted address, a new tab, and the app's other links to it (`components/notebook/links-panel.tsx`, the card source link from `src/core/cards.ts`) land there, without a pill since they write no return point. Citation clicks inside Library pages keep opening the right pane (they go through `pane.open`, not the address).
- **Landing**: the jump is `{ page, quote, citation }`. A tutor citation keeps `citation: true` (its existing "Quote found on page n." line). The learner's own passage uses `citation: false`, whose existing miss line is "That passage wasn't found on page {n}. The file may have changed. Showing the page anyway." Pages search the passage's first line through `jumpToText` (`findBlockHolding` matches within one text block, so a multi-paragraph quote would never match whole); a miss shows the new line "That passage is no longer in this page. Showing it from the top." (owner, gate 2); today `jumpMissed` is set in `page-pane.tsx` but never rendered.
- **Return point**: `sessionStorage["lh:reference-return"]` = `{ chatId, title, messageId, chipKey, pushed }` (data-model.md), written on the click, after `SessionReadingState`'s capture-phase `pointerdown` flush has saved the reading anchor. Scroll restore is the existing per-session reading anchor (`components/session-reading-state.tsx`): arriving back on the lesson restores it, to within one line. On arrival (a pathname change to `/chat/{chatId}`, since a cached chat route may become visible without remounting), a small effect in the chat view finds `[data-ref-chip="{messageId}:{chipKey}"]`, focuses it with `preventScroll`, then clears the key.
- **Pill**: rendered by `LibraryView` while the key exists. "← Back to {title}" (title refreshed from the session list when known). Click: when the current history entry is the one the chip pushed (`history.state` carries a marker), `router.back()`; otherwise `router.push("/chat/{id}")`. It is cleared when he uses it, when he arrives back on the lesson, or when the pathname leaves `/library` for any other route. That last check is a pathname effect in `WorkspaceProvider` (components/workspace/workspace-context.tsx, which already reads `usePathname`), not `LibraryView`'s unmount, because Next may keep a visited route mounted but hidden (React Activity, as components/session-reading-state.tsx notes). A reload keeps the pathname, so it survives (Q5).
- **New tab**: a new tab's sessionStorage starts empty, so no pill (FR-018).

**Alternatives**: a `from=` URL parameter (rejected: FR-018 says the new tab opens the same address without the pill, and a shared URL would carry it); keeping the right-pane open (rejected by the owner's "full view").

## R10. Reference rows (Q3)

`ReferenceRow`'s name becomes a `ReferenceLink` (same navigation as a chip, R9) for live and trashed items, and plain ink text for deleted or `missing`. Wording, order and the "Settings → Agent" action are unchanged (IV).

## R11. Look and tokens

Chip: `bg-shelf` block, radius 6px from `box-shadow` spread in the composer and real padding (`px-1.5`, no vertical padding) in sent and tutor text, ink name in the surrounding size and weight, 12px kind icon in graphite, hint in faint, ink 40% underline on hover like links, focus ring `--nb-focus`. Deleted: faint, no fill, no underline. Coarse pointers: `pointer-coarse:` min 44px hit area through an inline-flex box with transparent padding, as `ReferenceRow`'s link does. Only 025 paper tokens; `tests/token-hygiene.test.ts` covers the new CSS in `app/paper.css` (`.lh-ref-chip*`).

Back pill: the primary pill (`.nb-pill`, ink, round, 32px, meta type) with `ArrowLeftIcon`, fixed under the band at the content column's left edge, `bottom` clear of `env(safe-area-inset-bottom)` on phones; it never covers the first line of content (the column gets top padding while it shows). Entering announces "Back to {title} is available" once in a polite live region.

Motion: none beyond the existing 150ms colour transitions; off under reduced motion.

## R12. Hidden scrollbars

The mirror layer and the full view's scrollers use the existing hidden-scrollbar rules (`app/paper.css` hides every track); the mirror never scrolls by the user (pointer-events none) and follows the textarea programmatically.

## R13. Startup budget (VIII)

`tests/startup-module-graph.test.ts` forbids `components/library/*` in startup JS except `use-library-mention.ts`. The composer (Home's, so startup) needs the overlay and `referenceSpans`. Decision: the overlay lives in `components/reference-field.tsx` (small: mirror render + Backspace rule), the composer chip is a plain span (no navigation code), and `referenceSpans` is in `src/core` (already in the graph through `library-refs.ts`). The clickable `ReferenceChip`, `reference-catalog.ts` and the full view load with the chat and Library routes, not the composer. Budget: startup JS on `/`, `/chat/new` and `/library` within +5% gzip of a baseline measured at `adc0021` with `~/agent-runs/2026-11-07-unified-redesign/startup-js/startup-js.mjs` (the 024/025 method); the expected cost is under 3 KB gzip.

## R14. Hosted

Every fetch is an existing tenant-scoped route (`/api/library`, `/api/library/trash`); no new server route. sessionStorage is per origin and tab; the return point names a chat id only. No change for local or Electron.

## R15. Git-mirrored items (feature 026)

**Given** (026, implemented first on this branch; its research R13): a mirrored item's @ name is its Library path `{linked folder}/{repo path}` (e.g. `@Lecture notes/week1/notes.md`); its display name stays the file name; renaming the linked folder pushes the old path onto `previousNames`. A file deleted upstream, or every file of an unlinked folder, becomes a tombstone with `mirror` and `removedBecause`, which the learner sees as "Removed from the repo".

**Decision**:
- **One name function**: `referenceSpans` reuses `nameTable`, which after 026 offers a mirrored entry's path (and old paths) as its @ name. No chip code builds @ names itself, so a `/` in a name needs no special case: the walk compares `nameKey` of the text slice with each table key, longest first, and the boundary rule only checks the character after the whole name. `@Lecture notes/week1/notes.md` therefore never stops at an item named "Lecture notes" while the path resolves (the server reads it the same way, FR-003).
- **Sent messages**: R6's catalog built from the message's `LibraryReference[]` must be able to reproduce the token as written. For a mirrored reference the catalog entry comes from reference-catalog by id (live item or removed entry, both carry `mirror`), with the reference's own name as the fallback; T053 checks what 026 stores in `LibraryReference.name` for mirrored items and pins it in a test.
- **Name shown**: outside the composer, the chip shows the item's display name (the file name), per 026. In the composer the overlay cannot change characters (R3), so the chip shows the path as typed.
- **Removed**: a tombstone with `removedBecause` is state `removed`: faint, not a link, followed by 026's learner wording (its constant, not a copy), " · Removed from the repo". Mirrored items cannot be trashed (026), so `trashed` never applies to them.
- **Quote forms**: unchanged; `@{path}, page {n}` for a mirrored PDF and the page form both work, since R2 matches the shape after the span's end.
