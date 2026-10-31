# Features 016-018: Intelligent notes

**Branch**: `feat/016-intelligent-notes`, from `feat/014-workspace-navigation`
**Created**: 2026-10-31
**Status**: Implemented, not merged or deployed

**Input (owner)**: "Extend the existing Tiptap editor with [[wiki links]], backlinks, related notes, outlines, callouts, math/code and collapsible sections. Save highlighted lesson passages with source references; turn lessons into study notes. Add contextual AI actions (explain, summarize, rewrite, challenge, expand, generate questions). Connect notes to sessions and knowledge graph. Preserve Markdown, autosave and history; require review before AI edits learner text."

The three roadmap features share these documents. Outlines, math and code already exist from feature 010: `PageOutline` and `pageStats`, `PageInlineMath` and `PageBlockMath`, fenced code. They were reused unchanged, and the round-trip corpus still covers them.

## Clarifications

The owner approved every recommended option and asked for no questions (ROADMAP standing rules). Each decision below was made under that approval.

### Links
- **Stored form**: `[[Page name]]`, exactly as written. A rename never rewrites a linking page.
- **Identity**: a link resolves to an item id. Order: a pin for this page, the current name, an old name (`previousNames`), a deleted item's name, otherwise dangling.
- **A new page taking an old name**: at rename time the store pins the links already written against the old name, per page, in `library/wiki-pins.json`. Those keep meaning the renamed item. Without this, `@` rules would hand them to the new page.
- **Display**: the link shows the item's current name. The stored text keeps what was written, and the Links panel shows "Written as {old}".
- **Dangling**: shown in muted ink with a dotted underline and named in words. Following it says "Nothing in your Library is called {name} yet." with Create page. A deleted target says so and is kept. A dangling link is never removed or rewritten.
- **Targets**: any Library item. Documents open as the Library opens them.
- **No aliases**: `[[a|b]]` stays literal text. A target can't hold `[`, `]`, `|` or a line break, so a page with such a name isn't offered in the list.

### Where backlinks show
- The page holds the right pane (feature 014: a page or demo takes the column), so the context view can't show while a page is open. Backlinks live in that same pane, behind a **Links** toggle in the page's header, built in `components/workspace/note-connections.tsx`. They work the same in the phone layer.
- The session's context view gains **Notes**: the session's pages, and the study-notes action.

### Related notes
Deterministic, with fixed weights: shared tag 3, shared link target 2, same source session 2, same folder 1, each rare shared word 1 (at most 3). Below 2 is noise. Pages already linked directly stay out, because they are listed as links. Each row says why.

### Markdown forms
- **Callout**: GitHub's alert form, `> [!NOTE] Optional title` over quoted lines. Kinds: NOTE, TIP, IMPORTANT, WARNING, CAUTION, any case. An unknown kind stays a quote. A plain viewer reads a quote.
- **Collapsible section**: `<details>` then `<summary>Title</summary>` on their own lines, a blank line, the body, a blank line, `</details>`. Open is `<details open>`. Another spelling of `<details>` stays raw source, as it always did. A plain viewer folds it the same way, or shows the text.
- **Open state is stored**, so it survives a reload. A toggle is an edit: it autosaves and shows in History.

### Source references
- A passage is stored as a quote ending in `[Lesson: {title}](/chat/{chatId}#message-{messageId})`: a plain Markdown link, so it survives export and reads in any viewer.
- Teacher prose only, because that is what has a message id. The title comes from the session on the server, never from the client. A selection spanning messages cites the first.
- A deleted session keeps the text, by the owner's request (this goes beyond the constitution's "removes its traces" exception for agent-made pages; see plan.md). The link stays and a decoration says the source is gone.
- A passage is the learner's own act, so it is his version (cause `passage`), with his draft committed first.

### Study notes
- **First form: a deterministic extract, with no model call.** The lesson's assistant prose in order, each followed by its source link. It costs nothing, so no cost path applies. A model-written summary is left for later; Summarize in the bubble covers it for now, through the tutor.
- It reads only prose already delivered. Tool calls, thinking and question payloads are never read, so an answer not yet seen can't reach a page this way. Failed and aborted generations are skipped.
- Lessons only: practice is refused with a sentence, and the action isn't offered there.
- Named `Study notes: {title}`, stepping past a taken name.

### Sessions and the graph
- A page's sessions: its source links, the chats its versions name, and an agent-made page's origin. A session's pages are the same relation read the other way. An `@` reference in a message is not counted, since finding those means reading every transcript.
- The graph is read only: propositions from the cited sessions first, then those sharing at least two words with the note, at most 8. Nothing writes to any ledger, and a note is never evidence (constitution II).

### AI actions
- The bubble's order: Explain, Simpler, Summarize, Rewrite, Expand, Challenge, Quiz me on this, Generate questions, Ask…
- **Edits** (Simpler, Rewrite, Expand) ask for a change "in the page". That goes through `page_revise`, so it's a tutor version with the change bar and Undo, the draft saved first. **Answers** (Explain, Summarize, Challenge, Quiz me, Generate questions) stay in chat.
- Each sends at once on the click, as Explain does (feature 010), and Ask… only fills the composer. Unavailable states are unchanged.
- Generate questions and Challenge ask for graded checks, so they use the existing quiz mechanics, and the teacher prompt keeps questions and answers out of pages.
- "Review" is feature 010's: the version lands, then the learner reviews and can undo. Nothing is held back as a pending proposal.

### Dependencies
None added. `@tiptap/extension-details` was not used: the custom nodes need a byte-exact Markdown form anyway, and `Collapsible` is about 100 lines.

## User stories

1. **Link notes (016, P1).** Typing `[[` lists pages; choosing one links it. The link follows renames, a dangling one is honest, and the target's Links panel shows the backlink.
2. **Structure notes (016, P1).** `/callout` and `/collapsible` make blocks that survive a reload and read in any Markdown viewer.
3. **Keep what the lesson said (017, P1).** Select lesson text, save it to a page with a link back; following the link jumps to the message. Deleting the session keeps the text and says so.
4. **Lesson to notes (017, P2).** One click makes a page from the lesson's own prose.
5. **See connections (017, P2).** A page lists its lessons and related graph ideas; a session lists its pages.
6. **Ask about a passage (018, P1).** Six more actions on selected text; any change to the learner's text shows the review bar and can be undone.

## Requirements

- **FR-001** `[[name]]` is one atom; opening and saving unedited stores identical bytes, and an edit elsewhere keeps its bytes.
- **FR-002** The scanner the server uses agrees with the editor's parser on links in code, math, escapes and link-like forms (tested on the same cases).
- **FR-003** Backlinks, related notes and graph rows make no model call and are deterministic. Drafts count.
- **FR-004** Every read is tenant-scoped, with a test that one tenant's backlinks never include another's.
- **FR-005** Callouts and sections round trip, and escapes keep typed `[[x]]` and `[!NOTE]` literal.
- **FR-006** A saved passage is one new learner version; a draft is committed first; refusals change nothing.
- **FR-007** Study notes are created only by an explicit action.
- **FR-008** Notes write nothing to graph ledgers; golden fixtures are unchanged.
- **FR-009** Every AI change to page text goes through `page_revise`.
- **FR-010** The editor stays lazily loaded, and initial JS stays within 5% of feature 014's.

## Success criteria

- `tests/page-editor-roundtrip.test.ts` passes with the new corpus entries.
- `scripts/check-notes-ui.mjs` passes at 1440, 390 and 320; `LH_UI_PAGES_ONLY=1 scripts/check-library-ui.mjs` still passes.
