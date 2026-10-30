# Data model: Library and canvas pages

All paths are per tenant through `dataRoot()` in `config.ts`; hosted access without a tenant throws. Writes happen only in `src/store/library.ts`.

```text
<data>/files/<name>                       document bytes, flat, as today
<data>/library/catalog.json               catalog, read-modify-write through temp file and rename
<data>/library/pages/<id>/versions.jsonl  one metadata line per version
<data>/library/pages/<id>/v<n>.md         immutable content, written with flag "wx"
<data>/library/pages/<id>/draft.json      the learner's unsaved text, at most one
<data>/library/derived/<id>.json          cached text info, rebuildable
<data>/tmp/upload-*                       in-flight uploads, never under files/
```

`config.ts` gains `get library() { return path.join(dataRoot(), "library"); }`, and `PATHS.files`'s comment stops saying hosted only.

## Library item

`catalog.json`: `{ version: 1, items: LibraryItem[] }`. A record with a newer `version` is refused on read, never rewritten.

| Field | Type | Rules |
|-------|------|-------|
| `id` | string | `lib_` + nanoid. Never reused. |
| `name` | string | NFC, trimmed, 1-200 characters, no separators, no leading dot, no control characters (`uploadName` rules). Unique case-insensitively among live items, new writes only. |
| `previousNames` | string[] | Optional. Old names, for resolving old `@` tokens. A live item's current name wins. |
| `kind` | enum | `markdown`, `text`, `code`, `csv`, `pdf`, `image`, `page`, `other`. |
| `size` | number | Bytes. For pages, head content bytes. |
| `createdAt`, `updatedAt` | ISO string | |
| `origin` | object | `{ type: "upload" }`, `{ type: "existing" }`, `{ type: "learner" }` or `{ type: "agent", chatId?: string }`. `chatId` is cleared when that session is deleted. |
| `textState` | enum | Optional, documents: `ok`, `none` (no text in a PDF), `pending`, `failed`. |
| `headVersion` | number | Pages only. |
| `deletedAt` | ISO string | Set on delete. A tombstone keeps `id`, `name`, `kind`, `deletedAt` only. Hidden from lists. |

### Accepted uploads

Extensions, lower-cased:

- markdown: `md`, `markdown`
- text: `txt`, `text`, `log`, `rst`, `tex`
- csv: `csv`, `tsv`
- pdf: `pdf`, with `%PDF-` at the start
- image: `jpg`, `jpeg`, `png`, `gif`, `webp`, `bmp`, with matching magic bytes
- code: `py`, `js`, `jsx`, `ts`, `tsx`, `json`, `yaml`, `yml`, `toml`, `html`, `css`, `c`, `h`, `cpp`, `hpp`, `cc`, `java`, `kt`, `go`, `rs`, `rb`, `php`, `swift`, `sh`, `bash`, `sql`, `r`, `m`, `jl`, `lua`, `ipynb`

Text, markdown, csv and code must have no NUL in the first 8 KB and decode as strict UTF-8 over the first 1 MiB.

Refused, nothing stored: other extensions (415), empty file (400), over 52,428,800 bytes (413), content that does not match its type (415). Each response carries a sentence with the reason.

### Transitions

```text
upload accepted ─▶ live ─ rename ─▶ live (previousNames grows; file moves too)
reconcile found ─▶ live ─ delete ─▶ tombstone (bytes, versions, draft, derived removed)
file vanished   ─▶ tombstone
```

Delete does not touch chat records (plan owner decision 7).

## Page version

`versions.jsonl`, one JSON line per version, append-only. The content file is written and synced before its line is appended. A content file with no line is ignored and its number skipped.

| Field | Type | Rules |
|-------|------|-------|
| `n` | number | Starts at 1, increases. Never reused or removed. |
| `author` | enum | `learner` or `agent`. |
| `at` | ISO string | |
| `bytes` | number | At most 1,048,576. |
| `base` | number | The version this was edited from. 0 for the first. |
| `cause` | enum | `save`, `autosave-close`, `before-agent`, `conflict`, `restore`, `agent-create`, `agent-revise`. |
| `restoredFrom` | number | Optional. |
| `chatId`, `toolCallId` | string | Optional, agent versions, for the transcript link and idempotence. A repeat of the same `toolCallId` returns the existing version. |

## Page draft

`draft.json`: `{ base: number, rev: number, content: string, updatedAt: string }`. Deleted once committed as a version. `rev` increases on every write. An empty page's draft is allowed; content above 1 MiB is refused with 413, and the tab keeps its text locally and says so.

## Reference

Stored in `references` on the carrier message ([contracts/references.md](contracts/references.md)).

| Field | Type | Rules |
|-------|------|-------|
| `itemId` | string | Always set. Text with no catalog match produces no reference. |
| `name` | string | The name at send time. |
| `kind` | enum | As above. |
| `size` | number | Absent for tombstones. |
| `version` | number | Pages: head at send. |
| `mode` | enum | `inline`, `outline`, `image`, `missing`, `unreadable`. |
| `reason` | enum | Optional: `too-long`, `message-limit`, `no-room`, `over-count`, `no-text`, `no-vision`, `not-ready`, `unsupported`. |
| `material` | string | `inline` and `outline` only. Removed by `clientMessages`. |

## Other changes

- `TOGGLEABLE_TOOLS` in `src/core/pending.ts` and `TOGGLE_TOOLS` in `components/settings/agent-section.tsx` gain `pages`.
- `JobKind` in `src/core/contracts/jobs.ts` gains `image`.
- `ServerEvents` in `src/core/events.ts` gains `library-changed: { itemId?: string; version?: number; author?: "learner" | "agent" }`.
- `ChatRecord` schema version stays the same. `references` is additive.
