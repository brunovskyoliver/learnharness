# Feature 022: Diagrams

**Branch**: `feat/022-diagrams`, from `feat/021-spaced-repetition`
**Created**: 2026-11-01
**Status**: Implemented, not merged or deployed

**Input (owner)**: "Add editable diagrams, concept maps and whiteboards linked to notes/lessons, with zoom/pan, undo/redo, autosave and export. AI can propose diagrams but user approves changes. Evaluate Excalidraw versus existing React Flow/demo tools; avoid redundant or heavy dependencies."

## Evaluation: Excalidraw or React Flow

Measured 2026-11-01. Excalidraw was installed in a scratch folder outside the repo with scripts off, and never in this repo. Both bundled with the repo's esbuild, minified, React external, gzipped.

| | `@excalidraw/excalidraw` 0.18.1 | `@xyflow/react` 12.11.3 |
| --- | --- | --- |
| Already a dependency | No | Yes (demo-kit flow panels) |
| Install size | 49 MB package, 243 MB with 260 packages | 4.4 MB (`node_modules/@xyflow`) |
| JS, minified | 8.19 MB across 179 files | 179 KB, 1 file |
| JS, gzipped | 2.54 MB in all, 186 KB entry | 59 KB |
| Fits the keyboard and proposal rules | Own canvas and scene format; text lives in a bitmap canvas | DOM nodes, focusable, styled by our tokens; the document stays ours |

**Decision: React Flow, no Excalidraw.** The evidence agrees with the roadmap: about 43 times the JS, and a canvas scene whose text a screen reader and our index can't read. What Excalidraw would add is richer freehand drawing, which this brief asks for only in simple form. The React Flow figure is the entry above; its stylesheet is a further 18.6 KB uncompressed and loads with the canvas.

## Clarifications

The owner approved every recommended option and asked for no questions (ROADMAP standing rules). Each decision below was made under that approval. **The owner has not seen any of them.**

### Storage
- **Catalog row**: `kind: "diagram"` in memory. On disk, diagrams and their tombstones sit in a new top-level `diagrams` array, not in `items`. An older app tombstones any item whose file is missing, so `items` would lose them. Trash already works this way. The catalog version stays 1.
- **Content**: the page machinery unchanged: `library/pages/<id>/versions.jsonl`, one content file per version, one `draft.json`. Files keep the name `v{n}.md` though they hold JSON, because sharing the code outweighs the name.
- **Format**: `{ schema: 1, form, nodes, edges, links? }`, written by one `serializeDiagram`. A newer schema is refused on read, write and restore, and nothing is rewritten.
- **Limits**: 1 MB per version (as pages), 2000 nodes, 5000 edges, 2000 characters per text, 2000 points per stroke, 40 links per target. Past the limit a save is refused with a sentence.

### Editor
- **Three forms** differ only in how they start and their noun: diagram (one node, "node"), concept map (one node, "idea", a pointer connection asks for a label), whiteboard (empty, "note", sticky notes and Draw).
- **Edges** are straight lines between box edges, on screen and in the export, so the two match.
- **Versions**: autosave writes a draft. Ctrl/Cmd+S, closing the pane and leaving make a version, as pages do. Undo covers this open session and starts over when the document is replaced from outside; History covers the rest.
- **List alternative**: below 360 px of editor width the list leads and no canvas loads. Either view can be chosen at any width.
- **Not stored**: viewport. A diagram opens fitted.

### Export
In the browser, from what is on screen, unsaved edits included. PNG draws the same escaped SVG on a canvas, chosen over the `@resvg/resvg-js` server path because nothing leaves the machine and desktop behaves the same. An SVG in an image can't reach the app's web fonts, so PNG text uses a system sans; box sizes are estimated to allow for that.

### Links
- A **note** link is stored by written name and resolved by feature 016's rules. A rename rewrites nothing, and the store pins what the link meant. Dangling is kept and says so in the Links panel.
- A **lesson** link names the session, with its title kept as text. It is read as a feature 017 source reference, so a deleted session reads as gone.
- An **idea** link stores a graph node id and the name it had. It is read only. An idea no longer in the graph says so.
- Brackets typed in a label are words. They can't make a link or forge a source reference.
- The diagram's Links panel is the page's panel, and a page's panel lists diagrams with "Diagram ·".

### Proposals
- `diagram_propose` carries the **whole wanted set** of nodes and edges. A node named by id keeps its place and links, and one left out is removed. Freehand strokes can't be seen or changed by it.
- It stores one file under `library/diagram-proposals/<diagramId or "new">/`, apart from versions and draft. No route creates a proposal: only the tool.
- **Approve** names what was compared (head and draft rev). If the diagram moved, it refuses and the comparison refreshes, so an approval can't undo what wasn't seen. A draft becomes the learner's own version first. The result is one version with `author: "agent"`, `cause: "proposal-approved"`.
- **Reject** keeps the file, marked rejected. **Edit first** changes only the proposal; the version then records `editedByLearner`.
- A proposal for a **new** diagram creates nothing until approved, and waits in a row at the top of the Library. A taken name offers "Keep both as {name}".
- **Consent**: the tool is for explicit requests (prompt fragment). "Ask the tutor" in the header only fills the composer with `@name Propose changes to this diagram: `, and sends nothing. The tool refuses while a question waits or a problem is active, and has its own switch, Settings → Agent → Diagrams, on by default as absent keys are.
- A deleted session's proposals stay and lose their link, as its pages do (the 009 exception's reasoning; see Report for the owner).

### Dependencies
None added. `@xyflow/react` was installed already and moves from the demo-kit bundle to also load on demand here.

## User stories

1. **Make one (P1).** New diagram, one of three forms, a name. It sits in the Library with folders, tags, favorites, trash, recent and search.
2. **Edit without a pointer (P1).** Add, label, connect, move, undo, all by keyboard, on canvas or list.
3. **Never lose it (P1).** Autosave with honest states, History and Restore, survives reload.
4. **Take it elsewhere (P2).** SVG, PNG, JSON.
5. **Connect it (P2).** Link nodes or the whole diagram to notes, lessons and ideas; see them in Links.
6. **Let the tutor propose (P2).** See what would change, then Approve, Reject or Edit first.

## Requirements

- **FR-001** Diagrams never appear in the catalog's `items` on disk; a catalog with none is byte-shaped as before.
- **FR-002** Versions append only; a torn last line is not a version; a newer schema is refused and unchanged.
- **FR-003** `@` references and full-text search read an outline of labels. A newer-schema diagram reads as "unsupported" with the reason, never as searched.
- **FR-004** React Flow loads only when a canvas shows. No initial route carries it.
- **FR-005** Every node and edge is reachable and editable by keyboard; adding either needs no pointer.
- **FR-006** SVG output escapes learner text and writes no script, link or style.
- **FR-007** Nothing changes a diagram from a proposal but Approve.
- **FR-008** No diagram action changes a byte under `graph/`.
- **FR-009** Every read and write is tenant-scoped; another tenant's ids answer 404.

## Accessibility criteria

Keyboard: Tab reaches nodes and edges; Enter or F2 edits; arrows move a node 20 px; Delete removes; focus selects, so Link, Delete and Connect act on it. Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Y, and buttons. Escape: field, then pen or Connect, then full screen, then the pane. Changes are announced in a live region. A text outline lists the graph. Touch: pan and pinch are React Flow's; handles and tools are 44 px on coarse pointers. Freehand has no keyboard path: sticky notes are its alternative, and a stroke can be removed by keyboard. Focus is a 2 px ring on nodes.

## Success criteria

`tests/diagrams.test.ts`, `tests/render-diagrams.test.tsx` and `scripts/check-diagrams-ui.mjs` pass at 1440, 390 and 320; initial JS stays under the 5% ceiling.
