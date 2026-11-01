# Feature 022: Diagrams
Stage: done, not merged or deployed
Updated: 2026-11-01

## Decisions

Owner-facing decisions are in spec.md, Clarifications. Technical ones:

- The page's store functions take a kind, and `store/diagrams.ts` wraps them, so there is one crash-repair path.
- `PageDraftController` is reused with the serialized document as its text.
- `disableKeyboardA11y` is on, and the canvas handles keys itself, so a keyboard move joins undo. Keyboard focus selects.
- Edges are drawn from measured boxes rather than handles, so a node's left neighbour doesn't loop.
- Node boxes in the SVG are estimated from text, so the export needs no browser layout. It can differ slightly from the screen.

## Log

- A new node's field couldn't take focus: React Flow hides a node until it is measured. The field now retries, and the view request no longer steals focus from it.
- Escape did nothing in full screen or Draw after a pointer click, since focus was on no element. Full screen listens on the document, and the pen layer holds focus.
- `--edge` isn't a token here, so node borders were missing. They use `--input`.
- Searching faster than every 150 ms keeps putting off the index's catch-up, since `scheduleDocumentIndex` restarts its timer. It predates this feature, and only the browser check's polling hit it. Left alone, and the check polls slower.
- A line added to `practice/20-library.md` failed the wording test: that file is owner-approved verbatim. Reverted, and practice has its own fragment.

## Report

**Built**
- Evaluation in spec.md: Excalidraw 2.54 MB gzipped and 243 MB installed, against React Flow's 59 KB. React Flow, no Excalidraw.
- `diagram` Library items with folders, tags, favorites, pins, archive, trash, recent and name search, stored beside `items` in the catalog. Append-only versions, autosaved draft, History with Restore, newer schema refused.
- Editor in the right pane, a tab and full screen: nodes, labelled edges, sticky notes, freehand, zoom, pan, undo, redo, three forms, a list form that leads below 360 px, a text outline.
- Export: SVG, PNG (browser canvas), JSON.
- Links from nodes and the whole diagram to notes, lessons and ideas, with renames kept and dangling honest; in the Links panel both ways. Full-text search and `@` read an outline.
- `diagram_propose`, its Settings switch, and review with a comparison, Approve, Reject and Edit first.

**Prompt wording the owner hasn't seen**

`src/agent/prompts/teacher/48-diagrams.md`:

> His Library also holds diagrams, concept maps and whiteboards. Use `diagram_propose` only when he asks for a diagram or a change to one. It stores a proposal he reviews; nothing changes unless he approves, so say it is waiting for him and never call it done. To change a diagram, `library_read` it, then pass `item`, the `baseVersion` you read, and the whole wanted set of nodes and edges, repeating the `id` of each node you keep.
>
> Labels are plain text and state what is true. Never put the answer to a question you have posed or are about to pose into a diagram: the tool refuses while a question is waiting. A diagram does not replace a graded check.

`src/agent/prompts/practice/25-diagrams.md`:

> Use `diagram_propose` only when he asks for a diagram or a change to one. It stores a proposal, and nothing changes unless he approves it. It refuses while a problem is active.

The tool's description and field descriptions in `src/agent/tools/diagrams.ts` are model-facing too. `shared/30-learner-files.md` is approved wording and was left, so it still says "documents and pages".

**For the owner**
- **Consent rests on wording**: nothing in code stops the model calling `diagram_propose` unasked. A proposal changes nothing and the call happens inside a turn he started, but "only on explicit request" is enforced by the prompt, as `plot` is.
- **Exception candidate, constitution III**: as in 017 and 021, a deleted session's approved versions and proposals keep their content.
- **Same-file name**: diagram versions are JSON in `v{n}.md`, to share the page code.

**Verified**
- `npx tsc --noEmit`: clean. `npx eslint .`: clean. `npx next build`: pass, 4 warning lines, the count 021 reported.
- `TMPDIR=~/lh-tmp CHROME_PATH=/snap/bin/chromium NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx`: 3817 tests, 3814 pass, 1 fail, 2 skipped. The failure is `tests/chatgpt-auth.test.ts:619`, on the known-flake list. Alone with `tests/chatgpt-connection-ui.test.tsx`: 86 of 86 pass. 60 tests are new (`tests/diagrams.test.ts` 52, `tests/render-diagrams.test.tsx` 7, one in `tests/prompt-overrides.test.ts`).
- `scripts/check-diagrams-ui.mjs`: pass, 57 PASS lines at 1440, 390, 320, with a real touch pinch and pan at 390. `scripts/check-workspace-ui.mjs`, `scripts/check-library-folders-ui.mjs`: pass. Screenshots in `~/agent-runs/2026-10-31-workspace/shots/diagrams-*`; read: edge, review, edit first, full screen, board, links, history and Library, at the widths that showed defects (fixed above). The final run's were not all reread.
- Rollback against the real store at `01a6619`, by hand: results in plan.md, Rollback.
- No React Flow on initial load: production HTML for `/`, `/library`, `/chat/new`, `/review` has 0 assets with it; the browser check asserts it per width in dev.
- Initial JS gzipped, same script (`~/agent-runs/2026-10-31-workspace/measure-html.mjs`):

| Route | 021 | Now | Change | Against pre-014 |
| --- | --- | --- | --- | --- |
| `/` | 288.8 KB | 289.0 KB | +0.1% | +3.4% (279.4) |
| `/library` | 293.2 KB | 294.1 KB | +0.3% | +4.0% (282.9) |
| `/chat/new` | 279.5 KB | 279.8 KB | +0.1% | +3.7% (269.9) |

  Under the 5% ceiling, with about 1% of `/library`'s room left: `/library` went from +3.6% to +4.0%. This isn't the constitution's throttled benchmark, whose baseline is still an open TODO.

**Skills**
- `web-design-guidelines` (rules fetched, paraphrased by the fetch tool rather than verbatim) and `impeccable` (context, audit playbook, detector with no findings) were run, and their findings fixed: keyboard focus now selects; a doubled accessible name; `role="toolbar"` without arrow keys; placeholders; list virtualization replaced by `content-visibility`; safe areas in Edit first; a missing border token. Left as is: Title Case (DESIGN.md's strings are sentence case, and DESIGN.md wins); autofocus after an explicit Add or Connect on phones, since the action is to type; preview images without fixed dimensions, inside dialogs.
- `speckit-feature` and `shadcn` were not run: artifacts were written by hand under the no-questions rule, using existing primitives. `node_modules/next/dist/docs/` was read for lazy loading only; routes follow the existing ones with no new Next API.

**Tests changed on purpose**
The pinned tool lists gain `diagrams`: `tests/question-tools.test.ts`, `tests/settings-pure.test.ts`, `tests/render-settings.test.tsx`, `tests/tool-toggles-bridge.test.ts`. `tests/prompt-overrides.test.ts` gains a case. Golden fixtures are unchanged.

**Left out**
- Resizing nodes; a node's size follows its text. No Excalidraw-grade drawing: no shapes, colours or eraser (delete a stroke whole).
- Named versions, which pages have. The stored viewport.
- Create page from a diagram's dangling link: the line says what is missing, without the button pages offer.
- A lesson link to one message: it names the session.
- A keyboard path for freehand, by design: sticky notes are the alternative.

**Known limits**
- An approval from a transcript row or the Library while the same diagram is open with unsaved changes shows the conflict line, rather than following. His text and the approved version are both kept. From the pane's own Review it saves first and follows.
- Lists aren't virtualized. `content-visibility` helps, but 2000 fields or a canvas of that size haven't been measured.
- A proposal found by a stale approval compares against the current diagram, and it replaces the whole document: changes since are shown as removed, not merged.

**Not run or not exercised**
- A real model call: the tool runs in unit tests against the real store, and the browser check seeds the file the tool writes.
- The transcript row's Review, the palette's New diagram, "Ask the tutor", search landing on a node, and following links from the panel: code and unit level, no browser path.
- Reduced motion and the Mac's Cmd key: CSS and code only.
- Hosted mode in a browser, Electron, and a Docker image. Tenant isolation is by handler tests.
