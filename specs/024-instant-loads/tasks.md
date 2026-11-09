# Tasks: Instant loads

**Input**: `specs/024-instant-loads/` (spec, plan, research, contracts, data-model, quickstart)
**Tests**: included (route, cache, srcdoc and plugin-gating tests; browser regressions in the final phase).
Format: `- [ ] Txxx [P] [USn] description (path)`.

## Phase 1: Setup

- [X] T001 Add `plotly.js@4.1.2` as a devDependency (build-time only; same version as `plotly.js-dist-min`); confirm it is not imported by any app/server module (`package.json`, `package-lock.json`)
- [X] T002 Record pre-change numbers for constitution VIII: Home and chat first-load JS (transferred/decoded) from the current `npm run build` route output (`.next` app-build-manifest / build log) and the baseline in spec.md (`~/agent-runs/2026-11-09-instant-loads/before.md`)

## Phase 2: User Story 1 — A PDF opens at once (P1) 🎯 MVP

**Goal**: page 1 from ranges; reopen revalidates (304). **Independent test**: contract table + perf driver PDF scenario.

- [X] T003 [P] [US1] Tests for the content route per `contracts/library-content-ranges.md`: 200 with Accept-Ranges/ETag/`private, no-cache`; 304 on If-None-Match; 206 for `a-b`, `a-`, `-n`; If-Range mismatch → 200; multi/malformed → 200; unsatisfiable → 416; `?download=1`; ETag changes after the file is rewritten; tenant isolation unchanged (`tests/library-content-ranges.test.ts`)
- [X] T004 [US1] `openDocumentStream` accepts an optional byte range and returns size + mtime (`src/server/documents.ts` or its store adapter)
- [X] T005 [US1] Implement ranges, ETag, conditional requests and `private, no-cache` in `contentHeaders` / `libraryContentResponse`; never content-encode this response (`src/server/library.ts`)
- [X] T006 [P] [US1] Tests: `pdfjsAssetResponse` gzips `.mjs`/`.js` when Accept-Encoding has gzip, sets `Vary: Accept-Encoding`, leaves binary assets alone (`tests/pdfjs-assets.test.ts`)
- [X] T007 [US1] Gzip text pdf.js assets with an in-memory memo (`src/server/documents.ts`)
- [X] T008 [US1] `pdfLoadOptions`: `disableStream: true`, `disableAutoFetch: true`, `rangeChunkSize: 262144`; update its pinning test (`components/library/pdf-options.ts`, existing test)
- [X] T009a [P] [US1] Tests for versioned chunk requests per the contract's revision section: exact bytes, immutable headers, 412 on stale `v`, 400/416 on invalid chunk/size, tenant scoping (`tests/library-content-ranges.test.ts`)
- [X] T009b [US1] Implement the versioned-chunk branch of the content route (`src/server/library.ts`)
- [X] T009c [US1] Reader: a `PDFDataRangeTransport` (`components/library/pdf-transport.ts`) that reads ETag + size first, fetches chunks in parallel at versioned URLs, reports progress, and on 412 reloads; `pdf-reader.tsx` passes it to `getDocument`; pure parts unit-tested
- [ ] T009 [US1] Verify in headless Chromium against a local build: page 1 renders, jump to a far page fetches only its ranges, reload shows 304s, Download still returns the whole file; note the result in progress.md

## Phase 3: User Story 2 — Plots appear at once after the first view (P1)

**Goal**: one download per library per version, from the app page's cache; no remounts. **Independent test**: 4-plot chat warm/return with zero `/demo-kit` bytes, one `demo-ready` per plot.

- [ ] T010 [US2] `next.config.ts`: compute `LH_DEMO_KIT_VERSION` (short hash of `public/demo-kit/*`, empty when missing) into `env`; `headers()` for `/demo-kit/:path*` with `has` query `v` → `public, max-age=31536000, immutable` (read the Next docs for `headers` in this version first)
- [ ] T011 [P] [US2] Tests for `demo-lib-cache`: allow-list, one fetch per file across concurrent callers, versioned URL, rejected promise is dropped so a retry refetches (`tests/demo-lib-cache.test.ts`)
- [ ] T012 [US2] `components/artifacts/demo-lib-cache.ts`: `getDemoLib(file): Promise<string>` with the allow-list from `contracts/demo-lib-bridge.md`
- [ ] T013 [P] [US2] Tests: srcdoc inlining replaces each `/demo-kit/` script/link with inline code, escapes `</script`, leaves other tags and non-kit URLs untouched, keeps the bridge script last (`tests/render-demo-srcdoc.test.ts`)
- [ ] T014 [US2] Demo card: build the srcdoc asynchronously with inlined kit files (existing loading state until ready; fetch failure → existing demo error state); answer `demo-lib-request` from this card's frame only, per the contract (`components/artifacts/demo-card.tsx`)
- [ ] T015 [US2] Kit runtime `load()`: bridge request with parent, `<script src>` fallback when there is no parent; inject via textContent; keep the existing error message (`src/demo-kit/runtime.ts`)
- [ ] T016 [US2] Find the cold-load remount cause (R4) with the perf driver's `demo-ready` count; fix it; add a test that pins the stable srcdoc/key across the re-render that caused it (`components/artifacts/*`, test file named after the cause)
- [ ] T017 [US2] Run `scripts/smoke-demo-workspace.mjs` and the plot/headless tests (`TMPDIR` under `$HOME`); downloaded demo (`downloadableDemo`) still opens standalone

## Phase 4: User Story 3 — 3D plots start without freezing (P2)

**Goal**: light plotly by default, full per plot when needed. **Independent test**: cold 4-plot chat bytes and longest task.

- [ ] T018 [US3] `src/demo-kit/plotly-light-entry.ts`: plotly core + scatter3d, surface, mesh3d, cone, streamtube, isosurface, volume, contour, heatmap; exposes `window.Plotly`
- [ ] T019 [US3] Build `public/demo-kit/plotly-light.js` in `scripts/build-demo-kit.mjs`; print its raw and gzip size; add it to the bridge allow-list (`contracts/demo-lib-bridge.md`, `demo-lib-cache.ts`)
- [ ] T020 [P] [US3] Test the pure trace-type gate (`lightPlotlyCovers(traces)`; default type `scatter`) (`tests/demo-kit-plotly-gate.test.ts`)
- [ ] T021 [US3] `plot3d` in the runtime: load `plotly-light.js` when covered, else `plotly.js`; camera, invert, resize, focus and theme behave as before (`src/demo-kit/runtime.ts`)
- [ ] T022 [US3] Headless check: built-in quick plot (surface + contour) renders with the light build; a plot with a `bar` trace loads the full build and renders

## Phase 5: User Story 4 — Pages load with less code (P3)

**Goal**: math/code renderers on demand, no raw-source flash. **Independent test**: Home first-load JS without katex/shiki; math chat shows no raw `$`.

- [ ] T023 [P] [US4] Tests for `needsMath` / `needsCode` (dollar math, `\(`/`\[`, fenced code, inline code alone → no, `$` inside code → no) (`tests/markdown-plugins.test.ts`)
- [ ] T024 [US4] `components/ai-elements/markdown-plugins.ts`: detectors, shared dynamic imports of `@streamdown/math` (+ `katex/dist/katex.min.css`) and `@streamdown/code` with the existing options, `useStreamdownPlugins(text)`
- [ ] T025 [US4] Use it in `message.tsx` and `reasoning.tsx`; a message needing a pending plugin shows the existing pending state; failure renders with available plugins and logs; remove the katex CSS import from `app/(app)/layout.tsx`
- [ ] T026 [US4] Check whether `latex-glyph.tsx`, `page-math-view.ts`, `src/core/content-reader.ts` put katex in Home's or the chat's first-load graph; lazy-load where they do
- [ ] T027 [US4] Render tests: a math message never renders raw `$…$` text; a plain message renders immediately (`tests/render-message-plugins.test.tsx`)
- [ ] T028 [US4] UI check of the transcript at 320, 390, 1440 px with `impeccable` and `web-design-guidelines`

## Phase 6: Polish & verification

- [ ] T029 `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`; pre-existing failures recorded separately
- [ ] T030 Re-run the perf driver on a throwaway container of the new image (same data copy, remote profile); add an "After" column to spec.md Baseline; check SC-001…SC-005; constitution VIII comparison with T002
- [ ] T031 Update docs that describe demo-kit loading or the PDF route (`src/core/demo-kit.ts` header comment, `scripts/build-demo-kit.mjs` header, any `docs/` mention) and `specs/ROADMAP.md`

## Dependencies

- Phase 1 → all. US1 (Phase 2) independent of US2–US4. US3 depends on US2's bridge (T014/T015). US4 independent.
- MVP = Phases 1–2.
