# Contract: GET /api/library/items/:id/content

Unchanged: tenant scoping, 404 body, `Content-Type`, `Content-Disposition`, `X-Content-Type-Options`, `?download=1`.

| Request | Response |
|---|---|
| no `Range` | 200, full body, `Content-Length`, `Accept-Ranges: bytes`, `ETag`, `Cache-Control: private, no-cache` |
| `If-None-Match` equals current ETag | 304, no body, same `ETag`/`Cache-Control` |
| `Range: bytes=a-b`, `a-`, or `-n` (single, satisfiable) | 206, `Content-Range: bytes a-b/size`, `Content-Length` of the slice |
| `Range` with `If-Range` ≠ current ETag | 200 full |
| multiple ranges, or malformed `Range` | 200 full |
| unsatisfiable (`a ≥ size`) | 416, `Content-Range: bytes */size` |
| `?download=1` | as above, plus `Content-Disposition: attachment` |

ETag is strong, opaque, and changes whenever the stored file's size or modification time changes. The body is never content-encoded.
