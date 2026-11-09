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

## Versioned chunks (revision 2026-11-09)

| Request | Response |
|---|---|
| `?v=<etag>&chunk=<n>&size=<chunkSize>` with `v` equal to the current ETag, chunk in range | 200, exactly bytes `[n·size, min((n+1)·size, fileSize))`, `Cache-Control: private, max-age=31536000, immutable`, `ETag`, no content encoding |
| `v` not the current ETag | 412, `Cache-Control: no-store`; the reader reloads the document from its metadata |
| chunk/size invalid (non-integer, size outside the allowed set, n past the end) | 400 / 416 |

Metadata: the reader learns ETag and size from a `HEAD` (or `Range: bytes=0-0`) request with `private, no-cache` — one revalidated round trip per open.
