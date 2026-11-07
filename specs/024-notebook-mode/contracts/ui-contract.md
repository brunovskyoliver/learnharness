# UI contract: Notebook mode

Exact sizes, colours, timings and easings are in [visual-reference.md](visual-reference.md). This file fixes our words, behaviour, keyboard and accessibility. Voice: short, second person, a little dry. The AI has no name (owner).

## Chrome

| Element | Text / behaviour |
| --- | --- |
| Menu button | icon ☰, accessible name "Open notes" (✕ "Close notes" while open) |
| Wordmark | our `LhMark` + "Brunovský’s study" in Instrument Sans, links to the current note |
| Toolbar row (above title, sticky) | reviewer picker "{reviewer name} ▾" · "Instructions" (pencil icon; hidden once an instruction exists, the line below shows instead) · mode "Thinks with you ▾" (bulb icon in `--bulb`) / "When you ask ▾" (speech icon) · "Export" (share-style icon) |
| Chat button | at the toolbar row's end: icon only, name "Ask about this note" |
| Mode menu | "Thinks with you" — "Reads along and speaks up when a line deserves a second look." · "When you ask" — "Stays quiet until you select something or open the chat." |
| Instruction line | pencil + "Instructions" label in faint ink, then his text in the AI lettering; placeholder "How should this note be read? Only hints, say, or argue with everything." Enter or blur saves; Escape reverts |
| Title | placeholder "Untitled"; Enter moves to the body |
| Body placeholder | "Start writing. Type / for blocks." then second line "Nothing here is read until you pause." (When you ask: "Nothing here is read unless you ask.") |
| Corner hint idle | "⌘K finds a note" (Ctrl on non-Mac) |
| Corner hint running | "Reading…" / "Writing…" / "Drawing…" · "{cost}" or "cost not known" · "Stop" |
| Corner hint refused | "No model set up. Open Study’s settings" (link switches to Study settings) / "Your {provider} key is missing" |
| Activity popover | rows "{Reading | Thinking | Replying | Drawing | Chat} · {note name} · {cost} · Stop" ; empty "Nothing running." |

## Reading and threads

| Element | Text / behaviour |
| --- | --- |
| Paces | Regular: read after 1600 ms of no typing; Slow: 3200 ms (visual-reference may refine). No read during IME composition, while the selection menu or a thread field is focused, or if the text is unchanged since the last read |
| Reading state | underline under the considered passage + breathing blot at its start in the margin gutter; announced politely once: "Reading this passage." |
| Margin question | AI lettering, word-by-word ink; tether draws from passage to note |
| Collapsed thread | first message clamped; "{n} replies" / "1 reply" |
| Expanded thread | full messages (his in Instrument Sans graphite, AI in lettering), field "Write back…", send arrow "Send", text buttons "Resolve", "Dismiss", "⋯" menu: "Copy text" |
| Resolve | thread leaves the page; status line "Resolved. It’s still in exports." with "Undo" for 6 s |
| Dismiss | thread leaves the page; "Dismissed." with "Undo" for 6 s |
| Marks only | "?" after the passage, name "Open question about “{first words}”" |
| Detached | stacked at the top of the right margin with "The words this was about are gone." |
| Failed run | in place: "That didn’t come through." + "Try again" (explicit), "Show details" |
| Stopped | partial text kept, then "Stopped." |

## Selection menu

Row 1 (format): Text, Heading 1, Heading 2, Bold, Italic, Underline, Strikethrough, Code; row 2: ink colours (Default, Gray, Brown, Red, Orange, Green, Blue, Purple) as swatches named "{colour} ink". Then actions, each one line: "Think about this", "Ask about this", "Visualize", "Make flashcards". "Ask about this" opens a thread with the field "Ask about this passage…" focused.

## Sketch

Serif title, sans subtitle, the drawing, the step's big serif line (note), the caption on the left and the stepper on the right: "‹" "Previous step", "{i}/{n}", "›" "Next step", "↻" "Draw it again"; below "See it larger" opens a dialog (Escape closes, focus returns). Arrow keys step while the stepper has focus. Failed drawing: "The drawing didn’t come through."

## Note chat

Panel header: dot + "This note", subline "On “{note name}”", close ✕ "Close chat". Opening line (AI lettering): "I’ve read all of this note. Ask me anything about it." Starters: "What am I still getting wrong?", "What have we worked out so far?", "What should I do next?" (fill the field; Enter sends). Field "Ask about this note…". Context label under the opening line, faint: "Read the whole note, {n} threads and your instructions." Escape closes.

## Overlay sidebar

Search "Find or start a note" with "⌘K"; Enter on a query with no match creates a note with that name. "New note". Notes (file icon, name, a dot when it has open threads). Folders as collapsible rows. "New folder". Footer: account email (hosted) and save state ("All notes saved" / "Saving…" / "Not saved. Your text is kept in this browser."), then actions with shortcuts:

| Action | Shortcut |
| --- | --- |
| Copy this note | ⌘⇧C |
| Export this note | ⌘⇧E |
| Just my words | ⌘⇧H |
| Settings | ⌘, |
| Reviewers | — |
| Make flashcards | — |
| Links | — |
| Switch to Study | ⌘⇧O |
| Sign out (hosted) | — |

Opens on ☰, on hovering a 12 px strip at the left edge for 250 ms (fine pointers only), and Mod+\\. Closes on ✕, Escape, click on the dimmed page, or leaving it after a hover-open. Copy confirmation: "Copied." Just my words on: "Just your words. The notes are hidden, not gone."

## Settings modal

Nav: "Customize", "Reviewers". Title "Customize".

| Section | Cards |
| --- | --- |
| New notes start in | Thinks with you — "Reads along and speaks up when a line deserves a second look." · When you ask — "Stays quiet until you select something or open the chat." Under: "Each note can change on its own, from the row above its title." |
| Ink from the pointer | switch; "Now and then a drop of ink falls where you move the pointer, then dries." |
| Reading pace | Regular — "Reads a moment after you stop typing." · Slow — "Waits about twice as long, for when you think between lines." |
| Where questions appear | thumbnails: Both margins — "Your words in the middle, questions on both sides." · Right margin — "Every question in one column beside your words." · Marks only — "A small ? after the passage. Open it when you want." |
| Appearance | thumbnails: System, Light, Dark |
| Text size | sample "A thought." Small / Default / Large |
| Lettering | sample "Does this hold?" Serif — "Its own hand" · Plain — "Same as yours" |
| Ink colour | Ink, Blue, Green, Red, Purple, Brown, Orange swatches |

Reviewers page: list (name, first line of instructions), "New reviewer", edit in place (Name, "How should they read?" textarea), "Delete reviewer" with Undo. Seeded: Plain reader (no instructions), Examiner ("Reads like the person grading this. Asks what you’d be asked, never gives the answer."), Editor ("Cares about clarity and structure. Points at the sentence that loses the reader."), Sceptic ("Disagrees with your premise and makes you defend it."), Professor ("Checks the reasoning step by step and asks for the missing one.").

## Export dialog

Title "Export “{name}”". Cards: PDF — "To read, print or send." · Word — "To keep editing in Word, Pages or Google Docs." · Markdown — "Plain text for anywhere." Toggle "Include the notes" — "Each one sits under the paragraph it’s about, drawings too." Buttons "Cancel" and solid "Export {PDF | Word | Markdown}". Running: "Exporting…"; failed: "The export didn’t work." + "Show details".

## Mode switch

Study sidebar footer: "Notebook" text button after the palette icon, hint "Switch to Notebook · ⌘⇧O". Palette: "Switch to Notebook". Global Mod+Shift+O toggles. Notebook reopens `lastNoteId` (or the newest page, or a new note); Study reopens its last path.

## Keyboard and screen readers

- Escape order: menu → selection menu → thread field → expanded thread → chat → dialog → sidebar.
- Tab order: menu, wordmark, toolbar row, instruction, title, body; margin threads are reachable with Mod+Alt+↓/↑ ("Next note in the margin") from the body and as buttons in DOM order after the body; Enter expands; Escape returns focus to the passage.
- Live region (polite): "Reading this passage.", "New question in the margin: {first words}", "Reply ready.", run failures.
- Focus: 2 px outline in `--riddle-line`, offset 2 px, on every control (visual-reference).
- AI text has `lang` inherited and is marked `aria-roledescription="note"` with name "Margin note".
