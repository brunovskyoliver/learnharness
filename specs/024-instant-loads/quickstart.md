# Quickstart: verify Instant loads

1. `npm run demo-kit && npm test && npm run lint && npm run typecheck && npm run build`.
2. PDF: `curl -sI -H 'Range: bytes=0-99' <host>/api/library/items/<id>/content` → 206, `Content-Range`, `Accept-Ranges`, `ETag`, `private, no-cache`; repeat with `If-None-Match` → 304.
3. Worker: `curl -s -o /dev/null -w '%{size_download}' -H 'Accept-Encoding: gzip' <host>/pdfjs/legacy/build/pdf.worker.min.mjs` ≈ 392 KB.
4. Plots: open the 4-plot test chat twice; DevTools shows no `/demo-kit/*` transfer on the second load, one `demo-ready` per plot.
5. Perf: `node ~/agent-runs/2026-11-09-instant-loads/perf/run.mjs` against a throwaway container of the new image (same data copy, same 60 ms / 20 Mbps profile); compare with spec.md Baseline.
