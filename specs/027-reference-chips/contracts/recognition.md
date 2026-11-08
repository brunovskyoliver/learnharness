# Contract: recognising references (027)

Pure functions in `src/core/library-refs.ts` and `src/core/document-anchors.ts`. Test file: `tests/reference-spans.test.ts`.

## referenceSpans(text, entries) → ReferenceSpan[]

- Same rules as `parseReferences` today: boundary before `@`; skip `codeRanges(text)` and `<library_passage …>…</library_passage>`; longest name first; live name > old name > tombstone; next character after the name not `\p{L}` or `\p{N}`.
- Offsets index the raw (un-normalised) text.
- Names may contain `/` (feature 026: a mirrored item's @ name is `{linked folder}/{repo path}`). Nothing special: the names come from `nameTable` (which offers 026's path and old paths), and the boundary rule checks only the character after the whole name. Fixtures: `@Lecture notes/week1/notes.md` and `@Lecture notes/week2/notes.md` resolve to two items; with a page named "Lecture notes" also present, the path still wins (longest first); an old path after a linked-folder rename still resolves; a removed entry (tombstone with `removedBecause`) resolves as the server does.
- Invariant: `uniqueById(referenceSpans(t, e).map(s => s.entry))` deep-equals `parseReferences(t, e)` for every fixture in `tests/library-refs.test.ts` and the SC-001 draft set.

## referenceForms(text, spans) → ReferenceForm[]

Page form, for a span `@name` at `[s, e)`:

```
<anything on the line> @name<tail ending in ":">\n
\n
> line\n          (one or more lines that start with ">")
> line
```

- `tail` is the rest of the line after the name and must end with `:` (covers ":" and every TAIL in `page-tutor-actions.ts`).
- `range` = `[s, end of the last ">" line)`. `quote` = the lines with `/^> ?/` removed, joined by `\n`.

PDF form:

```
<anything> @name, page N<tail ending in ":">\n
\n
<library_passage item="ID" page="N">\n…\n</library_passage>
```

- The passage's `item` must equal the span's entry id and its `page` must equal N; otherwise the span is a whole-item chip and the passage a separate passage-only chip.
- `range` = `[s, end of "</library_passage>")`. `quote` = the body, unescaped.

Passage-only: a `<library_passage>` not claimed by a PDF form becomes a form with `passageOnly: true`, its range the block.

Not forms: a quote block that doesn't directly follow (one blank line) the line ending in `:`; a span that isn't the last reference on its line; anything in code.

## chipMarkdown(markdown, catalog) → string (tutor replies only)

- For each span from `referenceSpans(markdown, catalog)` not inside a Markdown link's `[label]` or `(address)`, an autolink `<…>`, or raw HTML: replace `@name` by `[@name](/library?item=ID "lh-ref")`, with `[`, `]`, `\` in the label backslash-escaped.
- Leaves every other character as is. Idempotent (a second run changes nothing).

## parseLibraryHref(href) → { itemId, page?, quote? } | null

- Path must be `/library` (an absolute same-origin URL is accepted, as in `parseCitationHref`). `item` required; `page` an integer ≥ 1 when present, else ignored; `quote` optional.
- `parseCitationHref` keeps requiring `page`.

## Byte identity (SC-001)

`tests/reference-chips-bytes.test.ts` sends a fixed draft set through the composer's value path with chips on and off and compares the request bodies: names with spaces and punctuation, a prefix name, a mirrored path name with `/`, every selection action on a page and a PDF, references in inline and fenced code, an `@nobody`, eight-plus references, a repeated reference. 0 differences.
