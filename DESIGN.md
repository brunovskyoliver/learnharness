# Interface design

Study ink, approved by Oliver on 2026-10-27 (feature 001, [specs/001-study-ink-prompt-bar](specs/001-study-ink-prompt-bar/spec.md)). It replaces the T3 Code black theme. The design reference is the canvas at https://claude.ai/artifact/5oZhYiW8seh7WbxCDn9nFh. Home, the sidebar and the 001 leftovers follow feature 002's canvas, https://claude.ai/artifact/SChjbajeREM23XcaxEGb1E ([specs/002-home-waiting-first](specs/002-home-waiting-first/spec.md)). Its tokens, type and prompt-bar components are mirrored in [design-system/](design-system/README.md) (also published at https://claude.ai/artifact/1RjQhdzMDVeypi1nbnBWYP). The mirror does not update itself; where it and this file disagree, this file wins.

Run `npm run dev:review` for persistent example threads. See [the UI review guide](docs/ui-review.md) for review routes and behavior checks.

## Study ink

- Surfaces: ground `#0b0b0a` for canvas, sidebar, lesson and demo chrome; raised `#151513` for composer, cards and demo frame; raised-2 `#1d1d1a` for menus, hover and selection. Elevation comes from these steps only: no drop shadows, no backdrop blur. Loading uses opaque scrims or in-place skeletons.
- Inks: `#edece8` (prose, titles, values), `#b4b2ab` (`ink-2`: labels, secondary copy), `#8a8881` (`muted-foreground`: timestamps, hints, meta). Each passes 4.5:1 on every surface. Never derive text color from an opacity modifier.
- Accent: amber `#e3a957`, reserved for the learner's turn (turn label, waiting status), the primary action, the selected choice and keyboard focus. Text on the accent uses the ground color. Links and decoration do not use it.
- Edges: `rgb(255 252 240 / 7%)` hairline for table rules; `rgb(255 252 240 / 14%)` edge for inputs and choices. No dashed borders, no side rules on quotes or thinking.
- Radii: 6px for controls, 10px for cards, composer and demo frame, fully round only for the chat send, status dots and avatars.
- Motion: 160ms for state, 240ms for layout. Reduced motion keeps the state change without the transition.

## Typography and surfaces

- Source Sans 3 is the default for interface text, prose, questions, and demo controls. Lesson headings (prose `h1`/`h2`) and titles use Newsreader at 500–600. A user's explicit reading-font preference applies consistently to interface and titles.
- Type scale: 12 (monospace metadata only), 13 (UI floor), 15, 17 (reading), 22, 30, 40. No hard-coded sizes outside the scale.
- Reserve monospace for code and numeric metadata. Retain the 17px/27px reading baseline and existing reading-size settings.
- Below 640px, oversized Markdown tables shrink proportionally to fit their container, stopping at 13px effective text. Wider tables remain horizontally swipeable with hidden scrollbars and visible keyboard focus. Tables that already fit keep their reading size; Copy controls stay unscaled (owner, 2026-10-28).
- Use spacing and headings for grouping. Remove structural separator lines between panes, headers, footers and settings/chain rows. Retain input, choice, selection and focus boundaries. Resize handles remain available on hover and keyboard focus.
- Raised surfaces, selection, borders and muted text use the shared Study ink tokens. Chart data keeps its own colors. Preserve explicit custom background and reading preferences.
- Scrollbar tracks and thumbs stay hidden across app-owned content and rendered demos. Preserve wheel, touch, keyboard and programmatic scrolling, visible focus and access to overflow content. The project scrolling rule lives in AGENTS.md.
- Session icons retain their lesson/practice meaning with a shared size and stroke. Running and waiting status occupy a separate trailing slot. App and demo headers share a 52px alignment; native window gutters and drag regions remain.

## Home

One scrolling column (`max-w-[52rem]`, hidden scrollbar), in this order. Section headings, their text and the rows share one left edge with the page title.

1. "What do you want to learn?" (title serif, 30px) over the topic composer. The field's placeholder is "A topic, a question, or a chapter to work through" ("What do you want to practice?" in practice mode); the Teach | Practice switch, the pick bar and the setup gates stay as they are.
2. "Waiting for you" (22px, 600) with "{n} open" in meta: one raised 10px row per unanswered check or open problem across sessions, newest posed first. The kind ("Lesson check", "Prediction", "Question", "Explain", "Recall", "Problem") is the only amber; then session title · time in meta (a long title truncates, the time never does), the teaser on one line at reading size (two lines on phones, where meta and the action share the last row), and a quiet Answer or Solve (raised-2, never amber) that opens the session with the prompt bar expanded on that item. After those rows, one "Lesson" row per lesson whose plan still has a topic never checked (feature 003), most recently active first: session title · time since last active in meta, "{left} of {total} topics left · next: {topic}" in the teaser slot, and a quiet Continue that opens the lesson at the bottom with "Continue with {topic}" in an empty composer (never replacing a draft, never sent). A waiting lesson with topics left stays one Answer row and carries the same progress line under its teaser (14px, muted; it wraps on phones). "{n} open" counts every row. Empty: the heading and "Nothing is waiting. Every check is answered and every problem solved." Loading uses row skeletons; failure says so with Try again; a failed refresh keeps the list. No centred icon or illustration anywhere on Home.
3. "Calibration" (22px, 600; feature 004), between "Waiting for you" and the knowledge graph, hidden until a graded answer with confidence exists: one plain line per used level in the order Guessing, Unsure, Fairly sure, Certain ("Certain · 61 answers · 51 right (84%)", the percent only from 5 answers), then the muted 14px subheading "Wrong while Certain" with the newest 5 misses as raised rows without a kind label (session · time in meta, the question on one line, a quiet Review that opens the session at the teacher message before the check) and a "Show all {n}" secondary button that expands in place. No misses: "None yet. Every answer you marked Certain was right."
4. "Knowledge graph" with "{n} ideas · {m} chains" in meta (hidden on phones), Import notes and Expand in the header. The live graph sits in a raised 10px box, 420px tall (260px on phones); search, Chains, cost and running pipelines float inside it. Expand turns the same element into a full-screen dialog (camera, selection and search kept); Close or Escape returns focus to Expand. The chain table covers the whole Home content area. An empty graph shows one sentence: "Start a session or import notes to build your graph." With graph rendering off, the minimal summary fills the same box.

## Sidebar

- Header: the Search field (raised) with the session filter at its right end (visibly on, raised-2 and foreground ink, while not "All sessions"), then one labelled "New" (raised-2, plus icon) opening a menu with Lesson and Practice. Menus are raised-2, 10px, no border.
- Rows: type icon, the whole title (15px/20px, wrapping, never truncated), then a 7px amber dot named "Waiting for you" when the session waits on the learner, or the running indicator while a turn runs, then the time.
- Date shelves (Today, Yesterday, Earlier) are set in the title serif at 17px; their counts stay sans meta.
- Settings opens only from the gear in the sidebar footer (and its shortcut). The graph's display controls live in Settings → Graph → Display.

## Lessons and controls

- Transcript blocks share one reading edge: assistant prose, the user turn (a raised 10px block with a "You" label), agent thinking rows and phase running heads ("Planning", "Teaching", left-aligned, no rule) all start on the same x. While the workspace shows a demo, its place in the lesson is a single row linking to it. The turn rail appears from three turns.

### Prompt bar

One raised shell, four zones in fixed order; only their contents change.

1. Turn strip: "Your turn" in the accent plus the kind (Lesson check, Question, Prediction, Explain, Recall, Problem) and a collapse control. Collapsed while reading history, the strip replaces the prompt body: label, a one-line teaser (markdown rendered or stripped) and an Answer or Solve button. The answer well stays, so a draft is never hidden.
2. Prompt body: the question at reading size, any note in secondary ink, choices as full-width rows, then confidence with "I don't know" as a text button. Only this zone scrolls; a fade at its bottom edge shows there is more.
3. Answer field: sits directly on the shell, no inner box, fill or label. The placeholder says what to write: "Explain your reasoning, or leave blank to submit your choice" (choice questions), "Type your answer" (free-text questions), "Work through the problem here" (practice problems). Opening a free-text question or a problem with Answer, Solve, Enter or a Home link focuses the field on fine pointers, so the caret shows; choice questions keep focus for arrow-key option walking, and phones do not raise the keyboard (owner, 2026-10-28).
4. Toolbar: labelled model and thinking triggers ("Choose a model" and "Thinking" when unset, never "—") and the usage ring with a percentage ("?" when the limit is unknown). Without a key or models, the toolbar shows "Add a provider key" or "Set up your models" in their place. It ends in one primary action named with a verb: Submit answer, Submit (with Skip beside it on practice problems; Skip takes the Escape confirmation), Next problem, Stop. Plain chat keeps the round send.

Queued steers sit above the shell as right-aligned rows; each has a × ("Remove queued message: {text}", 44px on coarse pointers) that withdraws it before delivery, with no confirmation or undo. If the agent already had it, the row reads "Already sent" until its card lands; a failed removal reads "Could not remove". Scroll-to-latest sits just above the shell's top-right edge. On phones it sits instead in its own 48px band above the shell, below the queued rows, on the ground color, present only while the button shows; this is the one opaque band above the prompt bar (owner, 2026-10-28), so the button never covers transcript text.

- An active lesson question or practice problem follows the floating composer as a compact summary. Tapping expands its content and applicable choices/confidence controls without losing drafts or selection. Reading history compacts it again. Historical answered/dismissed content stays in the transcript.
- Keep the composer mounted through presentation changes. Scrolling into history compacts it until the conversation bottom, where it animates to expand. Editing expands it; do not compact during focus or input composition. Reduced motion preserves the state change without the animation.
- A measured tail spacer keeps the last content reachable. No divider or opaque footer band cuts off the transcript. On mobile, expanded question content occupies at most half the available visual viewport and scrolls internally with hidden tracks. Keep the answer input reachable above the software keyboard.
- Normal answer, question reasoning, confidence, and practice controls remain. The separate reading-thinking field is removed.
- Model and reasoning selectors appear directly in the composer toolbar, with usage as its own control. Escape closes the innermost menu first. Demo expand, brightness, and download icons share the workspace title row. Existing session navigation and sidebar resizing remain.

### Math check

- A `math_check` call (feature 007) is one quiet row in the tool-card register, not a card, on the transcript's reading edge like every quiet row (tool calls included). Its headline always reads "Wolfram · {verdict}": "Wolfram · equal" (with a check mark), "Wolfram · not equal", "Wolfram · couldn't decide", "Wolfram · check failed" (destructive ink), or "Wolfram · check not finished" (owner, 2026-10-28). Collapsed by default. Expanded, it shows the checked `lhs = rhs`, assumptions, counterexample or reduced form in monospace, and the time taken. Wolfram's raw reply appears only when it couldn't decide; a failure's reason is a sentence in the interface font and destructive ink. Only the headline row is unselectable, so expressions can be copied. No amber.
- While it runs, the row shows only "Checking with Wolfram…" with the spinner. The input is never shown live.
- A check made before a question renders nothing until that question is answered or the problem concluded. A grading check during an active problem shows the verdict and "Expressions shown after the problem is concluded".
- Answered quiz and explain cards and conclude cards whose answer was checked end with a muted line, a check mark and "Checked with Wolfram". The words carry the meaning, and the icon is decoration.

## Settings and secondary views

- Settings uses searchable icon categories, a Settings / section header, grouped fields and a live reading preview. Category navigation scrolls horizontally on narrow screens; field controls stack below labels.
- Settings, setup and connection dialogs contain focus. Menus portal into the active modal boundary. Closing returns focus to the opening control; settings retain immediate persistence and existing section/row deep links.
- Home, chains and activity share the same surface and control tokens. Loading, empty and failed requests remain distinct; refresh failures retain the last successful data. Home's layout is described under Home above.

## Demos

- A question's exact demo reference opens the workspace automatically once for that question. Closing or switching it is respected.
- One live iframe serves the inline, workspace, and focused presentations. Its original location shows a preview while the workspace is active.
- Kit graph focus uses a native modal dialog and places parameters to the right. Narrow viewports use a collapsible lower parameter area.
- Expand animates from the selected graph. Reduced motion removes that transition. Escape and Close restore focus and reading position without resetting simulation state.
- Legacy HTML expands as a whole demo. Do not infer graph boundaries or extract arbitrary controls.
- Preserve the sandbox. Bridge messages require the expected source window and validated payload fields.
- Appearance changes update the live iframe's theme bridge without replacing its document. Preserve parameter values, simulation history and 3D camera; authored demo CSS may override injected defaults.
- Quick plots (feature 005) are demos: a checked `plot` renders in the agent's reply with the same card, workspace, expand, download and invert as a delivered demo, and joins the session's demos for bold-title links. A plot that failed its check shows only the quiet tool card; the agent explains in words.

## Course track

- The plan popup shows a "Course" section below the diagram when the lesson has a recorded syllabus (feature 006): the heading with the course title (linked) and "{covered} of {items} covered", then one raised 10px row per item in course order — kind (Lecture, Problem set, Notes, Reading) in muted meta, the title (linked, new tab, underlined), "Topics: …" in muted 14px, and the state ("Covered" in the ink, "Not yet" and "Not in this lesson's plan" muted). With a syllabus the popup scrolls and the diagram keeps 60vh (at least 280px). Home's lesson rows append " · Course: {covered} of {items} covered" to the progress line.
