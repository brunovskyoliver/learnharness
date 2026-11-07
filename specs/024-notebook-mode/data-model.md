# Data model: Notebook mode

All new data is additive. Nothing existing changes shape. Settings version stays 1 (new optional fields, unknown keys preserved).

## Settings (`data/settings.json`)

```ts
general.interface?: "study" | "notebook"          // default "study"

notebook?: {
  startMode: "thinks" | "ask";                    // default "thinks"
  pointerInk: boolean;                            // default false
  pace: "regular" | "slow";                       // default "regular"
  layout: "both" | "right" | "marks";             // default "both"
  appearance: "system" | "light" | "dark";        // default "system"
  textSize: "small" | "default" | "large";        // default "default"
  lettering: "serif" | "plain";                   // default "serif"
  ink: "ink" | "blue" | "green" | "red" | "purple" | "brown" | "orange"; // default "ink"
  reviewers: Reviewer[];                          // seeded on first read, see below
  lastNoteId?: string;                            // where Notebook reopens
}

Reviewer = { id: string; name: string (1..60); instructions: string (0..2000); seeded?: true }
```

Seeded reviewers (our wording, ui-contract.md): Plain reader (default, empty instructions), Examiner, Editor, Sceptic, Professor. Deleting a seeded one is allowed and sticks.

Model role `notebook` → slot `strong`, overridable like other background roles.

Study's last location: `localStorage["lh.study.lastPath"]` (per browser; written on each Study navigation). Notebook's: `notebook.lastNoteId`.

"Just my words": `localStorage["lh.nb.justMyWords"] = "1"` per browser.

## Companion file `library/notebook/<pageId>.json`

```ts
NoteCompanion = {
  v: 1;                                 // future version → refused read-only, never rewritten
  pageId: string;
  mode?: "thinks" | "ask";              // stamped from settings.startMode when the note is made in Notebook
                                        // or first opened there; absent only for pages never opened in Notebook
                                        // (read as settings.startMode). Changing the setting never flips a stamped note.
  instruction: string;                  // 0..500 chars
  reviewerId?: string;                  // absent or unknown → Plain reader
  threads: Thread[];
  chat: ChatMessage[];
  readCursor?: { textHash: string; at: string }; // last text an automatic read saw
}

Thread = {
  id: string;                           // nanoid
  anchor: { quote: string; prefix: string; suffix: string; block?: number };
  placement: "margin" | "inline";
  side: "left" | "right";               // chosen at creation (alternating by vertical slot), "right" in Right margin
  status: "open" | "resolved" | "dismissed";
  origin: "read" | "think" | "ask" | "visualize";
  createdAt: string; updatedAt: string;
  messages: ThreadMessage[];            // first is the AI's question, or his for "ask"
}

ThreadMessage = {
  id: string;
  author: "ai" | "user";
  text: string;                         // Markdown subset (inline marks, code, math)
  sketch?: Sketch;
  reviewerId?: string;                  // who spoke (ai)
  at: string;
  runId?: string;                       // the run that wrote it
  state?: "streaming" | "failed" | "stopped"; // absent = complete
}

ChatMessage = { id; author: "ai" | "user"; text; at; runId?; state? }
```

Rules
- Write-ahead: a user message is appended before its run starts.
- The AI never edits a user message or the page.
- `detached` is derived (anchor unresolved), never stored.
- Counts: "{n} replies" = messages after the first.
- Limits: 200 threads, 200 messages per thread, 400 chat messages, 20 KB per message. Over the limit → 409 with a plain reason.
- Locking: one write lock per page via `tenantScoped` (as `library-annotations.ts`). A damaged file is renamed `<pageId>.damaged-<time>.json` and an empty companion is used; the note shows "Earlier notes for this page couldn't be read, so they were set aside."
- Trash keeps the file; delete-for-good removes it; restore needs nothing.

## Sketch

```ts
Sketch = {
  title: string (1..80); subtitle?: string (..120);
  w: number (120..640); h: number (80..480);     // viewBox units
  items: SketchItem[] (1..80);
  steps: { caption: string (1..160); note?: string (..120) }[] (1..6); // note = the big serif line under the drawing
}
SketchItem = { step: number (0-based, < steps.length) } & (
  | { kind: "grid"; x; y; cols (1..8); rows (1..8); cell; cellH? }  // faint rule grid; cellH = cell height when not square (phase 6)
  | { kind: "text"; x; y; text (..40); size?: "s"|"m"|"l"; voice?: boolean; anchor?: "start"|"middle"|"end" }
  | { kind: "line" | "arrow"; x1; y1; x2; y2; curve?: number }
  | { kind: "rect"; x; y; w; h; r? }
  | { kind: "circle"; cx; cy; r }
  | { kind: "dot"; cx; cy }
  | { kind: "bar"; x; y; w; h }                                  // grows from its left
  | { kind: "path"; d: string }                                  // M L Q C Z only, ≤ 400 chars
)
```
Validation in `src/core/notebook-sketch.ts`: unknown kinds, out-of-box coordinates, bad steps → reject the sketch (the message keeps its text and says the drawing didn't come through).

## Run (server memory only)

```ts
NotebookRun = { id; pageId; kind: "read"|"think"|"ask"|"reply"|"visualize"|"chat";
  threadId?; messageId?; status: "running"|"done"|"failed"|"stopped"|"silent";
  startedAt; endedAt?; usage; model?; error?; auto: boolean }
```
Kept 10 minutes after ending for the feed and late stream subscribers.

## State transitions

Thread: open → resolved | dismissed (both final in the UI; "Reopen" is not offered by Riddled and is out of scope). Message state: streaming → complete | failed | stopped.
Run: running → done | silent | failed | stopped.
