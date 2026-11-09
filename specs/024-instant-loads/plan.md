# Implementation Plan: Instant loads

**Branch**: `main` (owner decides branching) | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/024-instant-loads/spec.md`

## Summary

Four independent speed fixes, each measured against the spec's baseline with the same driver:

1. **PDF**: the Library content route answers single byte ranges with a version tag (ETag) and `private, no-cache`; the reader asks pdf.js for ranges only (no full stream, no auto-fetch); the pdf.js worker and text assets are sent gzip-compressed.
2. **Plot libraries**: the app page (normal origin, normal HTTP cache) fetches `/demo-kit/*` with a content version in the URL and immutable caching, keeps one promise per file in memory, and gives the code to the sandboxed frames: inlined into the srcdoc for `<script src="/demo-kit/…">` tags, and through a validated bridge message for the kit runtime's on-demand `load()`. The sandbox attribute is unchanged. The cold-load remount of plot frames is found and removed.
3. **Light plotly**: a custom esbuild bundle (`plotly-light.js`) of plotly's core plus the 3D traces, contour, heatmap and scatter. The kit runtime's `plot3d` uses it, and loads today's full `plotly.js` for that plot when a trace type is outside the light set. Hand-written demos that reference `/demo-kit/plotly.js` keep the full build.
4. **Renderers on demand**: `@streamdown/math` (KaTeX + its CSS) and `@streamdown/code` (shiki) are imported dynamically. A message whose text needs one waits for it; others render at once. Home's first-load graph loses both.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js (this repo's version; read `node_modules/next/dist/docs/` before touching `next.config.ts` headers or route handlers)
**Primary Dependencies**: pdfjs-dist (legacy build), streamdown + @streamdown/math/code/cjk, esbuild (demo kit), plotly.js-dist-min 4.1.2; **new build-time only**: `plotly.js` 4.1.2 source package as a devDependency (owner-approved, Clarifications)
**Storage**: file-backed; unchanged. Version tag derived from file stat (size + mtime) and item id.
**Testing**: `npm test` (tsx --test, render + route tests), `npm run lint`, `npm run typecheck`, `npm run build`; browser regressions in `scripts/` (`smoke-demo-workspace.mjs`, plot/headless tests with `TMPDIR` under `$HOME`); the baseline perf driver in `~/agent-runs/2026-11-09-instant-loads/perf/run.mjs`.
**Target Platform**: hosted web (Docker behind Caddy), local web, desktop Electron (standalone server).
**Project Type**: web application (Next.js app router, single repo).
**Performance Goals**: spec SC-001…SC-005.
**Constraints**: constitution VII sandbox unchanged; VIII no regression of initial JS / sidebar readiness / startup; headless demo check (file:// demo-kit) keeps working; hosted tenant scoping on the content route unchanged.
**Scale/Scope**: ~10 source files, 1 build script, `next.config.ts`, tests.

## Constitution Check

| Principle | Status |
|---|---|
| I Owner decides | Pass. Scope and four clarifications answered by the owner 2026-11-09; technical choices below are reversible and logged in research.md. |
| II Teaching theory first | Pass. No lesson, question or graph behaviour changes; nothing reaches the client earlier than before. |
| III Learner data is never lost | Pass. No stored format changes; learner files only read (ranges). Reading positions untouched. |
| IV Honest states | Pass. Unsatisfiable range → 416; library load failure → existing plot failure state (FR-011); a message waiting for its renderer shows the existing message skeleton/streaming state, and a renderer import failure falls back to plain rendering with the error logged, never a spinner forever. |
| V Consent before cost | Pass. No model calls. |
| VI Interface follows DESIGN.md | Pass. No visual change except removing raw-source flashes; checked at 320/390/1440 with impeccable + web-design-guidelines on the chat transcript. |
| VII Boundaries, tenancy, sandboxing | Pass. Frames stay `sandbox="allow-scripts"`; the new bridge message (`demo-lib`) is validated by source window and a fixed file allow-list, and the parent sends only same-origin `/demo-kit/` code it fetched itself. Content route stays behind `withTenant`; cache is `private`. `src/core` gets no server imports. |
| VIII Performance does not regress | Pass by design (initial JS shrinks); verified with the throttled benchmark before/after (task in final phase). |

No exceptions; Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/024-instant-loads/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── library-content-ranges.md
│   └── demo-lib-bridge.md
├── checklists/requirements.md
├── progress.md
└── tasks.md
```

### Source Code (repository root)

```text
src/server/library.ts              # range + ETag + private no-cache on content route
src/server/documents.ts            # openDocumentStream with start/end; pdfjs asset gzip
src/store/…                        # (only if stat/mtime needs an adapter accessor)
components/library/pdf-options.ts  # disableStream, disableAutoFetch, rangeChunkSize
components/library/pdf-reader.tsx  # (no logic change expected beyond options)
scripts/build-demo-kit.mjs         # plotly-light.js bundle; content hash manifest
src/demo-kit/plotly-light-entry.ts # new: register core + chosen traces
src/demo-kit/runtime.ts            # load(): ask parent via bridge, fallback to <script src>
components/artifacts/demo-lib-cache.ts   # new: one fetch promise per file, versioned URL
components/artifacts/demo-card.tsx       # srcdoc inlining of /demo-kit scripts, bridge reply, remount fix
src/core/demo-kit-document.ts      # (constants only if needed)
next.config.ts                     # LH_DEMO_KIT_VERSION env + immutable headers for versioned /demo-kit
components/ai-elements/message.tsx # dynamic math/code plugins; wait when needed
components/ai-elements/reasoning.tsx
app/(app)/layout.tsx               # move katex CSS to the math plugin's lazy import
tests/…                            # route, cache, srcdoc, plugin-gating tests
```

**Structure Decision**: existing single Next.js app; no new packages besides the build-time plotly source.

## Complexity Tracking

None.
