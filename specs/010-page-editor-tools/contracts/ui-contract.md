# UI contract: Page editor tools (010)

Look: the boards "Proposed page editor" and "Tutor edits and history" on https://claude.ai/artifact/NMvgNxmvrg2vHQ6bYwdn6z, in Study ink:
- surfaces: `surface-raised` for the toolbar row and bars, `surface-raised-2` for menus and the bubble;
- amber only for focus, the primary action (Done) and the selected row;
- Lucide icons at 16 px with a 1.75 stroke;
- 32 px controls, and 44 px on coarse pointers;
- hidden scrollbars.

Every string below is new. Anything not listed is unchanged from 009.

## Header
- Status line: `{SaveState} · {n} words`. Use `1 word` for one and `0 words` for none.
- New buttons beside History: `Outline` (toggle, `aria-pressed`) and `Export` (menu).
- Export menu: `Copy as Markdown` (it becomes `Copied` for 2 s), `Download .md`, `Print`.

## Toolbar (`role="toolbar"`, `aria-label="Formatting"`)
Names, in order, with the shortcut in the accessible name:
- `Undo (Ctrl Z)`, `Redo (Ctrl Shift Z)`;
- the text style menu: `Paragraph`, `Heading 1`, `Heading 2`, `Heading 3`;
- `Bold (Ctrl B)`, `Italic (Ctrl I)`, `Strikethrough (Ctrl Shift S)`, `Inline code (Ctrl E)`, `Link (Ctrl K)`;
- `Bulleted list (Ctrl Shift 8)`, `Numbered list (Ctrl Shift 7)`, `Checklist (Ctrl Shift 9)`, `Quote (Ctrl Shift B)`;
- `Formula (Ctrl Shift M)`, `Table`, `Image`;
- `Ask the tutor`.

On a Mac, "Ctrl" reads "⌘". The row wraps below 560 px.

## Placeholder
On an empty page, in `muted-foreground`: `Start writing, or type / for headings, lists, tables and formulas.`

## Slash menu (`role="listbox"`, `aria-label="Insert a block"`)
- Rows: `Heading 1`, `Heading 2`, `Heading 3`, `Bulleted list`, `Numbered list`, `Checklist`, `Quote`, `Code block`, `Formula block`, `Table`, `Image`, `Divider`.
- Empty filter: `No block matches "{query}"`.

## Link popover
- Fields and buttons: `Link address` (input, labelled, no placeholder), `Apply`, `Open link`, `Remove link`.
- Invalid address: `Enter a web address, like https://example.com.`

## Table controls (shown while the caret is in a table)
`Add row`, `Delete row`, `Add column`, `Delete column`, `Delete table`.

## Selection bubble (`role="toolbar"`, `aria-label="Selection"`)
- Buttons: `Bold`, `Italic`, `Link`, `Explain`, `Simpler`, `Quiz me on this`, `Ask…`.
- When unavailable, in place of the tutor buttons:
  - a question is waiting: `Answer the question in the chat first.`
  - a problem is active: `Finish or skip the problem first.`
  - a turn is running: `The tutor is still answering.`

## Messages sent (selection quoted as block quote lines)
- Explain: `Explain this part of @{page name}:\n\n> {selection}`
- Simpler: `Rewrite this part of @{page name} more simply, in the page:\n\n> {selection}`
- Quiz me on this: `Quiz me on this part of @{page name}:\n\n> {selection}`
- Ask… (composer only, caret at the end): `About this part of @{page name}:\n\n> {selection}\n\n`

## Tutor change bar
- `The tutor changed {n} place(s) · version {v}`; with several versions, `… · versions {a}–{b}`.
- Buttons: `Previous`, `Next`, `Undo the tutor's edit`, `Done` (primary).
- Removed text is shown struck through in `muted-foreground`, with a hidden `Removed:` prefix for screen readers.
- After Undo with blocks left alone: `{k} place(s) you also edited were left as they are.`
- Undo failed: `The tutor's edit could not be undone. Your text is kept.`

## History
- Row: `Version {n} · {You | Agent} · {time}`, then ` · {name}` when the version is named.
- View toggle: `Changes` (default), `Full text`.
- Changes header: `Version {n} compared with version {m}`. Version 1: `Version 1, the first version`.
- Rows show an `added` or `removed` label (mono, 12 px) before the block. Unchanged runs show `{k} unchanged block(s)`.
- Too long: `Too long to compare. Use Full text.`
- Buttons: `Restore this version` (existing), `Copy this version` (it becomes `Copied`), `Name this version` / `Rename`.
- Name field: label `Version name`, with `Save` and `Clear name`.
- Undo versions read `Version {n} · You · {time} · Undid the tutor's edit`.

## Outline
- Region `aria-label="Outline"`, with the title `On this page`, listing h1 to h3, indented by level. With no headings: `Headings appear here.`
- Below 768 px it is a menu from the `Outline` button.

## Images
- Uploading line: `Uploading {file name} · {percent}%`.
- Refusals reuse the Library's sentences. SVG: `{name} is a kind of file that can't be added to a page.`

## Print
Only the rendered page, with its name as the title. No app chrome.
