# Research: Instant loads

## R1 PDF ranges

- **Decision**: content route parses a single `Range: bytes=a-b | a- | -n`; answers 206 with `Content-Range`, `Accept-Ranges: bytes`, `ETag: W/"<size>-<mtimeMs>-<id>"`-style strong tag (strong: `"<size>-<mtimeMs>"` hashed with id), `Cache-Control: private, no-cache`, `Vary` unchanged. `If-None-Match` match → 304. `If-Range` mismatch → full 200. Multi-range → full 200 (allowed by RFC 9110). Unsatisfiable → 416 with `Content-Range: bytes */size`. `?download=1` keeps a full attachment response. Applies to every library item served by this route, not only PDFs (harmless and simpler); images benefit from the 304 too.
- **Reader**: `pdfLoadOptions` adds `disableStream: true`, `disableAutoFetch: true`, `rangeChunkSize: 262144` (256 KB: fewer round trips at 60 ms RTT; scanned pages are ~200 KB). pdf.js uses ranges only when the HEAD/first response advertises `Accept-Ranges: bytes`, a `Content-Length`, and no `Content-Encoding`; the route must not compress this response.
- **Rationale**: pdf.js reads the trailer/xref from the tail and the objects for page 1 via ranges, so non-linearized files also benefit. `private, no-cache` + ETag = owner's Clarification Q1: the browser keeps the bytes and revalidates on each request (304, no body).
- **Alternatives**: linearizing uploads (rewrites learner files — violates III); `max-age` (owner rejected, stale risk).

## R2 pdf.js worker compression

- **Decision**: `pdfjsAssetResponse` gzips text assets (`.mjs`, `.js`, `.bcmap` excluded — already compressed binary) when `Accept-Encoding` includes gzip, memoized per file in memory; `Vary: Accept-Encoding`. 1.32 MB → 392 KB.
- **Alternatives**: Caddy `encode` (outside the repo, doesn't help desktop/local); brotli via zlib (fine too; gzip matches the rest of the app's responses).

## R3 Why plot libraries are never cached

- Frames are `sandbox="allow-scripts"` without `allow-same-origin` → opaque origin → Chrome's partitioned HTTP cache uses a transient network isolation key, so frame-initiated loads never hit or fill the cache. Measured: full 200s on every warm load.
- **Decision**: the parent page fetches. Two paths:
  1. **Static tags** in demo HTML (`<script src="/demo-kit/vega.js">`, `plotly.js`, `runtime.js`, `flow.js`; `<link href="/demo-kit/flow.css">`): before setting `srcDoc`, the card resolves each referenced `/demo-kit/` file through `demo-lib-cache` and inlines it (`<script>…</script>` with `</script` escaped as `<\/script`; CSS into `<style>`). The srcdoc is set once, with everything inline, so no frame request remains for kit files.
  2. **Dynamic `load()`** in the kit runtime (vega, plotly-light, plotly, flow): when `window.parent !== window`, it posts `{type:"demo-lib-request", file}` and waits for `{type:"lh-demo-lib", file, code}`; injects `<script>` with `textContent` (or `<style>`). In the headless checker / downloaded demo (no parent or no reply within the existing load timeout path), it uses today's `<script src>`.
- **Versioned immutable URLs**: `next.config.ts` computes a short hash of `public/demo-kit/*` at config load (the build script always runs first: `dev`, `build`, Dockerfile) and exposes `LH_DEMO_KIT_VERSION` via `env`; `demo-lib-cache` fetches `/demo-kit/<file>?v=<version>`; `headers()` sets `public, max-age=31536000, immutable` for `/demo-kit/:path*` when the `v` query is present (`has: [{ type: "query", key: "v" }]`). Without `v`, today's revalidating headers stay (downloads, headless, old links).
- **Rationale**: one download per library per version; in-page dedupe by promise; frames get code with no origin widening (constitution VII). Inline/textContent scripts work: no CSP is set on the app or srcdoc.
- **Alternatives**: `allow-same-origin` (forbidden by VII); blob URLs from the parent (origin-bound, not loadable from an opaque frame); service worker (more machinery, still needs the parent).

## R4 Cold-load remount

- Measured: runtime/vega/plotly fetches cancelled twice (~250 ms, ~450 ms) and `demo-ready` 7× for 4 plots. Likely causes to check in order: `srcDoc` recomputed from a new `html` string identity or theme injection (`useMemo([html])` with an html built per render upstream), the card's key changing as the message list hydrates/streams in, or the iframe moving between parents (workspace/presentation layer). The fix keeps one iframe per demo across these (VII "one live iframe serves every presentation").
- **Decision**: instrument with the perf driver (count `demo-ready` per frame), fix the cause, add a render test that the srcdoc string/key is stable across the observed re-renders.

## R5 Light plotly

- **Decision**: add devDependency `plotly.js@4.1.2` (same version as `plotly.js-dist-min`). `src/demo-kit/plotly-light-entry.ts` imports `plotly.js/lib/core` and registers `scatter3d, surface, mesh3d, cone, streamtube, isosurface, volume, contour, heatmap` (scatter is in core); esbuild bundles it to `public/demo-kit/plotly-light.js`. The runtime's `plot3d` checks every trace's `type` (default `scatter`) against the light set and loads `plotly.js` (full) when any is outside; `window.Plotly` from whichever loaded last is used for that plot (full is a superset; once full is loaded, later plots use it).
- **Target**: ≤ 730 KB gzip; verified in the build log. If the light bundle exceeds the target, report the measured size at the gate of that phase rather than dropping trace types.
- **Alternatives**: `plotly.js-gl3d-dist-min` (lacks contour/heatmap, which the built-in quick plots use); keeping full (owner rejected).

## R6 Renderers on demand

- **Decision**: `components/ai-elements/markdown-plugins.ts` exports `needsMath(text)` (`$`, `$$`, `\(`, `\[` outside code) and `needsCode(text)` (fenced block ```` ``` ```` or `~~~`), and `useStreamdownPlugins(text)` that returns the plugin set once the needed dynamic imports (`@streamdown/math` + `katex/dist/katex.min.css`, `@streamdown/code`) resolve; cjk + remark-breaks stay static (small). Imports start as soon as any message on the page needs them (one shared promise per plugin). While pending, the message renders the existing pending/skeleton state; on import failure, it renders with the plugins it has and logs. Inline code needs no plugin.
- `latex-glyph.tsx`, `page-math-view.ts`, `content-reader.ts` import katex directly; verify they are not in Home's or the chat's first-load graph (bundle check); lazy-load them too if they are.
- **Rationale**: owner Clarification Q3 (wait, no raw flash).

## R7 Verification

- Re-run the baseline driver (copied to `~/agent-runs/2026-11-09-instant-loads/perf/`) on a throwaway container of the new image with the same data copy and remote profile; fill an "After" column in spec.md's baseline table. Constitution VIII: compare first-load JS of Home/chat and sidebar readiness against the same run's baseline numbers.
