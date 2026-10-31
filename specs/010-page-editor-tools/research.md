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

- **Beside a chat**:
  - The pane renders inside `ChatActionsContext` (components/chat.tsx:131, slot at :1746), so `useContext` gives the chat. In the Library view it gives `null`.
  - The context gains `fillComposer(text)`, which calls `applyText` and focuses the field, for Ask…. It also gains `blockedReason`, the same pending-question and active-problem state that `canSend` reads (chat.tsx:507, 517, 711).
  - Explain, Simpler and Quiz me use the existing `sendText`, guarded by `blockedReason`. Without the guard, a text sent while a question waits would quietly dismiss the question (src/core/input-events.ts:204).
  - While a turn is running, the actions are unavailable, as the composer's Send is.
- **Library view**: follow Home's path (components/home.tsx:103-134):
  - first the keys checks;
  - then `POST /api/chats`;
  - then `router.push("/chat/{id}?prompt=…")`, where `initialPrompt` sends it once.
  The open page persists across routes through `PagePaneProvider`, so it appears beside the new session.
- **Before sending**: pending editor text is handed over and committed (`controller.commit("save")`), so the @ reference resolves to the text on screen.
- **Message**: plain text with an @ reference, which the server resolves (src/core/library-refs.ts:117). The selection is quoted as Markdown block quote lines, never in backticks, since references inside code are ignored. Its exact wording is in contracts/ui-contract.md.
  - Known limit: an "@Name" inside the selected text can reference that item too.
- **Rejected**:
  - a new route that sends on the pane's behalf (it duplicates `send`, steer and setup handling);
  - sending to the latest session (owner chose a new session).

## R8 Images

- **Upload**: `sendFile` (components/library/upload.ts) already uploads with progress, but drops the created item on 201. It will return `{ status: "done", item }`.
- **Refusals**: a name clash takes the suggested free name automatically, since the learner chose an image, not a name. Too large or not an image shows the existing refusal sentence.
- **Link**: the page stores `![alt](/api/library/items/{id}/content)`. That route serves images inline with their real type, scoped to the tenant (src/server/library.ts:87-113), and returns 404 once the item is deleted, so the editor's image node shows the alt text instead.
- **SVG**: SVG is served as text/plain, so it is refused for pages with the unsupported-type sentence.
