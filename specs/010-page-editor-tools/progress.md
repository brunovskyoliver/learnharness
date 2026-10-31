# Progress: Page editor tools (010)

## Decisions (owner)

All recorded in spec.md Clarifications, 2026-10-31:
- tutor actions send to the chat beside the page;
- images are Library items;
- undo reverts only the tutor's blocks;
- in the Library view, tutor actions start a new session;
- highlights show on the next open, and clear on Done or close;
- no practice question in the slash menu;
- the toolbar's Ask the tutor quotes the caret's block when nothing is selected.

Plan and strings were approved on 2026-10-31.

## Decisions (agent, reversible, within the approved plan; listed for the owner)

1. **Tutor actions on a phone**: after a tutor action the phone layer closes, because it covers the chat the answer arrives in.
2. **Ask… from the Library**: opens `/chat/new` with the message as a draft, which nothing sends. Explain, Simpler and Quiz me use `/chat/new?send=`, which sends once through the New session page's own checks: models, keys and setup. With nothing configured, the setup dialog opens with the message kept.
3. **Busy chat**: while a turn is running or the chat is compacting, the actions show "The tutor is still answering." The approved plan makes them unavailable rather than steering the running turn.
4. **Singular strings**: one item reads "1 place you also edited was left as it is.", "1 word" and "1 unchanged block". These are the singular forms of the approved plural strings.
5. **Image alt text field**: labelled "Alt text" (new). It appears when an image is selected, under the image.
6. **Image placement**: an inserted image goes in a paragraph of its own after the block holding the caret, and the caret moves after it.
7. **Outline layout**: a column when the pane is at least 720 px wide, otherwise a list above the text. The contract said "below 768 px a menu"; the pane's own width decides here, because a desktop pane is often narrower than 720 px.
8. **Phone header**: below 768 px, Outline, Export and History show as icons, keeping their accessible names, so the header fits one line.
9. **Selection bubble position**: above the selection, flipping below when there is no room (floating-ui's default flip).
10. **Codec fix**: an edited table no longer adds an extra blank line around itself.
11. **Shortcut clashes**: Ctrl/Cmd+B and Ctrl/Cmd+K are also the app's sidebar and model-selector shortcuts. Inside the page editor the editor handles them first, as the global handler skips handled keys, so they format and link there and keep working everywhere else.

## Verification

Final gates, 2026-10-31:
- `npm test`: 3408 tests, 3380 pass, 5 fail, 23 skipped. The 5 failures are tests/tokens-headless (4) and tests/subscription-auth (1), which fail the same way on af12eac.
- eslint and tsc are clean; `npm run build` passes.
- `LH_UI_PAGES_ONLY=1 node scripts/check-library-ui.mjs`: 37 PASS lines. These cover the feature 009 page checks at three widths, the 009 fix checks and every 010 check, including outline, export and images. The 009 History step now picks Full text, since History opens on Changes.

- Unit tests:
  - `tests/page-tools-ui.test.ts`: slash, links, names, History, outline, word count, export, images.
  - `tests/page-tutor-messages.test.ts`
  - `tests/page-blocks.test.ts`
  - `tests/page-names-seen.test.ts`
  - `tests/page-editor-roundtrip.test.ts`: link, table and image edits change only their blocks.
- Browser: `LH_UI_TOOLS_ONLY=1 node scripts/check-library-ui.mjs`.
  - `checkEditorTools` at 1440, 390 and 320 px.
  - `checkTutorActions`, `checkTutorChanges` (with History), `checkOutlineExport` and `checkPageImages` at 1440 and 390 px.
  - Run in headless Chromium 1243 with `--no-sandbox`. Sends are intercepted; no model ran.
- Not done here:
  - the `impeccable` and `web-design-guidelines` skills, which are not installed in this environment. The screens were reviewed by eye from screenshots instead.
  - the startup performance budget. All new code is in the lazily loaded editor chunk, plus `components/chat-actions-context.ts` (one `createContext`), which `chat.tsx` already loaded.
