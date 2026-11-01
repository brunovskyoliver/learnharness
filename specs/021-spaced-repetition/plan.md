# Plan: Flashcards and spaced repetition (021)

## Constitution Check

| Principle | Result |
| --- | --- |
| I Owner decides | Pass. Owner approved all recommendations and asked for no questions (ROADMAP); decisions are in spec.md, Clarifications. One candidate exception goes to the owner, under III. |
| II Teaching theory first | Pass, with a wording mismatch reported. The back, source and ideas reach the client only on reveal. Lesson generation reads delivered prose only. Nothing is stored on nodes, and a review is never evidence. Constitution II's "event ledger" no longer exists, so understanding is derived from graded transcripts at read time. |
| III Learner data is never lost | Pass, with one **exception candidate for the owner**: cards from a deleted session stay, with the title as text, beyond the "removes its traces" exception. Ratings are write-ahead, the log append-only, card drafts persist as typed, newer formats refused, golden fixtures untouched. |
| IV Honest states | Pass. Loading, no cards, all done, nothing weak, failed and failed refresh are distinct. A run reports running, done, failed, stopped or interrupted, and an unpriced run says "cost unknown". Bad input gets 400, 404 or 409. |
| V Consent before cost | Pass. Opening the panel calls no model. Generate drafts is the click. The run shows on the dock with cost and abort, and leaving the view doesn't stop it. A refused gate writes nothing. |
| VI Interface follows DESIGN.md | Pass. Existing primitives and the Library's menu. Amber only on the primary action, Home's kind label and focus. Hidden scrollbars, Escape innermost first, coarse targets 44px, 320/390/1440 checked. |
| VII Boundaries and tenancy | Pass. Writes only in `src/store/cards.ts`; core holds the port; `ts-fsrs` is imported in one server file; every route uses `withTenant`, with tests. Source text is wrapped as material. |
| VIII Performance | Pass, measured in progress.md. Review UI loads by route. `ts-fsrs` is a server dynamic import. |

## Module map

- `src/core/cards.ts`: records, reconciliation, duplicates, source addresses, wire types, interval words.
- `src/core/card-schedule.ts`: the `CardScheduler` port, day boundary, due rule, order. Not in the browser barrel.
- `src/core/card-evidence.ts`: weak ideas from transcripts. Not in the browser barrel.
- `src/store/cards.ts`: files, lock, write-ahead, format refusal.
- `src/server/card-scheduler.ts`: the only `ts-fsrs` import.
- `src/server/cards.ts`: handlers. `src/server/card-generation.ts`: source reading, gate, run registry, dock feed.
- `src/agent/subagents/card-maker.ts`: prompt and submit tool.
- `components/review/`: `review-view`, `queue-panel`, `card-dialogs`, `card-lists`, `make-panel`, `card-draft`, `card-api`, `card-text`.
- Touched: `components/waiting-section.tsx`, `workspace/sidebar-nav.tsx`, `workspace/context-pane.tsx`, `command-palette-dialog.tsx`, `activity-dock.tsx`, `library/library-row.tsx`, `library/pdf-reader.tsx`, `src/core/command-palette.ts`, `events.ts`, `keyboard.ts`, `src/server/observability.ts`, `config.ts`, `app/api/activity/abort/route.ts`.

## Contracts

### Files (tenant-scoped, under `cards/`)

```
cards.json     { version: 1, cards: Card[], runs: CardRun[] }
reviews.jsonl  { v: 1, type: "review", id, cardId, rating, at, before, after }
               { v: 1, type: "undo", id, reviewId, cardId, at }
```
`Card`: `{ id, front, back, source, conceptIds, status: "draft"|"active", schedule, suspended, contentHash, lastReviewId, runId?, createdAt, updatedAt, deletedAt? }`.
`schedule`: `{ due, stability, difficulty, scheduledDays, learningSteps, reps, lapses, phase, lastReview }`.
`source`: `{ type: "item", itemId, name, page?, block? }`, `{ type: "citation", itemId, name, page, quote }`, `{ type: "message", chatId, messageId, title }`, or null.

### API (all `withTenant`, all `no-store`; only generate can reach a model)

| Route | Answers |
| --- | --- |
| `GET /api/cards/queue?tz&focus` | `{ queue, drafts }`. `queue`: `{ card: { id, front, phase, weak, lastReviewId } or null, due, weakDue, laterToday, nextDueAt, dayEndsAt, total, suspended, undo }`; 400 bad zone or focus |
| `POST /api/cards/{id}/reveal` | `{ id, back, previews, source, concepts }`; 404 |
| `POST /api/cards/{id}/review?tz&focus` `{ rating, base }` | `{ reviewId, interval, queue }`; 400, 404, 409 `stale` or `suspended` |
| `POST /api/cards/undo?tz&focus` `{ reviewId }` | `{ queue }`; 404, 409 `stale` |
| `GET /api/cards/{id}/history` | `{ history: [{ id, rating, at, interval, undone }] }` |
| `GET /api/cards` | `{ cards, drafts, runs }`; only `drafts` hold a back |
| `POST /api/cards` `{ front, back, source?, conceptIds?, keepBoth? }` | 201 `{ card: { id } }`; 409 `duplicate` with `{ duplicates }` |
| `GET /api/cards/{id}` | The row with its back, for editing |
| `PATCH /api/cards/{id}` `{ front?, back?, source?, conceptIds?, suspended?, restore?, keepBoth? }` | `{ ok }`; 400, 404, 409 `duplicate` |
| `POST /api/cards/{id}/accept` `{ keepBoth? }` | `{ ok }`; a draft joins the schedule; 404, 409 `duplicate` |
| `DELETE /api/cards/{id}[?forGood=1]` | `{ ok }`; a kept card goes to Deleted; a draft or `forGood` removes; 409 `not_deleted` |
| `GET /api/cards/concepts?q` | `{ concepts }`; with no query, the weak ones |
| `POST /api/cards/generate` `{ kind, itemId or chatId, page?, text?, preview? }` | `preview`: 200 `{ label, source, chars, truncated, model, refusal }`, no model. Otherwise 202 `{ run }`; 503 refusal, 409 `busy`, 400, 404 |
| `GET /api/cards/runs` | `{ runs }` |
| `POST /api/activity/abort` `{ kind: "cards", id }` | `{ ok }`; 409 |

Format refusals on every route: 409 `cards_future`, 500 `cards_damaged`.

### Events
`cards-changed {}`, added to the vocabulary, with no card text. `activityFeed()` gains `cardRuns`.

### UI strings
- Views: `Review`, `New card`, `Due`, `All cards`, `Drafts ({n})`, `Deleted`.
- Queue: `{n} cards due`, `{n} on weak ideas`, `All due`, `Weak ideas first`, `Only weak ideas`, `Show answer`, `Again`, `Hard`, `Good`, `Easy`, `Undo last rating`, `{Rating}, back in {interval}.`
- States: `No flashcards yet. Write one, or make some from a note, a PDF passage or a lesson.`, `All done for now.`, `{n} cards come back later today, the next in {interval}.`, `The next card is due in {interval}.`, `None of the {n} due cards link to a weak idea.`, `Your flashcards could not be loaded.`
- Editor: `Front`, `Back`, `Ideas from your graph`, `Save card`, `Discard draft`, `Preview`, `You already have a card with this front.`, `Keep both`, `Skip`, `Write the front first.`
- Make: `Make flashcards from {label}`, `Sends {n} characters of this source to {model}…`, `Generate drafts`, `Write one by hand`, `You read each draft and choose what to keep. Nothing joins your queue until you do.`
- Source: `{label} · this source is gone`, `An idea no longer in your graph`.
- Home: `Flashcards`, `{n} due`, `Review`, `Could not count your flashcards.`

## Migration

None. `cards/` appears with the first card. No catalog, chat or graph record is rewritten, and golden fixtures are untouched.

## Rollback

An older build ignores `cards/`, and `/review` is a 404. Everything else keeps working. Deleting `cards/` loses cards and history and nothing else. `ts-fsrs` can be removed with `src/server/card-scheduler.ts`; schedules are plain JSON and stay readable. A later FSRS version should keep reading them, but that isn't tested.

## Accessibility criteria

- Queue progress and each rating are announced in an `aria-live="polite"` status. The count is also visible.
- Ratings are a named group; each button's name holds the rating and gap, and `aria-keyshortcuts` the key.
- After a rating, focus goes to Show answer. After reveal, to the named Answer region, with a visible outline for keyboard users.
- Keys stand down in fields, dialogs and menus. Space on a focused control is that control's.
- Dialogs trap focus and return it to the opener. Escape closes the duplicate warning before the editor.
- The editor's fields have labels. An empty side is stated in words and focuses that field.
- Coarse targets are 44px. Transitions drop under reduced motion. Scrollbars are hidden.

## Known limits

- The review log is read whole on every queue read: fine for years of personal use, and it could be indexed later.
- Weak ideas read every transcript when the graph or a chat changes, then cache per tenant. A large history makes the first read after a lesson slower.
- Evidence joins by provenance, so a check after a message counts against every idea that message produced. The extractor's provenance decides how exact this is.
- All cards pages by 100 with Show more, and isn't virtualized. Search covers the front only, so backs stay out of the browser.
- List rows show a front as plain text, so math reads as `x^2` until the card is opened.
- Generated cards all cite the lesson as a whole, not a message.
- FSRS parameters aren't fitted to the learner.
- The day boundary is fixed, and a browser in a new zone moves it at once.
- A page in the pane has no direct Make flashcards: it's on the Library row's menu.
