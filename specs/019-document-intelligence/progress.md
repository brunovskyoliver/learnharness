# Features 019-020: Document intelligence
Stage: done, not merged or deployed
Updated: 2026-11-01

## Decisions

Owner-facing decisions are in spec.md, Clarifications. Technical ones:

- The worker comes from a route, not a bundler asset: same origin everywhere, the version always the installed package's, and no generated files. It sits outside `/api`, so it doesn't depend on Electron adding the desktop header to a worker's requests.
- The legacy pdf.js build in the browser, for older WebKit and Chromium. It costs nothing until a PDF opens.
- The asset route's dynamic read carries `turbopackIgnore`. Without it the build gains two "tracing of the whole project" warnings (back to the base's 4).
- Jump marks are ProseMirror decorations. A class set directly on the DOM was redrawn away at once, and a decoration can't become an edit.
- A lost annotation leaves the page's list until reload, so a redraw can't flicker it.
- The prompt text is a new fragment because feature 009's fragment is pinned verbatim to its approved doctrine.

## Log

- `IntersectionObserver` with the default root clips at the scroller, so its margin did nothing: pages drew only once visible. It now uses the scroller as root.
- The citation effect looped ("This view could not be shown"), because opening changes the pane it depends on. It now handles each address once.
- A page redrawn later could pull the learner back to a citation. The result is now reported once per request.

## Report

**Built**
- 019: the file-backed index with generations and atomic shards; background catch-up from `library-changed`; a safe full Reindex; five honest states; search with escaped snippets, Type, tag, Folder and Hide archived; Names | Full text in the Library; "Inside your documents" in the palette; jump to a page block, a text line and a PDF page.
- 020: the reader in the right pane, with a tab, Download and Open in a new tab; selection; persisted highlights and notes with page, quote and position anchors; unanchored rows; tutor questions on a click, as marked material, labelled as sent; citations with item, page and quote from notes, the transcript and any address, reporting honestly; Save to a page with a citation; Generate questions through the tutor's quiz path.

**Verified**
- `npx tsc --noEmit`: clean. `npx eslint .`: clean. `npx next build`: pass, 4 tracing warnings, same as the base.
- `TMPDIR=~/lh-tmp NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx`: 3701 tests, 3699 pass, 0 fail, 2 skipped. An earlier full run had one failure in `tests/chatgpt-auth.test.ts`, the known flake; alone it passed 34 of 34, and it passed in the final run.
- `scripts/check-documents-ui.mjs`: pass at 1440, 390, 320 on the dev server, and on the standalone server (`LH_UI_STANDALONE=1`), the same server the Docker image and desktop app run. It fails on any request to another origin, so the worker is shown to be local.
- `scripts/check-workspace-ui.mjs`, `check-library-ui.mjs` (74 PASS lines), `check-library-folders-ui.mjs`, `check-notes-ui.mjs`: pass.
- Initial JS gzipped, measured with feature 014's script (`~/agent-runs/2026-10-31-workspace/measure-html.mjs`):

| Route | 016 | Now | Change | Against pre-014 |
| --- | --- | --- | --- | --- |
| `/` | 287.5 KB | 287.6 KB | +0.05% | +3.0% (279.4) |
| `/library` | 291.7 KB | 294.1 KB | +0.8% | +4.0% (282.9) |
| `/chat/new` | 279.1 KB | 279.2 KB | +0.05% | +3.4% (269.9) |

  Under the 5% ceiling, but `/library` has 1% left. This isn't the constitution's throttled benchmark, whose baseline is still an open TODO.

**Skills**
- `web-design-guidelines` (rules fetched) and `impeccable` (context, audit playbook, detector with no findings on the new files) were run, and their findings fixed: Undo on removing a highlight, no layout reads in render, focus return after the note dialog, overscroll, a field name, the placeholder's ellipsis, and the palette icon. The `speckit-feature` and `shadcn` skills were not run: the artifacts were written by hand under the no-questions rule, using the existing primitives.

**Tests changed on purpose**
- `tests/render-library.test.tsx`, `scripts/check-library-ui.mjs`: a PDF row is a button for the pane, not a new-tab link.
- `tests/provider-tracing.test.ts`: the tracing list names the reader's assets.
- `tests/prompt-overrides.test.ts`: the segment list has `shared/32-documents.md`.

**Not run or not exercised**
- No Electron build or live check; this machine is Linux and the release target is macOS. By reading: `electron-builder.yml` ships all of `.next/standalone`, where the assets are present, and `/pdfjs` isn't behind the desktop gate. The standalone browser check is the closest evidence.
- No Docker image build, and hosted mode has handler tests only, with no browser run. In hosted mode `/pdfjs` needs a session, which the page has.
- A tutor action started from `/library`, which goes to `/chat/new?send=…`. The browser check covers the in-session path. A long passage makes a long URL there.
- A real model reply with a citation: the transcript case uses a seeded message.
- Reduced motion wasn't separately exercised: the one new transition is removed by a CSS rule.
- Real scans: the fixture is a generated PDF with no text.
