# Feature 021: Flashcards and spaced repetition

**Branch**: `feat/021-spaced-repetition`, from `feat/019-document-intelligence`
**Created**: 2026-11-01
**Status**: Implemented, not merged or deployed

**Input (owner)**: "Generate editable flashcards from notes, documents and lessons. Use FSRS scheduling, daily due queue, review history, suspension and duplicate checks. Link cards to sources and weak concepts; reuse existing grading/practice infrastructure without conflating scheduling with graph evidence."

## Clarifications

The owner approved every recommended option and asked for no questions (ROADMAP standing rules). Each decision below was made under that approval.

### Storage
- **Form**: `cards/cards.json` (cards and generation runs, written atomically) and `cards/reviews.jsonl` (append-only), per tenant. No catalog change.
- **Write-ahead**: a rating goes to the log, then to the card. On read, the log wins (`reconcileCards`), so a crash between the two loses nothing. A torn last log line reads as never written and stays in the file.
- **Formats**: both carry a version. A newer one is refused for reads and writes, and left byte-identical. A damaged `cards.json` is refused and left in place, rather than set aside as annotations are: an empty queue would read as "no cards".
- **Delete for good** removes the card record. Its log lines stay, since the log is append-only; they hold ratings, dates and schedule numbers, no card text.

### Scheduling
- `ts-fsrs` 6.0.0, exact-pinned, behind core's `CardScheduler` port. Loaded by dynamic import on first use, server only. Default parameters, **no fuzz**, because a predicted interval has to be what the rating then does.
- **Day boundary**: fixed at 04:00 in the learner's zone, sent by the browser as `tz` (UTC if absent, 400 if unknown). No setting for it yet.
- **Due**: a card in a minute-scale step is due at its minute. A new or review card is due if its date falls before the next boundary.
- **Order**: steps, then review by date, then new by age. No daily limit on new or review cards: the owner's goal doesn't name one, and hiding due cards behind a limit would need a rule to explain.
- An edit keeps the schedule. A fixed typo doesn't make a card new.
- A rating carries the review it was made after (`base`), so a stale tab gets a 409 and can't rate twice.
- **Undo**: the card's standing rating, repeatedly back through that card's ratings. The queue offers the newest one from the learner's current day, and it survives a reload. Undone reviews stay in history, marked.

### The back
- The queue and list send fronts only. `POST /api/cards/{id}/reveal` sends the back and intervals. `/review`'s first response holds no card data at all, because the client view fetches.
- **Source and ideas stay off the face too**. A quote or an idea's name can give the answer away, and constitution II already keeps a problem's target unannounced. They arrive with the reveal.
- A reload after reveal goes back to the front. The reveal isn't stored anywhere.
- `GET /api/cards/{id}` sends the back for Edit, which is the learner asking. Edit is offered in the queue only after reveal. In All cards it is a deliberate menu choice.
- A draft shows its back: it is there to be read before it joins anything.

### Sources and deletion
- A source is `item` (id, name, optional page or block), `citation` (the form from 020) or `message` (the form from 017). The client names the id; the server checks it and supplies the name.
- **"Gone" is worked out on read**, never stored. Deleting a session or trashing a document changes no card, and restoring the document brings the link back.
- **A session's deletion keeps its cards as learner data, with the title kept as text.** This goes beyond the constitution's "removes its traces" exception. It is flagged for the owner, like feature 017's saved passages.
- An idea that leaves the graph stays linked and reads as "An idea no longer in your graph".

### Weak ideas
- **What exists**: the graph ledgers hold no learner evidence. Quiz events and understanding observations left them on 2026-09-27 (`src/core/contracts/graph.ts`), though constitution II still says "the event ledger". So evidence is read from transcripts, joined to nodes two ways: a practice problem's `target` plus its `conclude` outcome, and a graded check after a teacher message that a node's provenance names.
- **Rule**: weak means the newest evidence about the idea was a miss. A wrong answer, "I don't know", `solvedWithHints`, `movedOn` and `surrendered` are misses. A right answer and `solved` are not. A dismissal says nothing.
- Read through `getGraph`, `queryGraph` and `searchGraph`. Nothing is stored and nothing lands on a node.
- **Use**: "All due", "Weak ideas first" and "Only weak ideas" choose what shows, per browser. No schedule moves. A flashcard rating is never evidence.

### Duplicates
Normalized front: NFKC, case, accents, spacing, `**`, `__`, backticks and surrounding punctuation don't count. Formula symbols do. A deleted card isn't a duplicate. A warning writes nothing, and offers "Keep both" or "Skip". A draft shows the same warning in its row. Two drafts that match warn each other.

### Generation
- Three sources: a note (the page's draft or head), a PDF passage from the reader, a lesson (delivered prose only, so an unseen answer can't reach a model by this path). Whole PDFs and read-only text files aren't offered.
- **Two clicks**: "Make flashcards" only opens a panel saying how much goes to which model. "Generate drafts" sends.
- **Infrastructure**: `runSubmitAgent` with the `extractor` role, which reads a source and submits structure on the cheap slot, so no new settings row. Not a `JobRecord`: jobs belong to a chat and steer a result back into it, and a note has no chat. The run gets its own row on the activity dock, with cost and abort, through a new `cards` process. One run at a time per tenant.
- Source text is capped at 30,000 characters and the cut is stated. It travels as `<source_material>` with its closing tag escaped, and the prompt calls it material.
- **Each draft is kept one at a time.** There is no "Keep all", which would be a schedule nobody read.
- Up to 3 ideas are suggested per draft by word overlap, with no model, and shown for the learner to remove.

### Interface
- `/review`, with Due, All cards, Drafts and Deleted. "Review" in the sidebar has no count, so the shell makes no request for it. Home's row makes the one request.
- Delete moves to Deleted with Undo. Only Delete for good confirms, as the Library's trash does.
- Key `U` undoes; Space and 1 to 4 as asked. All stand down in fields, dialogs and menus.
- An unsaved card is kept in `localStorage` as it's typed. Closing keeps it; only Save or Discard draft clears it. An editor open at reload reopens.

### Dependencies
`ts-fsrs` 6.0.0, approved. It brings `@open-spaced-repetition/srs-kit`.

## User stories

1. **Write a card (P1).** With no model, in Markdown and math, warned about a duplicate.
2. **Review today's cards (P1).** Front, Show answer, four ratings with predicted gaps, by keyboard or touch. Undo a slip.
3. **Manage cards (P1).** History, suspend, edit, delete and restore.
4. **Make drafts from what I studied (P2).** On a click, stating the cost, and reading each before keeping it.
5. **Focus on what's shaky (P2).** Cards tied to weak ideas first or alone, with no schedule changed.

## Requirements

- **FR-001** No back in the queue, the list of kept cards or `/review`'s first response.
- **FR-002** FSRS state changes only through a rating or an undo. Reviews write nothing to graph ledgers or transcripts; evidence changes write nothing to cards.
- **FR-003** A rating written to the log survives a crash before the card write. A torn last line is ignored.
- **FR-004** A newer format is refused unchanged.
- **FR-005** Drafts join the schedule only by being kept, one at a time.
- **FR-006** A duplicate is warned about, never dropped or merged.
- **FR-007** Tests make no model requests; generation starts only on an explicit click.
- **FR-008** Every path and registry is tenant-scoped. Another tenant's id is a 404.
- **FR-009** Deleting a session or trashing a source leaves its cards, with the source marked gone.
- **FR-010** `ts-fsrs` and the review UI stay out of the startup graph; initial JS stays within 5%.

## Success criteria

- `tests/cards.test.ts` and `tests/render-review.test.tsx` pass.
- `scripts/check-review-ui.mjs` passes at 1440, 390 and 320.
