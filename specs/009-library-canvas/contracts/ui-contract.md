# Contract: interface (draft for DESIGN.md, pending owner approval)

Strings and layout defaults here are proposals. There is no design canvas for this feature (plan owner decision 3). All surfaces use Study ink tokens: 6 px controls, 10 px cards, type scale 13/15/17/22/30/40, no structural lines, no opacity on text, hidden scrollbars, 44 px on coarse pointers. No amber except keyboard focus and the primary action.

## Sidebar

One labelled row, "Library" (`LibraryIcon`, 15 px), under the header's Search and New, above the date shelves. Links to `/library`. `aria-current="page"` there.

## Library view (`/library`)

One column, `max-w-[52rem]` like Home, top bar shared.

- Title "Library" (title serif, 30 px). Actions: primary-free "Upload" (raised-2) and "New page" (raised-2).
- Search field "Search your Library", filtering names on the client.
- Rows: raised, 10 px. Name at 15 px, wrapping. Meta line: `{Kind} · {size} · {date}`, plus "Made by the agent" or "No text could be read" when true. Actions with full names: "Open {name}" by clicking the row, "Rename {name}", "Delete {name}".
- Upload: file picker and drop on the page. A row per upload in flight with a percent. Refusals name the file and the reason and stay until dismissed.
- Name clash dialog: "{name} is already in your Library." Actions "Keep both as {suggested}" and "Cancel".
- Delete dialog follows `components/delete-session-dialog.tsx`: "Delete {name}?" and, for a page, "Its whole version history goes too." Name in the interface font.
- Empty: "Nothing here yet. Upload a document or start a page." Loading: row skeletons. Failed: "Your Library could not be loaded." and Try again. A failed refresh keeps the list.
- Open: pages open in the pane. Markdown, text, code and CSV open read-only in the pane with "This is your original; it can't be edited here." PDF and images open in a new tab. Over 1 MiB of text: "Too long to preview" and Download.

## @ menu

Opens above the field, inside the prompt shell's width. Raised-2, 10 px, no border, up to 6 rows scrolling with hidden tracks.

- Row: name, then `{Kind} · {size}` in meta. Coarse rows at least 44 px.
- The textarea gets `role="combobox"`, `aria-expanded`, `aria-controls` and `aria-activedescendant`. List is `role="listbox"`.
- Up and Down move, Enter or Tab insert `@name ` at the token and keep focus, Escape closes the list only (handled before the field's own Escape, with `stopPropagation`). Clicking keeps focus in the field.
- No match: one row "Nothing matched" with `role="status"`. Enter then does the field's normal action, Tab inserts nothing, and the text stays, until an arrow reaches "New page". A space after a query with no match closes the list.
- "New page" (owner, 2026-10-31): always the last option, under any status line, in every field. Same row styling, name only; the active treatment is the only amber. Enter, Tab or a click creates a blank page with the default name ("Untitled page", a clash stepping as in the Library), opens it in the pane and inserts `@name ` at the token, keeping focus. It sends nothing and calls no model. With matches the arrows cycle through it; with none, nothing is active until an arrow reaches it, and another steps off. Where no pane is on screen (Home, `/chat/new`), the page opens with the next screen that has one, per plan default 4. A failed create shows "New page · {reason}" under the field with `role="alert"`, keeps the draft and the list, and clears on the next edit or a successful create.
- Library empty: "Your Library is empty." Loading: "Loading your Library…". Failed: "Your Library could not be loaded." The draft is untouched in all cases.
- Fields: `components/composer.tsx` (chat, Home, new session), the two textareas in `components/question-dock.tsx`, the one in `components/practice-dock.tsx`. Each passes its value, setter and ref to `useLibraryMention`, whose key handler runs first and returns whether it took the key. Existing Enter behavior and refs such as `thinkingRef` do not change.

Pre-send line: when the parsed text has references, one muted 13 px line in the answer well: "Attaching {name}, {name}". Only names, since the mode is decided at send.

## Sent label

`components/library/references-card.tsx`, one quiet row per reference on the reading edge, above the learner's text or in the answer card. Always visible, not collapsed (SC-003). 13 px, `ink-2`, with the name in foreground; clicking opens the item.

| Mode, reason | Text |
|--------------|------|
| `inline` | "Used {name} · in full" |
| `outline`, `too-long` | "Used {name} · outline only, too long to send whole" |
| `outline`, `message-limit` | "Used {name} · outline only, too much attached at once" |
| `outline`, `no-room` | "Used {name} · outline only, not enough room in this session" |
| `outline`, `not-ready` | "Used {name} · not read yet, the agent can open it" |
| `image` | "Used {name} · image, the agent can ask the vision model about it" |
| `unreadable`, `no-vision` | "{name} · no vision model set" with a link to Settings → Agent |
| `unreadable`, `no-text` | "{name} · no text could be read" |
| `unreadable`, `unsupported` | "{name} · this kind of file can't be read" |
| `missing`, `over-count` | "{name} · not attached, limit is 8 per message" |
| `missing` | "{name} · no longer in your Library" |

A current Library list, fetched only when a transcript has references, adds " · no longer in your Library" to older labels of deleted items. If that fetch fails, the label stays as sent.

## Page pane

`components/workspace-pane.tsx` holds the resize handle, saved width and close, extracted from `components/artifacts/demo-panel.tsx`. `DemoPanel` keeps its `data-demo-slot`, iframe rules and `lh-demo-panel-width`. The pane shows a demo or a page, and the most recent explicit open wins. The one live iframe stays mounted. A question's automatic demo open does not replace an open page; the existing "Using {title}" link stays.

- Header (52 px): page name (click to rename), save state, History, close. Save state, muted: "Saved", "Saving…", "Draft saved", "Not saved. Your text is kept in this browser." and Try again.
- Body: one rich-text editing surface at reading size (TipTap, owner 2026-10-30), with formatted text and rendered math in place; no separate preview pane.
- Cmd/Ctrl+S saves a version. Escape returns focus to the transcript on desktop, and closes the layer on phones.
- Conflict line above the editor: "This page changed elsewhere. Your text is safe here." Actions "Keep mine" and "Use latest".
- Agent update on a clean page: "Updated by the agent · version {n}" for 4 s, with the live region announcing it.
- History: list of `Version {n} · {You | Agent} · {time}`, a read-only preview, and "Restore this version".
- Below 768 px: a full-screen layer with focus contained, and "Back to chat" in the header. Keyboard-safe via `visualViewport`. The composer's draft stays mounted underneath.
- Page state is kept in `sessionStateStore`, so reload reopens it.

## Transcript rows

Math-check skeleton on the reading edge, no amber:

- "Page · created {name}"
- "Page · revised {name} · version {n}", expanded showing "Saved your edits first as version {m}" when true, plus Open and History
- "Page · couldn't revise, it changed" and "Page · failed" in destructive ink with the reason in a sentence
- "Library · read {name}" and "Library · failed"
- Running: spinner and the activity label only. Inputs are never shown live.

## Settings → Agent

"Pages" after Papers, hint "Creates and revises pages you can edit beside the lesson", accessible name "tool pages".

## Settings changes (findings 5-14)

| # | Finding | Change | Files |
|---|---------|--------|-------|
| 5 | Search covers category names only | Index, results under category headings, row jump. Placeholder stays "Search settings"; accessible name becomes "Search settings". | `settings-dialog-content.tsx`, `settings-index.ts` |
| 6 | Type off scale | Section title 22 px serif, group titles 17 px serif | `controls.tsx:34,54` |
| 7 | Radii off spec | 6 px controls, 10 px cards; dialog frame 10 px | `controls.tsx`, `agent-section.tsx`, `appearance-section.tsx`, `chatgpt-connection.tsx`, `connection-dialog.tsx`, `keyboard-section.tsx`, `keys-section.tsx`, `model-menu.tsx`, `settings-dialog-content.tsx`, `subscription-connections.tsx` |
| 8 | Row separator | Remove `border-b` and `last:border-b-0`, rely on spacing | `connection-controls.tsx:8` |
| 9 | Touch floor | Add coarse-pointer 44 px to `h-7`, `h-9` and `size="xs"` controls, without changing fine-pointer sizes | `keys-section.tsx:114,460`, `controls.tsx`, `chatgpt-connection.tsx`, `model-menu.tsx`, `update-settings.tsx`, `subscription-connections.tsx`, `connection-controls.tsx`, `agent-section.tsx`, `appearance-section.tsx` |
| 10 | Opacity on rows | Muted ink token on label and hint, locked control, no opacity. Comment updated with the 2026-10-30 ruling | `controls.tsx:8,79`, `ui/field.tsx:118,133` (scoped so non-Settings uses are checked), `graph-display-section.tsx:123,277`, `keys-section.tsx:397`, `agent-section.tsx:516`, `toggle.tsx` disabled state |
| 11 | Raw errors | Section names in words: "Your Agent settings could not be saved." Raw detail behind "Show details", with Try again re-running the save | `settings-dialog-content.tsx:223,317` |
| 12 | Dead-end load | Section skeleton while loading; "Settings could not be loaded." with Try again that refetches | `settings-dialog-content.tsx:176,326,330` |
| 13 | Files rows | Closed by removing the section; the Library has named buttons, progress, and a per-file limit | `files-section.tsx` removed |
| 14 | Stale comment | Rewritten: scrollbars are hidden globally, the lock still stops scrolling | `settings-dialog-content.tsx:132,306` |

Also removed: the `files` section, `FolderIcon`, the `hosted` gating in `SECTIONS.filter` where only Files used it. `SettingsDialogProvider` keeps `hosted` only if something else reads it.
