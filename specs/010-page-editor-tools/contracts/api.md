# API contract additions (010)

All routes are wrapped in `withTenant`, as in feature 009.

## PATCH /api/library/pages/{id}/versions/{n}
- Body: `{ "name": string | null }`. The name is trimmed, 1–80 characters, with no line breaks. `null` or `""` clears it.
- `200 { version }`, where the version carries the `name` field when it has one.
- `400 { error: "A version name is 1 to 80 characters on one line." }`.
- `404` when the page or version doesn't exist.
- Emits `library-changed { itemId }` with no version.

## GET /api/library/pages/{id}/versions (extended)
Each version may carry `name`. Paging is unchanged (`?before=`, 50 at a time, `more`).

## GET /api/library/pages/{id}/seen
- `200 { version, unseen: PageVersion[] }`.
  - `unseen` lists the tutor revisions (`author: "agent"`, `cause: "agent-revise"`) newer than `version`, oldest first.
  - When the page has never been seen, `version` is the head and `unseen` is empty, and the head is written as seen.

## PUT /api/library/pages/{id}/seen
- Body: `{ "version": n }`. It only moves forward (`max(old, n)`), never past the head.
- `200 { version }`.

## POST /api/library/pages/{id}/versions (extended)
- `cause` also accepts `"undo-agent"`.

## Upload helper
`sendFile` returns `{ status: "done", item }` on 201. The route is unchanged.
