# Feature 023: Integration polish

**Branch**: `feat/023-integration-polish`, from `feat/022-diagrams`
**Status**: implemented, not merged or deployed

**Input (owner)**: "a seamless, reliable workspace connecting learning, documents, notes, practice and knowledge." "Verify Electron and hosted tenant isolation; run typecheck, lint, tests and build. Limit test downloads and disk use. Document decisions and report verified results and risks." And from the goal: "require review before AI edits learner text".

## Clarifications

The owner approved every recommended option and asked for no questions (ROADMAP standing rules). Each decision below was made under that approval. **The owner has not seen any of them.** The ones he may want to change are collected in [docs/workspace-decisions.md](../../docs/workspace-decisions.md).

### What is held

- **Held**: `page_revise` in a turn whose message is a Simpler, Rewrite or Expand from selected text, whether sent beside the page or from the Library through `/chat/new`. Also a steer during that turn.
- **Held**: `page_revise` on any page that already has an edit waiting, in any turn. Otherwise "make it shorter" after a Rewrite would move the head and strand the first proposal.
- **How the turn is known**: code, not the prompt. `isHeldEditTurn` looks back through the running turn's messages for the action's own wording, and `tests/page-proposals.test.ts` pins that against `tutorMessage`. Those messages are unchanged, approved wording. A typed message in exactly those words also holds, which is the safe direction.
- **Still lands directly, under the 009 ruling** ("It edits directly, as a restorable version"): `page_revise` in an ordinary turn the learner didn't start from a selection, such as "tidy that page". His draft is saved first, and the 010 review bar and Undo follow. That is reviewed after, not before. Why it stays: the newer goal's words were about learner-triggered actions on learner text, the older ruling is explicit, and a lesson-long agent keeping a study page up to date would otherwise pile up proposals. **This is the first question in docs/workspace-decisions.md.** Changing it is one line: make `turnHolds` return true.
- `page_create` makes a new page, so it touches no learner text and isn't held.
- With the tool's `held` context absent, as in tests or another caller, `page_revise` works as it did. Its arguments and its other outcomes are unchanged. The one new outcome is `proposed`.

### What Accept does

- A held edit stores the whole wanted text and the text it was made from, under `library/page-proposals/<pageId>/<id>.json`. Nothing goes in the catalog, the versions or the draft.
- **Moved on, refused**: the head isn't the version the tutor changed. The page, draft and proposal all stay. The review says so and offers Copy the proposed text and Reject. There is no attempt to re-apply over another version, since he hasn't compared it.
- **Typing on the same lines, refused**: same treatment. Same or directly neighbouring lines count, and so does typing on both sides of the change, since only one changed region each is compared. It refuses rather than guesses.
- **Typing elsewhere, kept**: the comparison shows what Accept would do to the text he has now, with his typing in it. Accept saves his draft as his own version, then makes one AI-authored version with both.
- **Compared-against moved, refused**: Accept sends the head and draft revision it compared. A difference reloads the comparison and changes nothing.
- The AI version has author `agent`, cause `proposal-approved`, `proposalId`, the chat if it still exists, and `editedByLearner` after Edit first. The cause is shared with diagrams. It isn't an unseen tutor version, so the 010 bar doesn't ask him to review it twice. History labels it "Accepted from the tutor" and can restore what came before.
- Two proposals can wait on a page. Accepting one moves the head, so the other then refuses. Nothing merges them.

### Other decisions

- **Edit first** uses the page editor in full screen, as diagrams do, and changes only the proposal.
- **Reject** has no confirmation: nothing of the learner's goes away.
- **Where it shows**: a line beside the open page, the transcript row's Review, and a line in the Library for pages not open, since a proposal can outlive its session. Home's "Waiting for you" doesn't list it: left out.
- **Deleting a session** keeps its proposals and drops their link, as 022 does. That is an exception candidate for constitution III, listed for the owner.
- **Deleting a page for good** removes its proposals. Trash keeps them, and they refuse while the page is away.
- **PDF keyboard path**: a Select text button in the reader's toolbar. It puts a real selection on the first word of the page in view. Arrows move a word or line, Shift extends, Enter goes to the actions, Escape stops. Off the end of a page moves to the next page's first word; Shift stops at the edge, as a pointer's selection stays on one page. Word by word and pure, in `components/library/pdf-keyboard-selection.ts`.
- **Phone context view**: the right-pane toggle shows on phones when no page or demo holds the layer, and opens the context view as a full-screen layer. It is never saved, so a desktop choice can't cover a phone's page on load.
- **Trace fix**: `clerkConfigured` moves to its own file so `proxy.ts` doesn't import `config.ts`. The standalone no longer carries `data/`. The refusal stays.
- **`CLERK_JWT_KEY`**: an optional pass-through in `proxy.ts` to Clerk's own `jwtKey` option, unset in the image. It lets the tenant regression run the real middleware offline. A production change only if someone sets it.
- **Electron harness**: `scripts/electron-headless-entry.cjs`, never shipped, skips `BrowserWindow.show`, which segfaults under `--headless`, and names a Resources folder.

## Scope

### User stories

1. **Review before an AI edit (P1).** He selects text and clicks Rewrite. The tutor's edit waits. He reads a comparison, then accepts, rejects or edits it first. Until he accepts, his page and draft are as he left them.
2. **Select in a PDF by keyboard (P1).** He reaches the same bubble and actions as a pointer, with no mouse.
3. **The slices meet (P2).** Session Notes on phones, Make flashcards from an open page, Create page from a diagram's dangling link.
4. **Isolation is shown (P1).** Two tenants through the real proxy reach nothing of each other's, and no tenant is refused.
5. **The desktop build works (P1).** A real `data/` folder no longer blocks it, and a real Electron window opens on the shipped server.
6. **The suite is reliable (P2).** The sign-in flake is explained and fixed.

### Contracts

| Route | Answers |
| --- | --- |
| `GET /api/library/page-proposals?page=` | Pending rows, without their texts |
| `GET /api/library/page-proposals/:id` | `{ proposal, current: { text, name, expected, merged, moved } or null }`; 404 |
| `PUT /api/library/page-proposals/:id` `{ text }` | Edit first; 400, 404, 409 `resolved`, 413 |
| `POST /api/library/page-proposals/:id/reject` | 200; 404, 409 `resolved` |
| `POST /api/library/page-proposals/:id/accept` `{ expected: { head, rev } }` | 201 with item and version; 400 `expected_required`; 409 `moved`, `overlap`, `stale`, `resolved`; 404; 413 |

`page_revise` held result: text `Held for his review: nothing on {name} changed. It waits for him to accept, reject or edit it first, so say it is waiting for him and never call it done.`, details `{ outcome: "proposed", proposalId, itemId, name, target: "page" }`.

### Accessibility criteria

- Review opens from the keyboard, traps focus, and returns it to Review, or to the page when the row is gone. Escape takes the editor's list, then Edit first, then the dialog, and never the page behind.
- Added and removed carry words. Decisions are announced in a status line.
- Select text is reachable by Tab, its state is `aria-pressed`, the region keeps a visible focus ring, the selected words are announced in a status line, and focus never falls to the body when the bubble goes.
- 44px coarse targets, 320, 390 and 1440, no visible scrollbars, reduced motion, each exercised in the browser checks.

### Rollback

See plan.md, Rollback.

### Success criteria

- SC-001: no path from Simpler, Rewrite or Expand changes a page's head or draft before Accept.
- SC-002: a refused Accept leaves page, draft and proposal byte for byte.
- SC-003: every select, highlight and tutor action in the PDF bubble can be reached with no pointer.
- SC-004: no tenant is refused on every route method; another tenant's ids yield no success and none of its text.
- SC-005: a build from a repo with a real `data/` passes `build-server.mjs` and carries none of it.
- SC-006: a pre-011 catalog keeps its ids, versions, old names, `@` references and catalog version through every feature.
- SC-007: golden fixtures unchanged; initial JS within 5% of pre-014.
