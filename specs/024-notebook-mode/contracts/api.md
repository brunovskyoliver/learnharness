# API contract: Notebook mode

All routes wrapped in `withTenant`; JSON; ids `^[A-Za-z0-9_-]+$`. Errors `{error: string, detail?: string}` with 400 (invalid), 404 (unknown page/thread/run), 409 (limit, stale, future version), 503 (no model / key: `{error, reason: "models"|"key"}`).

## Companion

- `GET /api/notebook/:pageId` → `{ companion: NoteCompanion, effective: { mode }, readOnly?: "future-version" | null, setAside?: boolean }`. 404 if the page is not a live or trashed page.
- `PATCH /api/notebook/:pageId` `{ mode?, instruction?, reviewerId? }` → `{ companion }`.

## Threads

- `POST /api/notebook/:pageId/threads` `{ anchor, origin: "ask", text }` → `{ thread }` (his question appended write-ahead; then he starts a `reply` run).
- `PATCH /api/notebook/:pageId/threads/:threadId` `{ status: "resolved" | "dismissed" }` → `{ thread }`.
- `POST /api/notebook/:pageId/threads/:threadId/messages` `{ text }` → `{ message }` (user message, write-ahead).

## Runs

- `POST /api/notebook/:pageId/runs` body by kind:
  - `{ kind: "read", text, auto: true }` — automatic read of the current note text (client sends the text it sees; server also reads the saved draft and uses the client text only if the page id matches and the size is within limit).
  - `{ kind: "think", text, anchor }` — "Think about this".
  - `{ kind: "visualize", text, anchor }`.
  - `{ kind: "reply", text, threadId }` — after his Write back or ask.
  - `{ kind: "chat", text, message }` — note chat; `message` is appended write-ahead. 409 while the last answer is still being written.
  - `{ kind: "chat", text, retry: true }` — "Try again" on the chat's last answer when it failed, was stopped, or still says streaming with no run behind it: that answer is replaced, his message before it stays (phase 8). 409 when there is nothing to try again.
  → `202 { run: { id, kind, status } }`. A second automatic read on the same page aborts the earlier one.
- `GET /api/notebook/runs/:runId/stream` → SSE events:
  - `phase` `{ phase: "reading" | "writing" | "drawing", anchor? }` (anchor = the quote being considered; drives the underline and blot)
  - `delta` `{ messageId, text }` (appended text)
  - `done` `{ status: "done" | "silent", threadId?, messageId? }`
  - `failed` `{ error, detail? }` / `stopped` `{}`
  - `ping` every 25 s. A late subscriber gets the buffered deltas first.
- Stop: `POST /api/activity/abort { kind: "notebook", id }` (existing route, new kind).
- Server event `notebook-changed { pageId }` after any companion write.
- `GET /api/activity` gains `notebookRuns: { id, pageId, pageName, kind, auto, startedAt, costUsd | null, model? }[]`.

## Model I/O (TypeBox, `runSubmitAgent`)

System prompt pieces (inline constants, ui-contract.md "Voice"): the role, the note's instruction line, the reviewer's instructions, the rules (one short question, two or three sentences, pointed at a specific claim; never rewrite his text; never give the full answer unless asked; reply in the note's language).

- read → `submit_read`: `{ action: "silent" } | { action: "margin", quote, text } | { action: "inline", quote, text, sketch? }`. `quote` must occur verbatim in the note (else treated as silent). Context: full note text with the last-read text hash, open and resolved threads (short), instruction, reviewer.
- think → `submit_remark`: `{ text, placement: "margin" | "inline", sketch? }`.
- visualize → `submit_sketch`: `{ text?: string, sketch: Sketch }` (validated; up to 2 retries inside `maxTurns`).
- reply / chat → streamed plain text (Markdown subset). Chat context label: "Read the whole note, {n} threads and your instructions."

## Export

- `POST /api/notebook/:pageId/export` `{ format: "pdf" | "docx" | "md", includeAi: boolean }` → file body with `Content-Disposition: attachment; filename="<name>.<ext>"`. AI notes placed after the paragraph they anchor, in the AI lettering (PDF), italic serif style (Word), `> ` blockquote prefixed with the reviewer name for Markdown; sketches as SVG (PDF), PNG (Word), omitted with a one-line caption list (Markdown). Detached threads at the end under "Other notes".

## Reviewers

Stored in `settings.notebook.reviewers`; `PUT /api/settings/notebook` (existing settings route, new section) carries the whole notebook section including reviewers.

## Mode

`PUT /api/settings/general { interface }`.
