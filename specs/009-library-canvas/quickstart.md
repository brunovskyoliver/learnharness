# Quickstart: validating Library and canvas pages

## Prerequisites

- Dependencies installed. Isolated data: `LH_DATA_DIR=$(mktemp -d)`. Never point these checks at production data or the container.
- A browser for UI checks (research R13): a temporary `@sparticuz/chromium` outside the repo, and a wrapper script that adds `--no-sandbox`, exported as `CHROME_PATH`.

## Gates

```bash
npm test
npm run lint
npm run typecheck
npm run build
CHROME_PATH=<wrapper> node scripts/check-library-ui.mjs
```

Record failures that already exist on `main` separately. No test makes a model request.

## Scenarios

Run with `npm run dev`, then at 320, 390 and 1440 px. The stubbed model scenarios are covered by tests and the script.

| # | Do | Expect | Covers |
|---|----|--------|--------|
| 1 | Start with an empty Library. Upload a `.md`, reload. | Listed with name, kind, size and date. | US1.1 |
| 2 | Upload the same name. | Dialog; Cancel leaves one file; Keep both leaves two with original bytes unchanged. | US1.2 |
| 3 | Delete an item. | Dialog names the item first. | US1.3 |
| 4 | Stop the server, copy files into `<data>/files/`, start, open the Library. Compare checksums. | All listed; bytes identical; `read` in a hosted test still reads them. | US1.4, FR-003 |
| 5 | Upload an exact 50 MiB PDF, then one a byte over, then `.exe`, then an empty file. | First stored whole (checksum matches); others refused with reasons; nothing stored. | FR-015 |
| 6 | Upload a text-free PDF, reference it. | Row and label say no text could be read; item stays. | Edge case |
| 7 | Type `@wee` in the chat composer, Home, new session, a question's fields and a practice field. Keyboard only. | List filters; Enter and Tab insert; Escape closes only the list. | US2.1, FR-004 |
| 8 | Type `me@site.org`, `` `@x` `` and an IME composition. | No list. | Edge case |
| 9 | Type `@zzz`. | "Nothing matched"; text kept. | US2.4 |
| 10 | Send a short and a 40 KiB reference, in two sessions. | Labels read "in full" and "outline only"; no extra model call in the activity dock. | US2.2, FR-009, FR-014 |
| 11 | Delete a referenced item and view the old message. | "No longer in your Library". | US2.3 |
| 12 | Answer a quiz with a reference. | Grade and confidence unchanged; the label is on the answer card. | Edge case |
| 13 | Create a page, type, reload before the save shows. | Text survives. | US3.1, US3.2 |
| 14 | Restore an old version. | New version added; count grows by one. | US3.3 |
| 15 | At 390 px open a page. | Full-screen layer; Back to chat is one action; draft in composer kept. | US3.4 |
| 16 | Open a page in two tabs, edit both. | Second save shows the conflict line; both texts end up in history. | SC-002 |
| 17 | Stubbed agent creates a page, then revises it while unsaved text is open. | Row opens it; learner version first, then a refusal or agent version on the new head; no text lost. | US4.1-3 |
| 18 | Turn off Pages. | Tools are absent from the registry. | US4.4 |
| 19 | Reference an image with no vision slot set. | Label says so with a link; no model call. | FR-015 |
| 20 | Search Settings for "thinking" and "font". | Results under categories; choosing focuses the row. Failed load shows Try again. | US5, FR-017 |
| 21 | Grep and detector: `opacity-` in `components/settings`, `impeccable` detector. | None on text; clean. | FR-012 |

## Startup

Run `scripts/measure-session-performance.mjs` through `LH_BROWSER_URL` against the same browser, with `main` and with this branch, and compare to T003's numbers. `tests/startup-module-graph.test.ts` is the offline guard.
