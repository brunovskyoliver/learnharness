# Contract: Library HTTP API

Every export is wrapped in `withTenant`. Hosted without a session: 401 (proxy and handler). All JSON responses set `Cache-Control: no-store`. Errors are `{ error: "<plain sentence>", code?: string }`. Available in hosted and desktop modes. `app/api/files/route.ts` is removed.

Route params use `ctx.params` as a Promise, as `app/api/chats/[id]/steer/route.ts` does. File names go in the query string, never in the path.

## Items

| Method and path | Body | Success | Failures |
|-----------------|------|---------|----------|
| `GET /api/library` | | 200 `{ items, limits }`. Reconciles first. Tombstones are left out. | 500 catalog unreadable |
| `POST /api/library/upload?name=` | raw bytes; `Content-Length` required | 201 `{ item }` | 400 invalid name, empty, or length mismatch; 409 `{ code: "name_taken", name, suggestedName }`; 411; 413; 415 |
| `PATCH /api/library/items/:id` | `{ name }` | 200 `{ item }` | 400; 404; 409 `name_taken` |
| `DELETE /api/library/items/:id` | | 200 `{ ok: true }` | 404 |
| `GET /api/library/items/:id/content` | | 200 bytes | 404 |

`limits`: `{ maxFileBytes, inlineItemBytes, accepted: { extensions by kind } }`.

Content headers: `X-Content-Type-Options: nosniff` always. PDF and raster images are served inline with their type. Everything else is `text/plain; charset=utf-8` when viewed and `Content-Disposition: attachment` with `?download=1`. HTML is never served as HTML.

Upload checks run in this order: name, declared length, type by extension, stream to temp, received length, content check, `link`.

## Pages

| Method and path | Body | Success | Failures |
|-----------------|------|---------|----------|
| `POST /api/library/pages` | `{ name, content? }` | 201 `{ item, head }` | 400; 409 `name_taken`; 413 |
| `GET /api/library/pages/:id` | | 200 `{ item, head: { n, content, author, at }, draft: { base, rev, content } or null }` | 404 |
| `PUT /api/library/pages/:id/draft` | `{ base, rev, content }` | 200 `{ rev }` | 409 `stale`; 413 |
| `POST /api/library/pages/:id/versions` | `{ base, rev, content, cause? }` | 201 `{ version }`, draft cleared | 409 `stale`; 413 |
| `GET /api/library/pages/:id/versions` | | 200 `{ versions }`, metadata only, newest first | 404 |
| `GET /api/library/pages/:id/versions/:n` | | 200 `{ version, content }` | 404 |
| `POST /api/library/pages/:id/restore` | `{ n }` | 201 `{ version }`. Commits a dirty draft first. | 404 |

`stale` responses: `{ code: "stale", head: { n, content, author, at }, draft }`. `rev` of 0 means "I saw no draft". A POST with `base` behind head and `cause: "conflict"` is accepted and records the text as its own newest version: this is "Keep mine" and "Use latest" from research R10.

`sendBeacon` and `keepalive` are not used for page text, since their limits are below page size. `localStorage` covers unload.

Mutations emit `library-changed`. Agent tools use the same store functions.
