# Data model: Page editor tools (010)

Everything a page stores stays as it was in feature 009: Markdown versions in an append-only `versions.jsonl`, one text file per version, and a draft. This feature adds two small per-page files and no new kinds of item.

## Version name (new, learner-only)

- Stored at `pages/<id>/names.json` as `{ "<n>": "<name>" }`, beside the log, so `versions.jsonl` stays append-only.
- A name is 1–80 characters after trimming, with no line breaks. An empty name clears it.
- `listPageVersions` returns each version with an optional `name`.
- Setting a name adds no version, changes no text and emits `library-changed` without a version, so other tabs refresh History.
- The tutor has no tool for names (spec, Out of scope).

## Last seen version (new)

- Stored at `pages/<id>/seen.json` as `{ "version": <n>, "at": "<ISO time>" }`, per tenant.
- It is written when the learner presses Done on the tutor change bar, or closes the page (spec FR-010). Opening a page never writes it.
- **Missing file**: the page counts as seen up to its head when first read, so existing pages and newly created pages show no highlights.
- **Unseen tutor versions**: versions with `author: "agent"`, `cause: "agent-revise"` and `n > seen.version`. A `page_create` version is never highlighted.

## Tutor change set (derived, never stored)

For each unseen tutor version `v`, compare blocks between `text(v.base)` and `text(v)`:
- `before`: the blocks removed or replaced, as their Markdown bytes;
- `after`: the blocks added or the replacements, as their Markdown bytes;
- `version`: `v.n`.

Blocks are the top-level Markdown tokens the page codec already uses: paragraphs, headings, lists, tables, formulas, code and raw blocks. The comparison is a longest-common-subsequence over block bytes.

**Undo** applies each change in reverse to the current text, newest version first:
- if the change's `after` blocks are still present, unchanged and in order, they are replaced by its `before` blocks;
- otherwise the change is skipped and counted as "both changed".

The result is committed as a learner version with cause `undo-agent`, a new `PageVersionCause`.

## History comparison (derived)

`compare(text(n - 1 or base), text(n))` uses the same block comparison and returns rows of `{ kind: "added" | "removed" | "same", markdown }`. Unchanged runs are collapsed to a count.

## Image in a page

An inserted image is a Library item of kind `image` (feature 009 upload rules). The page stores `![alt](<content url of the item>)`. The alt text defaults to the file name without its extension.
