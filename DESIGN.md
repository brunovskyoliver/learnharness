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
- A labelled "Library" row sits under the header, above the date shelves.
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

### Lookup rows

- ML/source tools (feature 008) follow the math-check row skeleton: the same reading-edge wrapper, summary, chevron and selectable expanded panel. Headlines use “Hugging Face · {what}”, “Semantic Scholar · {n} papers for '{query}'”, “arXiv · {title}” and “Read · {title} · pp. {pages}”. Failures use “Hugging Face · lookup failed”, “Papers · search failed” or “Read · failed”, with the reason in sans and destructive ink. No amber.
- Running rows show only the spinner and shimmer with “Looking up on Hugging Face…”, “Searching papers…”, “Reading a paper…”, “Drawing a panel…” or “Tokenizing…”. Never show inputs live. Successful tokenize rows read “Tokenized · {count} tokens ({encoding})” (“1 token” when singular) and show the text and each token in words (`␣world 1917`, bytes as `<0xF0>`), never raw JSON; failed or unfinished tokenize calls use the generic tool row. Counts take the singular at one (“1 model”, “1 paper”), and a single page reads “p. 4”. A checked plot or panel that failed its check reads “Plot · failed its check” or “Panel · failed its check”, never the tool name.
- Hub model fields use a two-column grid: labels in words, raw keys and values in monospace. Papers show linked titles and available author/year/id/PDF metadata. Read rows show page links and “{n} of 10 pages this turn”. Links use ink with a 40% underline, open in a new tab with `rel="noreferrer"`, and name the destination accessibly. Only summaries are unselectable. Every link in a lookup row opens on plain Enter when keyboard-focused. Feature 008 rows, the ML demo toolbar and the three new toggles show keyboard focus in ink instead of the amber ring, and page citations in prose are ink (owner, 2026-10-29); other links and controls keep their existing rules.
- Settings → Agent adds ML visuals, Model hub and Papers after Math check through the existing SettingsRow/Toggle. The hints are “Shows tokens, attention, sampling, networks and shapes as interactive panels”, “Looks up model configs, datasets and papers on Hugging Face” and “Finds papers on arXiv and Semantic Scholar and cites their pages”. Accessible names are “tool ml visuals”, “tool model hub” and “tool papers”.
- Binding reference: [008 canvas](https://claude.ai/artifact/EmWdcYcnZrXu5Ng1VyHiA6), Rows board and [UI contract](specs/008-ml-llm-lab/contracts/ui-contract.md).

## Settings and secondary views

- Settings uses searchable icon categories, a Settings / section header, grouped fields and a live reading preview. Category navigation scrolls horizontally on narrow screens; field controls stack below labels and take the row's width.
- Section titles are the title serif at 22px and group titles at 17px. Rows sit in a raised 10px group with no separators. Inputs and choices use the 14% edge; menus are raised-2, 10px, no border. Sliders use ink, not amber.
- "Search settings" matches every row's name and hint. Results list under their category headings in the navigation column ("Nothing matches {query}" otherwise). Choosing one or pressing Enter clears the search, opens the section, scrolls to the row, focuses its first control and shows a raised-2 highlight for 160ms. Escape clears a non-empty search before it closes the dialog.
- While loading, a section shows its title over row skeletons. A failed load reads "Settings could not be loaded." with Try again. A failed save stays pinned at the top of the column: "Your {section} settings could not be saved.", Show details for the raw reason, and Try again repeating that save. The row keeps showing what is stored. Providers, models, prompts and graph display each state their own failure with Try again.
- Settings, setup and connection dialogs contain focus. Menus portal into the active modal boundary. Closing returns focus to the opening control; settings retain immediate persistence and existing section/row deep links.
- Home, chains and activity share the same surface and control tokens. Loading, empty and failed requests remain distinct; refresh failures retain the last successful data. Home's layout is described under Home above.
- Unavailable rows in Settings and the graph display panel use the muted ink token on label and hint with a locked control, never opacity. This replaces the 2026-09-20 ruling (owner, 2026-10-30).

## Library, @ list and page pane

Feature 009; the binding reference is its [UI contract](specs/009-library-canvas/contracts/ui-contract.md). All surfaces use Study ink tokens, with no amber except keyboard focus and the primary action.

### Library view

- The sidebar has one labelled row, "Library" (`LibraryIcon`, 15px), under Search and New and above the date shelves. It links to `/library` and carries `aria-current="page"` there.
- `/library` is one column, `max-w-[52rem]` like Home, under the shared top bar: the title "Library" (title serif, 30px), "Upload" and "New page" (raised-2, neither primary), then the "Search your Library" field, which filters names on the client.
- Rows are raised, 10px. The name is 15px and wraps. The meta line is `{Kind} · {size} · {date}`, plus "Made by the agent" or "No text could be read" when true. Clicking the row opens the item ("Open {name}"); "Rename {name}" and "Delete {name}" are named buttons.
- Upload is a file picker and a drop on the page, with a row and a percent per upload in flight. Refusals name the file and the reason and stay until dismissed.
- A name clash asks "{name} is already in your Library." with "Keep both as {suggested}" and "Cancel". Originals are never replaced.
- The delete dialog follows the session one: "Delete {name}?" and, for a page, "Its whole version history goes too." The name is in the interface font.
- Empty: "Nothing here yet. Upload a document or start a page." Loading uses row skeletons. Failed: "Your Library could not be loaded." with Try again. A failed refresh keeps the list.
- Pages open in the pane. Markdown, text, code and CSV open read-only with "This is your original; it can't be edited here." PDF and images open in a new tab. Over 1 MiB of text shows "Too long to preview" and Download.

### @ list

- It opens above the field, inside the prompt shell's width: raised-2, 10px, no border, up to 6 rows scrolling with hidden tracks. A row is the name, then `{Kind} · {size}` in meta, at least 44px on coarse pointers.
- The textarea is a `combobox` over a `listbox`. Up and Down move, Enter or Tab insert `@name ` at the token and keep focus, and Escape closes only the list. Clicking keeps focus in the field.
- No match shows "Nothing matched" as a status: Enter does the field's normal action, Tab inserts nothing and the text stays. A space after an unmatched query closes the list. "Your Library is empty.", "Loading your Library…" and "Your Library could not be loaded." leave the draft untouched.
- It serves the chat, Home and new-session composer, both question fields and the practice field. When the text has references, one muted 13px line in the answer well reads "Attaching {name}, {name}".
- Sent messages show one quiet, always visible row per reference on the reading edge (13px, `ink-2`, the name in foreground), with the mode and reason worded as in the contract.

### Page pane

- A resizable pane shared with the demo workspace shows a demo or a page; the most recent explicit open wins and the one live iframe stays mounted. A question's automatic demo open does not replace an open page.
- The 52px header holds the page name (click to rename), a muted save state ("Saved", "Saving…", "Draft saved", "Not saved. Your text is kept in this browser." with Try again), History and close. The body is one rich-text surface at reading size, with no separate preview pane.
- Cmd/Ctrl+S saves a version. Escape returns focus to the transcript on desktop and closes the layer on phones.
- A conflict shows "This page changed elsewhere. Your text is safe here." with "Keep mine" and "Use latest". An agent update on a clean page shows "Updated by the agent · version {n}" for 4s and announces it in a live region.
- History lists `Version {n} · {You | Agent} · {time}`, with a read-only preview and "Restore this version".
- Below 768px the pane is a full-screen layer with contained focus and "Back to chat". The composer's draft stays mounted underneath.
- Transcript rows follow the math-check skeleton with no amber: "Page · created {name}", "Page · revised {name} · version {n}", "Page · couldn't revise, it changed", "Page · failed", "Library · read {name}" and "Library · failed". Running rows show only the spinner and activity label.

## Demos

- A question's exact demo reference opens the workspace automatically once for that question. Closing or switching it is respected.
- One live iframe serves the inline, workspace, and focused presentations. Its original location shows a preview while the workspace is active.
- Kit graph focus uses a native modal dialog and places parameters to the right. Narrow viewports use a collapsible lower parameter area.
- Expand animates from the selected graph. Reduced motion removes that transition. Escape and Close restore focus and reading position without resetting simulation state.
- Legacy HTML expands as a whole demo. Do not infer graph boundaries or extract arbitrary controls.
- Preserve the sandbox. Bridge messages require the expected source window and validated payload fields.
- Appearance changes update the live iframe's theme bridge without replacing its document. Preserve parameter values, simulation history and 3D camera; authored demo CSS may override injected defaults.
- Quick plots (feature 005) are demos: a checked `plot` renders in the agent's reply with the same card, workspace, expand, download and invert as a delivered demo, and joins the session's demos for bold-title links. A plot that failed its check shows only the quiet tool card; the agent explains in words.

### ML panels

- Chats containing completed ML/source results or composed ML panels use native Tab/Shift+Tab traversal. Keyboard-focused lookup summaries and paper page links keep native Enter activation, including while a question is active or collapsed. Ordinary chats and pointer-focus Enter behavior keep their existing rules (owner, feature 008).
- Six demo-kit kinds use the existing card, sandbox and kit controls: tokens, next-token bars, heatmap, network, scatter and shapes. All have Expand. Heatmap, next-token and scatter heads carry plain muted “Illustrative numbers”, before Expand; below 560px it moves under the title. No amber in feature 008, including data series (owner override).
- Bodies use kit tokens with no nested cards, borders, shadows or decorative gradients. Existing input edges and focus/selection outlines remain. Primary actions use ink fill. Dense chips, cells, points and neurons have one roving tab stop with arrows and Enter/Space pinning. Hover and focus produce matching live readouts and accessible names. Numeric values are tabular; monospace is reserved for token ids, gradients and tensor shapes.
- Token splits come from the server's pinned tokenizer. Text edits debounce 300ms through the validated local-only bridge; previous chips stay at 60% while “Updating…”. Errors retain the previous split; downloaded demos say “Editing works in the app”. Sampling recomputes temperature, top-k and top-p in the order Hugging Face transformers uses (top-k, renormalise, top-p, renormalise), writes cut reasons, and draws only retained tokens. Each row has an accessible name and updates the readout on hover and focus. A temperature, top-k or top-p bound to a demo parameter has only the demo's slider; the panel shows its own slider only for unbound values. A supplied title keeps its heading with `After “{context}”` above the bars; otherwise that phrase is the heading. Valid supplied slider values extend the bounds without clamping.
- Heatmaps expose every value, highlight its row/column labels and include a min/mid/max legend. Sequential colours run ground to blue; diverging colours run blue through ground to red. Omitted bounds derive from the data, including zero for diverging scales. Values print only at ≥44px cell width. Column and row labels stay on one line (ellipsis for long labels, the full label in the readout); grids keep at least 40px per column and scroll inside the panel instead of squeezing. Network steps compute forward/backward values locally, show signed gradients and label edge signs in words. Scatter arithmetic and distance are computed locally. Shapes start on their first step; changed dimensions have a raised fill/ink edge and a derived previous-shape → current-shape explanation.
- Captions appear beneath each panel. Linked panels match exact raw labels; heatmap cells broadcast their key-column label. Focus preserves values, text, selections and camera, moves local/global controls into one sidebar and uses one phone Parameters toggle. Overflow stays inside the panel with hidden scrollbars; layouts work at 320/390/1440 and coarse targets are ≥44px. Transitions are at most 160ms and disappear under reduced motion.
- Binding reference: [008 canvas](https://claude.ai/artifact/EmWdcYcnZrXu5Ng1VyHiA6) and [UI contract](specs/008-ml-llm-lab/contracts/ui-contract.md), with owner clarifications recorded in [progress](specs/008-ml-llm-lab/progress.md).

## Course track

- The plan popup shows a "Course" section below the diagram when the lesson has a recorded syllabus (feature 006): the heading with the course title (linked) and "{covered} of {items} covered", then one raised 10px row per item in course order — kind (Lecture, Problem set, Notes, Reading) in muted meta, the title (linked, new tab, underlined), "Topics: …" in muted 14px, and the state ("Covered" in the ink, "Not yet" and "Not in this lesson's plan" muted). With a syllabus the popup scrolls and the diagram keeps 60vh (at least 280px). Home's lesson rows append " · Course: {covered} of {items} covered" to the progress line.
