# Quickstart validation: Page editor tools (010)

## Prerequisites

- `npm ci`
- `CHROME_PATH` pointing at a Chromium build. Running as root needs a wrapper that adds `--no-sandbox`.
- Keep `TMPDIR` short: Chromium refuses socket paths over about 100 characters.

## Automated

1. `npm test`. The new tests:
   - `tests/page-blocks.test.ts`: block comparison and tutor undo.
   - `tests/page-tools-ui.test.ts`: word count, outline and the slash filter.
   - `tests/page-names-seen.test.ts`: names and seen, on the store and routes.
   - `tests/page-tutor-messages.test.ts`: message texts and the blocked reasons.
   - `tests/page-editor-roundtrip.test.ts` extended: an image link, a link edit and a table edit change only their blocks.
2. `LH_UI_PAGES_ONLY=1 node scripts/check-library-ui.mjs`. The new `checkEditorTools` runs at 1440, 390 and 320 px.

## Manual scenarios (spec user stories)

1. **US1**: on a blank page, using only toolbar, slash menu and shortcuts, make a heading, bold text, a link (Ctrl K), a checklist, a 3 × 3 table plus a row, an inline formula and a quote. Reload: all are kept, and the stored text is Markdown.
2. **US2**:
   - In a chat, select a sentence and press Explain. A message quoting it, with the page referenced, is sent and answered.
   - Quiz me on this gives a graded check.
   - Ask… fills the composer only.
   - In the Library view, Explain opens a new session with the page beside it.
3. **US3**: with a scripted tutor revision of two places (tests seed it through `revisePageAsAgent`), check the highlights, Previous and Next, then type elsewhere and press Undo. Only those places revert, and History shows "Undid the tutor's edit".
4. **US4**: in History, Changes shows added and removed blocks. Name a version "Before exam" and reload: the name is kept.
5. **US5**: Outline jumps to each heading; the word count updates; Copy, Download and Print each produce the page.
6. **US6**: paste a PNG. The upload shows progress and the image appears. Delete the image item: the page shows its alt text.
