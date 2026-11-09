# Feature 024: Instant loads
Stage: implement
Updated: 2026-11-09

## Decisions
- Scope (owner, 2026-11-09): all four — PDF ranges + caching, cached plot libraries, lighter plotly build, trim page-load JS.
- Out of scope: subscriptions request loop (separate bug), big-chat HTML size, Caddy config, /api/events header delay.

- Clarify (owner "ok", 2026-11-09): PDF private + revalidate every open; light plotly (3D + contour/heatmap/scatter) with full build fallback per plot, plotly.js build-time dep approved; math/code messages wait for renderer; no plot prefetch.
- Gate 2 (owner "go", 2026-11-09): implement everything; medium findings fixed in spec (mid-read file replace = known limit; hand-written demos keep full plotly).
- Commits: one per phase on main, only feature files (app/globals.css waiting-row fix stays uncommitted, not part of 024). No push/deploy.
- Phase 2 (agent, technical): content route sends `Cache-Control: private, no-cache, no-transform`; `no-transform` is what keeps Next's built-in gzip (router-server `compression`) off text/bmp items, so the contract's "never content-encoded" holds. ETag = first 32 base64url chars of sha256(id, size, mtimeMs), quoted (strong). `openDocumentStream(file, pick)` opens one handle and lets `pick` choose range/all/none from that handle's own size+mtime (same inode as the lstat check), so tag and bytes always agree.

## Log
- 2026-11-09 measure: baseline profiled on a throwaway copy of learnharness:amd64 (numbers in spec.md Baseline).
- 2026-11-09 specify: spec.md written; checklist passes except the open clarifications.

- 2026-11-09 clarify: 4 answers encoded in spec.md.
- 2026-11-09 plan: plan.md, research.md (R1–R7), contracts/ (content ranges, demo-lib bridge), data-model.md, quickstart.md; perf driver copied to ~/agent-runs/2026-11-09-instant-loads/perf.
- 2026-11-09 tasks: 31 tasks in 6 phases; MVP = phases 1–2.
- 2026-11-09 analyze: 0 critical, 0 high, 2 medium, 2 low.
- 2026-11-09 implement phases 1–2: T001–T008 done (plotly.js@4.1.2 devDependency, before.md, content route ranges/ETag/304/416, pdf.js asset gzip 1.32 MB → 393 KB, reader options); tests/library-content-ranges.test.ts, tests/pdfjs-assets.test.ts; npm test 3863 pass / 0 fail / 27 skipped, lint and typecheck clean, build OK.
- 2026-11-09 T009 (open, needs owner): local build, headless Chromium, 60 ms / 20 Mbps, 17.3 MB scanned PDF. Ranges work (206, no encoding; Download = whole file, 200 attachment), but page 1 at 8.6 s (before: 8.9 s) with 16.8 MB received first, and reload re-downloads (1 × 304, 66 × 206). Causes: (1) pdf.js fetches every top-level page dict when it opens a document (`Catalog.getPageDict` prefetch), and this file puts each page dict after its ~220 KB image, so 256 KB chunks cover the whole file; (2) Chromium serializes cacheable range requests to one URL (HTTP cache entry lock): 75 requests one RTT apart, a ~4.7 s floor at 60 ms; 20 parallel 16 KB ranges took 1245 ms cacheable vs 334 ms no-store. Experiments on a patched build (not committed): 64 KB chunks → page 1 6.3 s, 5.3 MB first, reload 151 × 304 (44 KB) but page shown at 5.4 s; 16 KB → page 1 6.3 s, 1.6 MB first, reload re-downloads. SC-001 is not met with the planned design. Evidence: ~/agent-runs/2026-11-09-instant-loads/perf/pdf-check.mjs.

## Report
