# Research: Notebook mode

Each item: Decision, Rationale, Alternatives.

## R1 Route and shell

- **Decision**: `app/(app)/notebook/[[...id]]/page.tsx` under the existing root layout. `AppShell` (`components/sidebar.tsx:986`) checks `pathname.startsWith("/notebook")` and renders `children` without `SessionsSidebar`, `<main>`, tabs or right pane, keeping `SettingsDialogProvider`, `SessionListProvider`, `WorkspaceProvider`, `KeyboardShortcuts` (Notebook-safe subset) and the palette host. The `(app)` layout redirects `/` to `/notebook` when `general.interface === "notebook"` and the request is a plain visit to `/`.
- **Rationale**: one root layout keeps `SessionAccountProvider`, `ServerEventsProvider` and `ActivityProvider` that `usePageDraft` and the corner hint need; switching is a soft navigation.
- **Alternatives**: a `(notebook)` route group with its own root layout (forces full reloads and duplicates bootstrap scripts and hosted providers).

## R2 Editor

- **Decision**: Notebook mounts its own `useEditor` with `pageExtensions()` and `createPageCodec()` from `components/library/page-markdown.ts`, plus Notebook plugins (`nb-plugins.ts`): passage underline/wash decorations, `?` mark widgets, inline reply widget slots, title-as-first-H1 class. Save goes through `usePageDraft(id)` (`components/library/use-page-draft.ts`), exactly as `page-pane.tsx:584` does.
- **Rationale**: same Markdown codec means a page round-trips between modes byte for byte; `PageEditor` hard-codes its toolbar, bubble and class.
- **Alternatives**: add `variant`/`extraExtensions` props to `PageEditor` (more risk to Study).
- **Title**: the huge title is the **page name**, edited in place with Riddled's `h1.note-title` metrics (2.45× note size, -0.032em, 500, 1.12) as a single-line field above the body, saved through the existing rename route. The body is the page content. Nothing is inserted into his text, so a page means the same in both modes. Enter in the title moves to the body. An empty name shows the placeholder and saves as "Untitled note" (clash steps as the Library does).

## R3 Model calls

- **Decision**: new role `notebook` (`config.ts` `ModelRole`, `ROLE_SLOT.notebook = "strong"`, listed in `BACKGROUND_MODEL_ROLES` so it can be overridden). Read/think/visualize use `runSubmitAgent` with TypeBox schemas (see api.md). Reply and chat use `engine.streamFn` with text deltas forwarded to subscribers. Prompts are inline constants in `src/agent/subagents/notebook.ts`, like `CARD_MAKER_INSTRUCTIONS`.
- **Rationale**: structured output gives a quote to anchor and a sketch spec to validate; streaming gives word-by-word ink.
- **Alternatives**: a chat `ChatKind` (rejected by owner: not sessions); overridable prompt segments (larger change, no owner ask).

## R4 Runs, activity and streaming

- **Decision**: `src/server/notebook.ts` keeps a tenant-scoped registry `{id, pageId, kind, threadId?, status, usage, startedAt, abort, deltas[]}`. `activityFeed()` gains `notebookRuns`; the abort route gains `kind: "notebook"`. Client follows `GET /api/notebook/runs/:id/stream` (SSE, wire format from `src/server/events-stream.ts`), and `notebook-changed {pageId}` server events refresh the companion.
- **Rationale**: constitution V: runs are server objects; leaving detaches; cost at read time via `jobCost`.

## R5 Anchoring

- **Decision**: threads store `{quote, prefix, suffix}` (`anchorContext` from `src/core/document-anchors.ts`) against the note's plain text, plus a block hint. Resolution each render: exact quote with best context match; else fuzzy nearest; else detached. The model must return a verbatim quote; the server rejects a read whose quote is not in the text it was given (the run ends silent).

## R6 Sketches

- **Decision**: our own sketch schema (data-model.md) of primitives — `grid`, `cell`, `line`, `arrow`, `rect`, `circle`, `dot`, `text`, `path` (restricted SVG path commands), `bar` — each tagged with the step that reveals it. Pure renderer in `src/core/notebook-sketch.ts` makes the SVG for the page, the dialog and exports. Animations follow Riddled: strokes `pencil-draw` via `pathLength=1` dash offset, bars `sketch-grow`, dots `sketch-dot`/`sketch-pop`, step changes fade `opacity .45s cubic-bezier(.22,1,.36,1)`.
- **Alternatives**: Mermaid (Riddled's landing hints at it, but Mermaid can't step or ink in); React Flow diagrams (too heavy, not inline).

## R7 Export

- **Decision**: Markdown in core. PDF: `renderPdf(html)` added to `src/agent/subagents/headless.ts` (puppeteer `page.pdf`, JavaScript disabled, our HTML + embedded fonts). Word: `src/core/docx.ts` writes `document.xml`, `styles.xml`, numbering and image parts; `src/core/zip.ts` packs with Node `zlib.deflateRawSync` and `zlib.crc32`; sketches embedded as PNG from `@resvg/resvg-js`.
- **Alternatives**: `window.print()` (Riddled exports a file; print dialog is not "Export PDF"); `docx` npm package (new dependency).

## R8 Fonts

- **Decision**: `notebook-fonts.ts` in the route: `Instrument_Sans({subsets:["latin"], variable:"--nb-font-sans", axes:["wdth"]})`, `Newsreader({subsets:["latin"], weight:"variable", style:["normal","italic"], axes:["opsz"], variable:"--nb-font-voice"})`; AI text `font-weight:420; font-variation-settings:"opsz" 14` (visual-reference.md has the exact rule). Variables on the `.nb-root` wrapper only.

## R9 Shortcuts

- **Decision**: mode toggle **Mod+Shift+O** (free in Study and Notebook; Mod+Shift+M is the editor's formula key). Notebook binds Riddled's footer set: Copy this note Mod+Shift+C, Export this note Mod+Shift+E, Just my words Mod+Shift+H, Settings Mod+, , Find or start a note Mod+K, sidebar Mod+\\ ... Only active on Notebook routes; Study's map unchanged except the toggle. Final list in ui-contract.md.

## R10 Theme

- **Decision**: `notebook.appearance: "system" | "light" | "dark"` applied as `data-nb-theme` on `.nb-root`, `system` following `prefers-color-scheme`. Study keeps Study ink. The `.paper` fixed layer with the feTurbulence grain from the reference sits behind the note.

## R11 Playwright

- **Decision**: `@playwright/test` exact-pinned dev dependency; `playwright.config.ts` launches `/usr/bin/chromium-browser` (or `CHROME_PATH`) with `TMPDIR` under `$HOME` (snap Chromium); `webServer` runs `next dev` on port 3124 with a fresh `LH_DATA_DIR`, `LH_HOSTED=0`; model work is faked server-side by `LH_NOTEBOOK_FAUX=1`, a test-only switch read in `src/agent/subagents/notebook.ts` that swaps the engine for a scripted `createFauxCore` (never active unless `NODE_ENV !== "production"` and the variable set). `npm run test:e2e`.

## R12 Phones

- **Decision**: below 768px the effective layout is Marks only; a mark expands its thread inline under the paragraph. Toolbar row wraps; sidebar overlay is full width; chat panel full screen; settings modal full screen with nav as a top row.
