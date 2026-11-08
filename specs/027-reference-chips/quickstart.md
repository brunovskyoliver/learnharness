# Quickstart: validating reference chips (027)

Runs without model requests. Details live in [contracts/ui-contract.md](contracts/ui-contract.md) and [contracts/recognition.md](contracts/recognition.md).

## Prerequisites

- `npm ci`, `npm run demo-kit`.
- Isolated data: `export LH_DATA_DIR=$(mktemp -d)`; snap Chromium needs `TMPDIR` under `$HOME` for headless runs.
- Seed (the e2e helper does this): a page "Untitled note" with three paragraphs; a page "Untitled note 2" (prefix case); a 6-page PDF "Notes.pdf"; a Markdown, text, code, CSV, image, diagram and "other" item; one item moved to the trash; one tombstone; a feature-026 mirrored item `Lecture notes/week1/notes.md` and a mirrored entry removed upstream; a lesson whose transcript holds: a sent `@Untitled note`, a sent "About this part of @Untitled note:" with a quote, a sent PDF passage from page 4, a sent message with all nine kinds, a sent message with `@Notes.pdf` inside inline and fenced code, and a tutor reply with `[Notes.pdf, p. 3](/library?item=…&page=3&quote=…)` and `@Untitled note` in prose.

## 1. Pure rules

```bash
NODE_ENV=test npx tsx --test tests/reference-spans.test.ts tests/reference-forms.test.ts tests/chip-markdown.test.ts tests/library-href.test.ts tests/reference-chips-bytes.test.ts
```

Expected: spans agree with `parseReferences` on every fixture; forms recognise all nine page actions and five PDF actions; SC-001 byte set shows 0 differences.

## 2. Composer (US2)

`npx playwright test tests/e2e/study/reference-chips.spec.ts -g composer`

- Insert "Untitled note" from the @ list: one chip, caret after it (caret x within 1px of the chip's end).
- "Ask…" on a page selection and a PDF selection: one chip each; the page form shows its passage lines on the chip.
- Type, paste, Ctrl+Z / Ctrl+Shift+Z, and an IME composition (CDP `Input.imeSetComposition`) around chips: value sequence equals the same run with the overlay disabled.
- Backspace after a chip removes it in one step; one undo restores it.
- Reload: same chips. Send: request body equals the overlay-off body.
- Repeat at 320, 390, 1440, light and dark.

## 3. Sent messages and navigation (US1)

`npx playwright test tests/e2e/study/reference-chips.spec.ts -g "sent|back"`

- Each seeded chip opens `/library?item=…` full view at the right place for all nine kinds (SC-003); passage highlighted; page 4 for the PDF.
- Back pill and browser Back each return to the message with scroll within one line height and focus on the chip (SC-002). Forward reopens the item.
- Ctrl-click opens a new tab without the pill.
- Renamed item: current name. Trashed: opens Trash with the entry and Restore focused. Deleted: faint, not a link, "· no longer in your Library".
- Open another item and a folder, reload: pill still there; leave by the sidebar: gone.
- Reference rows: names open like chips; wording unchanged.
- Mirrored item: one chip over `@Lecture notes/week1/notes.md` showing "notes.md"; the removed one faint, not a link, "· Removed from the repo".
- The notebook links panel, a card source link and a pasted `/library?item=` address open the full view with no pill; a citation click inside a Library page still opens the side pane.
- Copy across a chip: clipboard has `@name` / the passage block.

## 4. Tutor replies (US3)

`npx playwright test tests/e2e/study/reference-chips.spec.ts -g tutor`

- Citation → chip with PDF icon, "Notes.pdf", "· p. 3"; click opens page 3 with "Quote found on page 3."
- `@Untitled note` in prose → chip; `@Notes.pdf` in code stays text.
- Streaming fixture (`scripts/check-streaming-ui.mjs` route interception): the line box heights around a reference are unchanged when it turns into a chip.

## 5. Gates

```bash
npm test && npm run lint && npm run typecheck && npm run build
node ~/agent-runs/2026-11-07-unified-redesign/startup-js/startup-js.mjs   # vs the adc0021 baseline: ≤ +5% gzip on /, /chat/new, /library
node scripts/check-library-ui.mjs && node scripts/check-transcript-scroll-ui.mjs && node scripts/check-documents-ui.mjs
```

Then the `impeccable` and `web-design-guidelines` checks on the composer, a transcript with chips, the full view and the pill, at 320, 390 and 1440, light and dark, with reduced motion on.
