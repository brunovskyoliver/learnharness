# Research: Page editor tools (010)

## R1 Toolbar, bubble and slash menu without new dependencies

- **Decision**:
  - **Bubble**: `BubbleMenu` from `@tiptap/react/menus`. It ships inside `@tiptap/react` 3.32.2, which is already a dependency, and positions with `@floating-ui/dom`, which is already installed through it and radix-ui.
  - **Slash menu**: a small ProseMirror plugin in the page editor, plus a list built like the @ list (components/library/mention-menu.tsx).
  - **Placeholder**: a node decoration on the empty document.
  - **Tables**: TableKit's commands, already loaded.
- **Rationale**: Constitution VIII and spec FR-018 ask for no new runtime dependency without approval. `@tiptap/suggestion` (slash menus) and `@tiptap/extensions` (Placeholder) are not direct dependencies. The slash menu needs one trigger, one query and one list, and the @ list already solves its keyboard model.
- **Alternatives**: `@tiptap/suggestion` (new dependency); `@tiptap/extensions` Placeholder (installed only as a transitive dependency, so declaring it would be new).

## R2 Shortcuts

- **Decision**: keep TipTap's StarterKit defaults:
  - Mod-B bold, Mod-I italic, Mod-Shift-S strikethrough, Mod-E code;
  - Mod-Alt-1…3 headings, Mod-Alt-0 paragraph;
  - Mod-Shift-7 numbered, Mod-Shift-8 bulleted, Mod-Shift-9 checklist;
  - Mod-Shift-B quote, Mod-Z undo, Mod-Shift-Z redo.
- **Added**: Mod-K link, and Mod-Shift-M formula (wraps the selection as inline TeX, or inserts an empty one and opens its source).
- **Rationale**: these are the defaults learners know from Docs and Notion; only link and formula need new bindings.

## R3 Comparing versions

- **Decision**: compare at the block level with a longest common subsequence over the top-level Markdown blocks. Use the page codec's existing lexer split (components/library/page-markdown.ts `createPageCodec`), which already keys untouched blocks by their bytes. Above 4,000 blocks on either side, show "Too long to compare." with Full text.
- **Rationale**: the spec fixes block granularity. Bytes per block match exactly what the codec keeps, so a block counts as unchanged exactly when its stored bytes are.
- **Alternatives**: a character diff library (new dependency; per-character view is out of scope).

## R4 Highlighting without changing bytes

- **Decision**: ProseMirror decorations. Node decorations mark top-level nodes whose serialized Markdown equals an `after` block. Widget decorations show removed blocks, struck through in muted ink, before the next kept block. Decorations live outside the document, so the codec's serializer never sees them.
- **Rationale**: SC-002 (identical bytes) holds by construction.

## R5 Tutor undo

- **Decision**: a pure function on Markdown text, `revertTutorChanges(current, changes) → { text, skipped }`, run in the browser. It is committed through the existing commit route with a new cause, `undo-agent`, so it is a learner version that History labels.
- **Rationale**: it can be tested in Node like page-draft.ts, and needs no new server write path.

## R6 Print

- **Decision**: `window.print()` with a print stylesheet. While printing, only a hidden print root is shown. It holds the page rendered by the existing read-only renderer (components/library/page-preview.tsx). This works in Electron and browsers.
- **Alternatives**: a PDF library (new dependency, out of scope).

## R7 Chat actions from the page

Pending the code trace (agent report). This decides how the pane sends a message and opens the composer.

## R8 Images

Pending the upload and content-route trace (same report).
