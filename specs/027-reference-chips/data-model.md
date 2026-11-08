# Data model: Reference chips (027)

Nothing here is stored in the learner's data. Messages, drafts, the catalog and the wire are unchanged (constitution III). Everything is derived at render time from text plus the Library list; the one browser-held value is the return point.

## ReferenceSpan (src/core/library-refs.ts, pure)

| Field | Type | Rule |
|---|---|---|
| `start` | number | Index of the `@` in the raw text the field or message holds. |
| `end` | number | Index after the name's last character. `text.slice(start + 1, end)` matches the entry's name by `nameKey`. |
| `entry` | catalog entry | The item it resolves to, by `nameTable` precedence (live name > old name > tombstone, longest first). |

Produced by `referenceSpans(text, entries)`. Same walk as `parseReferences`: boundary before `@` (start, whitespace or `( [ { " '`), not inside `codeRanges()` or a `<library_passage>` block, next character not a letter or digit. `parseReferences(text, entries)` equals the distinct `entry` values of `referenceSpans(text, entries)` in first-seen order (test-pinned).

## ReferenceForm (src/core/library-refs.ts, pure)

A span, optionally joined with the passage that follows it.

| Field | Type | Rule |
|---|---|---|
| `span` | ReferenceSpan | The `@name`. |
| `range` | `[number, number]` | What one Backspace removes and what a chip covers: the span alone, or from the `@` through the last `>` line / `</library_passage>`. |
| `page` | number? | PDF form only: from `, page {n}` and the passage's `page` attribute (they must agree, else no form). |
| `quote` | string? | The passage: `>` lines with markers stripped and joined by `\n`, or the `<library_passage>` body unescaped. |
| `passageOnly` | boolean | A `<library_passage>` with no `@name` before it (older or hand-edited text): chip from the block's `item` attribute. |

Recognition rules are in contracts/recognition.md.

## ChipTarget (client)

| Field | Type | Rule |
|---|---|---|
| `itemId` | string | From the span's entry, the passage's `item`, or a link's `item` parameter. |
| `state` | `"live" \| "trashed" \| "deleted" \| "removed" \| "unknown"` | From reference-catalog (research R8). `removed` = a 026 tombstone with `removedBecause` (R15). `unknown` = the list could not be read: render as sent, open as live. |
| `name` | string | `live`/`trashed`: the current name (for a 026 mirrored item, its display name, the file name, not its @ path). `deleted`/`removed`/`unknown`: the name as written (removed mirrored entries: the entry's display name). |
| `kind` | LibraryKind | Current kind, else the one at send. |
| `href` | string \| null | `live`/`unknown`: `/library?item=ID[&page=N][&quote=Q]` via `citationHref` encoding (quote cut by `citationQuote`, 200 chars). `trashed`: `/library?view=trash&entry=ENTRY`. `deleted`/`removed`: null (not a link). |
| `hint` | string? | `· p. {n}` for a page, else the passage's first non-empty line; one line, truncated by CSS. |
| `key` | string | `{index}` of the chip within its message (0-based, document order); a reference row's link uses `row-{itemId}`. Used with the message id for focus return. |

## ReturnPoint (browser sessionStorage `lh:reference-return`)

| Field | Type | Rule |
|---|---|---|
| `chatId` | string | The lesson the chip was clicked in. |
| `title` | string | The session's title at click time (`UNTITLED_SESSION` if none); refreshed from the session list while shown. |
| `messageId` | string | The `id` of the message holding the chip (the transcript's `message-…` / part id the reading anchor uses). |
| `chipKey` | string | ChipTarget.key. |
| `pushed` | string | A nonce also written into `history.state` of the pushed Library entry, so the pill knows when `router.back()` lands on the lesson. |

Lifecycle: written on a plain chip click; read by the Library to show the pill; cleared on the pill's use, on arrival back at `chatId` (after focus returns), or when the pathname leaves `/library` for another route (checked in WorkspaceProvider, not on unmount). Survives a reload (Q5). Invalid JSON or wrong shape reads as none.

## Library address (existing, extended)

`/library?item=ID[&page=N][&quote=Q]` now means "show this item in the full view" and stays in the URL. `/library?view=trash&entry=ENTRY` shows Trash with that entry scrolled into view and its Restore focused. `parseLibraryHref` reads the first; `parseCitationHref` is unchanged for its existing callers.
