# Fix: Graph import reads a PDF's raw bytes as text

## Changes
- `src/server/notes-import-text.ts` (new): `notesImportText(file)` — plain text unchanged; PDFs (by name or `%PDF-` header) written to a 0600 temp file, read with `pdfExtract(path, "all")`, temp dir removed; refuses "This PDF has no text to read. It may be scanned images." when only page headers come back.
- `app/api/graph/import/route.ts`: uses `notesImportText` instead of `file.text()`.
- `components/home.tsx`: import picker accepts `.pdf`.

## Tests
- `tests/notes-import-text.test.ts` (5): PDF → page text with no raw PDF syntax; PDF under a `.txt` name; blank PDF refused; Markdown unchanged; route passes PDF text to the pipeline and refuses a blank PDF without calling it.

## Follow-ups (not chosen by the owner)
- Other binary files (e.g. .docx) are still read as text if forced through the picker.
- No confirmation above a chunk count; the auditor still runs on chunks with 0 propositions.
