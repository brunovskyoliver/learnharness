# Feature 024: Notebook mode

**Feature Branch**: `notebook-mode` (the harness worktree branch, from `main` at fc4ae6d)

**Created**: 2026-11-06

**Status**: Draft

**Input (owner, verbatim summary of the goal)**: "Add a second interface mode to this app that reproduces riddled.ai's notebook one to one in layout, behaviour, look and motion, built on our existing LLM, auth, storage and session plumbing. Keep today's interface as the other mode; I can switch between them at any time and nothing is lost." Where Riddled shows the answer, copy it exactly (spacing, sizes, colours, fonts: Instrument Sans for the user, Newsreader 420 for the AI, timings, easing). Do not copy Riddled's name, logo, wordmark or marketing copy; use our app's name and our own microcopy in the same voice. Reference material: `~/agent-runs/2026-11-06-riddled-research/` (report.md, frames/, video-transcript.txt, riddled-styles.css).

## Clarifications

### Session 2026-11-06 (owner, one question per call)

- Q: What is the new mode called? → A: **Notebook**. Today's interface is **Study**. The switch reads "Notebook" / "Study".
- Q: What name does the AI carry inside Notebook? → A: **No name, verbs only.** No "Tell X", "Ask X", "X this". The instruction line is "Instructions"; selection actions are "Think about this", "Ask about this", "Visualize"; personas are "Reviewers".
- Q: How does a note map to the Library? → A: **A note is an ordinary Library page** (same Markdown, versions, folders, trash). Notebook's sidebar lists Library pages and folders. A page written in Study shows in Notebook and the reverse. AI words never enter the page text; they live in an additive side file keyed by the page.
- Q: Are a note's margin threads and note chat Study sessions? → A: **No, they stay with the note** in its side file and never appear as sessions, in Study's sidebar or on Home.
- Q: Which of our features show inside Notebook? → A: **Rich editor extras** (math, code blocks, tables, checklists, `[[wiki links]]`, callouts), **Make flashcards** (sidebar footer and selection menu, drafting into Review as today) and the **Links panel** (backlinks, related notes, lessons, graph ideas). "Start a lesson" is not included.
- Q: What budget do automatic "Thinks with you" reads have (constitution V)? → A: **No cap.** Each automatic read still shows in the activity view with its cost and can be stopped. This is the owner-approved budget for this feature.
- Q: Where does the activity view live in Notebook? → A: **In the corner hint.** Idle, the faint bottom-right hint shows a shortcut hint; while the AI reads or writes it shows what is running, its cost and Stop, and a click opens the full list in a small lifted popover.
- Q: Where is the mode switch? → A: **Both sidebars and the palette**: "Switch to Study" in Notebook's sidebar footer with its shortcut; a "Notebook" row in Study's sidebar footer and "Switch to Notebook" in the command palette; one shortcut toggles from anywhere. The choice is remembered; each mode reopens where it was left.
- Q: What replaces Riddled's "Share" in the toolbar row? → A: **Export**, opening the PDF / Word / Markdown dialog.
- Q: Which model slot does Notebook use? → A: **Strong for everything** (automatic reads, replies, selection actions, sketches, chat), through a new overridable role.
- Q: How do margin questions behave at phone width? → A: Owner: "I don't care about mobile; let's not focus on that." Decision (agent, minimal and reversible): below 768px every layout falls back to **Marks only**, and a mark opens its thread inline under the paragraph. The layout must still work at 320 and 390px without page overflow (constitution VI).

### Standing rules that apply

- Playwright: the owner asked in this goal for "Unit and Playwright tests". That reverses feature 023's "not adopted" for tests only: `@playwright/test` is a dev dependency, uses the machine's Chromium, downloads no browsers and never enters the app bundle.
- The DESIGN.md Notebook section overrides Study ink only inside Notebook mode (owner, in the goal). Study is unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Write a note on paper (Priority: P1)

He switches to Notebook. The app becomes a quiet sheet of paper: a centred column with a huge title, the top-left menu and wordmark, one muted toolbar row above the title, and a faint hint in the bottom-right corner. He writes; it saves as a Library page. He switches back to Study and the same page is in his Library, unchanged.

**Why this priority**: everything else hangs off the page. Without it there is no mode.

**Independent Test**: switch mode, create a note, type a title and paragraphs, reload, switch to Study, open the page in the Library; the text is identical, and switching back returns to the same note.

**Acceptance Scenarios**:

1. **Given** Study mode, **When** he chooses "Switch to Notebook" (sidebar footer, palette or shortcut), **Then** Notebook opens on the last note he had open there, or a new empty note if none.
2. **Given** a note, **When** he types, **Then** the text is in Instrument Sans at the Riddled note size and line height, and is saved to the Library page with the usual draft and version rules.
3. **Given** a page edited in Study, **When** he opens it in Notebook, **Then** it shows the same content; the reverse also holds.
4. **Given** light, dark or system appearance, **When** the note renders, **Then** it uses the Notebook paper tokens, grain and lift shadow for that theme, and Study's own theme is untouched.

---

### User Story 2 - It thinks with you (Priority: P1)

In "Thinks with you", after he pauses typing (Regular or Slow pace), the AI reads. The passage it wants to discuss gets a faint underline and a breathing ink blot appears beside it. Then a short question appears in the margin, word by word in the AI's serif ink, tied to the passage by a line that draws itself. In "When you ask", nothing happens on its own.

**Why this priority**: it is the core loop of the mode.

**Independent Test**: with a model configured, type a claim and pause; within the pace delay plus model time, an underline, blot and margin question appear; switch the note to "When you ask", type and pause; no read starts.

**Acceptance Scenarios**:

1. **Given** a note in "Thinks with you" at Regular pace, **When** he stops typing for the Regular delay, **Then** one read starts, shows in the corner activity with its cost and a Stop, and either stays silent or produces one margin question tied to a passage.
2. **Given** Slow pace, **When** he pauses, **Then** the read waits about twice as long.
3. **Given** a read in flight, **When** he types again or presses Stop, **Then** that read is aborted and nothing half-written lands.
4. **Given** "When you ask", **When** he types and pauses, **Then** no model call is made.
5. **Given** a line that asks the AI something directly ("can you help me picture this"), **When** it reads, **Then** it may answer inline under that line instead of in the margin, optionally with a sketch.
6. **Given** reduced motion, **When** any of the above happens, **Then** the states change without the animations.

---

### User Story 3 - Margin threads (Priority: P1)

Each margin question is a thread beside the paragraph it is about. Clicking it expands it in place with a "Write back…" field, Resolve and Dismiss; the other notes fade. He writes back and the AI replies in the thread. Collapsed threads show a reply count.

**Why this priority**: questions are only useful if he can answer them.

**Independent Test**: open a seeded thread, write back, get a reply, collapse it ("2 replies"), resolve one and dismiss another; reload; states persist.

**Acceptance Scenarios**:

1. **Given** collapsed threads, **When** he clicks one, **Then** it expands in place, others fade, and its passage takes the wash highlight.
2. **Given** an expanded thread, **When** he writes back and sends, **Then** his words appear in Instrument Sans and the reply in the AI lettering, ink-in.
3. **Given** a thread, **When** he resolves or dismisses it, **Then** it leaves the margin and its mark; resolved threads still count in exports with "Include the AI's notes".
4. **Given** the layout setting, **When** it is Both margins / Right margin / Marks only, **Then** threads sit left and right, all right, or as a small "?" after the passage that opens the thread.

---

### User Story 4 - Ask on a selection, and sketches (Priority: P2)

He selects words. A menu shows a formatting row (text, H1, H2, bold, italic, underline, strike, code, ink colours), then "Think about this", "Ask about this" and "Visualize". Visualize draws an inline stepped sketch under the passage: a serif title and subtitle, a drawing that inks itself in, a caption per step, a stepper (‹ 1/4 › ↻) and "See it larger".

**Independent Test**: select text, apply bold, then each of the three actions; a margin thread or inline reply appears for the first two; a sketch with at least two steps appears for Visualize; step through it; open it larger and close with Escape.

**Acceptance Scenarios**:

1. **Given** a selection, **When** he picks a format, **Then** it applies to his text (it is his text).
2. **Given** "Think about this", **Then** the AI writes one useful remark about the passage as a thread.
3. **Given** "Ask about this", **Then** a thread opens on the passage with his question field focused; nothing is sent until he sends.
4. **Given** "Visualize", **Then** a sketch appears inline under the passage and animates in step by step; the stepper changes steps and captions; ↻ replays; "See it larger" opens it in a dialog.

---

### User Story 5 - Instructions line and reviewers (Priority: P2)

Above the title, one line holds a per-note instruction ("only hints, never the full answer"). The first item in the toolbar row picks a reviewer, a saved mind with its own instructions (examiner, editor, sceptic…), which he can create and edit.

**Independent Test**: set an instruction and a reviewer; trigger a read; the request carries both; edit reviewers in settings; reload; both persist per note.

---

### User Story 6 - Note chat (Priority: P2)

A chat icon opens a right panel over a dimmed page. It opens with a short line saying it has read the whole note and three starter questions. He asks; it answers with the whole note, its threads and its instructions as context.

**Independent Test**: open the chat, click a starter (it fills, sends only on his send), get a streamed answer in the AI lettering, close with Escape; reopen; the chat history is there.

---

### User Story 7 - Just my words and export (Priority: P2)

"Just my words" hides every AI mark on the page. Export offers PDF, Word or Markdown with an "Include the AI's notes" toggle.

**Independent Test**: toggle Just my words; no thread, mark, blot, tether or sketch remains; export each format with the toggle on and off; files open and contain or omit the AI's notes.

---

### User Story 8 - Sidebar and settings (Priority: P2)

The sidebar is an overlay opened from the menu icon or by hovering the left edge: search ("Find or start a note"), New note, the notes, folders and New folder, then a footer with the account, "All notes saved" and actions with their shortcuts. Settings is a modal with option cards and layout thumbnails: start mode, pointer ink, reading pace, layout, appearance, text size, AI lettering and AI ink colour.

**Independent Test**: open the sidebar each way, find and open a note, create a note and a folder, run every footer action by click and by shortcut; change every setting and see it apply live and persist.

---

### Edge Cases

- No model configured or no key: automatic reads do not start; the corner hint says why and links to Study's settings; explicit actions show the same refusal in place. Nothing is faked.
- A read finishes after the passage it quoted was edited away: the thread anchors to the nearest remaining match; with none it is kept as "detached" at the top of the margin, never silently dropped.
- The page changes in Study while a Notebook read runs: the result anchors against the current text, the same way.
- A side file from a newer app version: refused, never rewritten; the note still opens without AI marks and says so.
- A damaged side file: set aside as the annotations store does; the note opens clean and says so.
- Moving a page to trash keeps its side file; deleting for good removes it.
- Pages over the size limit, PDFs and other Library items do not open as notes; the sidebar lists pages and folders only.
- Very long margins (more threads than space): threads stack downward without overlapping and never cover the text column.
- Switching modes mid-read: the read keeps running server-side and lands in the side file; switching back shows it.
- Typing during composition (IME): no read starts until composition ends.

## Requirements *(mandatory)*

### Functional Requirements

**Mode and switching**

- **FR-001**: The app MUST have two interface modes, Study (today's) and Notebook. The current mode is stored in settings and restored on load.
- **FR-002**: The switch MUST be reachable from Notebook's sidebar footer ("Switch to Study"), Study's sidebar footer ("Notebook"), the command palette ("Switch to Notebook") and one global shortcut that toggles.
- **FR-003**: Switching MUST NOT lose or alter data: pages, drafts, sessions, settings and each mode's last location survive any number of switches and reloads.
- **FR-004**: Study's behaviour, look and tests MUST be unchanged.

**Notes**

- **FR-010**: A Notebook note MUST be a Library page. Creating a note creates a page; the sidebar lists Library pages and folders; edits save through the existing page draft and version flow.
- **FR-011**: The note view MUST reproduce Riddled's page: centred column, title at 2.45× the note size with -0.032em tracking, body at the note size (15.5/16px; small 14.5/15; large 17/18 by breakpoint) with 1.8 line height, chrome as in DESIGN.md's Notebook section.
- **FR-012**: The rich editor extras (math, code, tables, checklists, wiki links, callouts) MUST work in a note, styled in Notebook type.
- **FR-013**: The Links panel MUST be reachable from a note.

**Reading and margin threads**

- **FR-020**: Each note MUST have a mode, "Thinks with you" or "When you ask", defaulting to the settings' start mode, changeable from the toolbar row.
- **FR-021**: In "Thinks with you", after a typing pause (Regular delay; Slow about twice that) one read MUST run with the note, its instruction and its reviewer, and MUST either stay silent or produce one thread on a quoted passage. Typing again or Stop aborts it.
- **FR-022**: While a read runs, its passage MUST show the underline and the breathing blot; the result MUST appear as a margin question with a self-drawing tether, or inline under the line, word by word.
- **FR-023**: "When you ask" MUST make no automatic model call.
- **FR-024**: Threads MUST expand in place with "Write back…", Resolve and Dismiss; others fade; collapsed threads show "{n} replies".
- **FR-025**: Layout MUST be Both margins, Right margin or Marks only; below 768px it is always Marks only, opening inline.
- **FR-026**: Every automatic read MUST show in the corner activity with its cost, computed at read time, and a Stop. There is no cap (owner).

**Selection, sketches, chat**

- **FR-030**: Selecting text MUST show the menu: formatting row, then "Think about this", "Ask about this", "Visualize", and "Make flashcards".
- **FR-031**: Sketches MUST be stepped (2-6 steps), drawn in AI ink with a serif title, sans subtitle, one caption per step, a stepper with previous, next and replay, and "See it larger".
- **FR-032**: Note chat MUST open as a right panel over a dimmed page with an opening line and three starters; starters fill the field and send only on his send; the whole note, its threads and instructions are the context and that is labelled.
- **FR-033**: Note chat history MUST persist with the note.

**Instructions, reviewers, export**

- **FR-040**: Each note MUST have one instruction line above the title, editable in place, sent with every AI request on that note.
- **FR-041**: Reviewers MUST be creatable, editable and deletable (name and instructions); a few are seeded; each note picks one from the toolbar row.
- **FR-042**: "Just my words" MUST hide every AI mark on the page and persist per browser.
- **FR-043**: Export MUST produce PDF, Word (.docx) and Markdown, each with or without the AI's notes; the AI's notes sit under the paragraph they belong to, sketches as pictures where the format allows.

**Sidebar, settings, themes, motion**

- **FR-050**: The sidebar MUST be an overlay opened by the menu icon, by hovering the left edge, and by its shortcut; it dims the page and closes with ✕, Escape or a click outside.
- **FR-051**: The sidebar footer MUST hold the account (hosted), the save state and actions with shortcuts: Copy this note, Export this note, Just my words, Settings, Reviewers, Make flashcards, Switch to Study, Sign out (hosted only).
- **FR-052**: Settings MUST be a modal with option cards (selected = darker 1.5px border, no fill) and layout thumbnails for: start mode, ink from the pointer, reading pace, where questions appear, appearance (system/light/dark), text size, AI lettering (serif/plain), AI ink colour (ink, blue, green, red, purple, brown, orange). Changes apply live and persist.
- **FR-053**: Light and dark paper themes MUST use Riddled's token values, grain and lift shadow. Appearance applies only in Notebook.
- **FR-054**: All motion MUST use Riddled's keyframes, durations and easings and MUST have reduced-motion fallbacks.
- **FR-055**: Scrollbars hidden, keyboard focus always visible (2px outline in the AI line colour, offset 2px), every action reachable by keyboard, Escape closes the innermost layer, dialogs trap focus and return it.

### Key Entities

- **Interface mode**: Study or Notebook; one per user; plus each mode's last location.
- **Note**: a Library page viewed in Notebook.
- **Note companion** (side file per page): the note's mode, instruction, reviewer, threads and chat, with a schema version.
- **Thread**: an anchored passage (quote, prefix, suffix), placement (margin or inline), side, status (open, resolved, dismissed), origin (read, think, ask, visualize), messages (author, text, optional sketch, time).
- **Sketch**: title, subtitle, a small set of drawing primitives, and 2-6 steps, each with a caption and the primitives it reveals.
- **Reviewer**: name and instructions; seeded and user-made.
- **Notebook preferences**: start mode, pointer ink, pace, layout, appearance, text size, lettering, ink colour.

## Success Criteria *(mandatory)*

- **SC-001**: Side-by-side screenshots of the reference frames and Notebook match on layout, type, colour, spacing and motion; every remaining difference is listed and approved by the owner.
- **SC-002**: 20 consecutive mode switches with edits in between lose nothing (pages, drafts, threads, settings, positions).
- **SC-003**: Every scope item works end to end against a real configured model in both themes at 1440 and 390px.
- **SC-004**: Study's full test suite passes unchanged; lint, typecheck, build, unit and Playwright tests pass.
- **SC-005**: Startup JavaScript for Study does not grow by more than 5%; Notebook code loads only in Notebook.
- **SC-006**: impeccable and web-design-guidelines reviews of Notebook are clean; keyboard-only and screen-reader runs reach every action.

## Assumptions

- The reference app's own `/write` code was not available; everything about behaviour comes from the video and the landing page's CSS, which contains the note, drawing and margin styles.
- Instrument Sans and Newsreader (with weight 420 via its variable axis) load through the existing font system, only in Notebook.
- "Ink from the pointer" is off by default, as in Riddled.
- Voice input ("Hold ⌥ to speak") is out of scope; the corner hint holds our activity and a shortcut hint instead.
- Riddled's "About you", "Profile", "Billing" and "Help & support" settings pages are out of scope; our existing Study settings cover models and keys.
