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
- Use spacing and headings for grouping. Remove structural separator lines between headers, footers and settings/chain rows. The exception is the left and right sidebars: each has a full-height 1px edge-colored divider with a small grip at its middle (owner, 2026-10-31). Retain input, choice, selection and focus boundaries. The dividers are the resize handles: they brighten on hover and take the focus color on keyboard focus.
- Raised surfaces, selection, borders and muted text use the shared Study ink tokens. Chart data keeps its own colors. Preserve explicit custom background and reading preferences.
- Scrollbar tracks and thumbs stay hidden across app-owned content and rendered demos. Preserve wheel, touch, keyboard and programmatic scrolling, visible focus and access to overflow content. The project scrolling rule lives in AGENTS.md.
- Session icons retain their lesson/practice meaning with a shared size and stroke. Running and waiting status occupy a separate trailing slot. App and demo headers share a 52px alignment; native window gutters and drag regions remain.

## Home

One scrolling column (`max-w-[52rem]`, hidden scrollbar), in this order. Section headings, their text and the rows share one left edge with the page title.

1. "What do you want to learn?" (title serif, 30px) over the topic composer. The field's placeholder is "A topic, a question, or a chapter to work through" ("What do you want to practice?" in practice mode); the Teach | Practice switch, the pick bar and the setup gates stay as they are.
2. "Waiting for you" (22px, 600) with "{n} open" in meta: one raised 10px row per unanswered check or open problem across sessions, newest posed first. The kind ("Lesson check", "Prediction", "Question", "Explain", "Recall", "Problem") is the only amber; then session title · time in meta (a long title truncates, the time never does), the teaser on one line at reading size (two lines on phones, where meta and the action share the last row), and a quiet Answer or Solve (raised-2, never amber) that opens the session with the prompt bar expanded on that item. After those rows, one "Lesson" row per lesson whose plan still has a topic never checked (feature 003), most recently active first: session title · time since last active in meta, "{left} of {total} topics left · next: {topic}" in the teaser slot, and a quiet Continue that opens the lesson at the bottom with "Continue with {topic}" in an empty composer (never replacing a draft, never sent). A waiting lesson with topics left stays one Answer row and carries the same progress line under its teaser (14px, muted; it wraps on phones). One "Flashcards" row follows when cards are due (see Review). "{n} open" counts every row. Empty: the heading and "Nothing is waiting. Every check is answered and every problem solved." Loading uses row skeletons; failure says so with Try again; a failed refresh keeps the list. No centred icon or illustration anywhere on Home.
3. "Calibration" (22px, 600; feature 004), between "Waiting for you" and the knowledge graph, hidden until a graded answer with confidence exists: one plain line per used level in the order Guessing, Unsure, Fairly sure, Certain ("Certain · 61 answers · 51 right (84%)", the percent only from 5 answers), then the muted 14px subheading "Wrong while Certain" with the newest 5 misses as raised rows without a kind label (session · time in meta, the question on one line, a quiet Review that opens the session at the teacher message before the check) and a "Show all {n}" secondary button that expands in place. No misses: "None yet. Every answer you marked Certain was right."
4. "Knowledge graph" with "{n} ideas · {m} chains" in meta (hidden on phones), Import notes and Expand in the header. The live graph sits in a raised 10px box, 420px tall (260px on phones); search, Chains, cost and running pipelines float inside it. Expand turns the same element into a full-screen dialog (camera, selection and search kept); Close or Escape returns focus to Expand. The chain table covers the whole Home content area. An empty graph shows one sentence: "Start a session or import notes to build your graph." With graph rendering off, the minimal summary fills the same box.

## Sidebar

- Header: the Search field (raised) with the session filter at its right end (visibly on, raised-2 and foreground ink, while not "All sessions"), then one labelled "New" (raised-2, plus icon) opening a menu with Lesson and Practice. Menus are raised-2, 10px, no border.
- Rows: type icon, the whole title (15px/20px, wrapping, never truncated), then a 7px amber dot named "Waiting for you" when the session waits on the learner, or the running indicator while a turn runs, then the time.
- Date shelves (Today, Yesterday, Earlier) are set in the title serif at 17px; their counts stay sans meta.
- Under the header, above the date shelves: "Lessons" and "Practice" with their counts, which narrow the list below (raised-2 while on, a second press clears), then "Library" with a chevron for its folder tree (features 012-014), then "Review" (feature 021). The tree lists folders by name, 13px `ink-2`, indented by depth; it fetches only while open and keeps the current folder visible. Loading uses skeletons, empty reads "No folders yet.", failed reads "Folders could not be loaded." with Try again.
- The footer holds Settings and the command palette's icon, which is the touch path to it.
- Settings opens only from the gear in the sidebar footer (and its shortcut). The graph's display controls live in Settings → Graph → Display.

## Workspace tabs and command palette

Features 014 and 015; decisions in [their spec](specs/014-workspace-navigation/spec.md). No amber except keyboard focus.

### Tabs

- A row directly under the 52px band on sessions and the Library, and on Home and new sessions once tabs exist. It is never in the band, so drag regions and native gutters don't change. 36px tall, 48px on coarse pointers.
- A tab is a type icon, the title (13px, truncating at 13rem, whole in its tooltip) and a × named "Close {title}". Selected is raised-2, also on screen is raised, the rest are `ink-2`. A loading tab swaps its icon for the running indicator.
- Visiting a session or opening an item in the pane opens its tab, up to 12. PDFs hold a tab like a page. Images and other files open as in the Library, without a tab.
- The strip ends in "Hide right pane" or "Show right pane" from 768px.

### Right pane

- One column, one saved width. A page or demo holds it as described below. With neither, the toggle shows the context view: 52px header, then for a session "Outline" and "Demos", for a Library place "Location", "Tags here" and "Recently opened". It has no iframe.
- Collapsing takes the column to no width with everything mounted. Any explicit open expands it. Below 768px the page layer and demo sheet are unchanged. With neither up, the toggle opens the context view as a full-screen layer with "Back to chat" (feature 023); it is never saved.

### Command palette

- Cmd/Ctrl+K, or the sidebar's footer icon. A raised-2 10px dialog near the top: the field reads "Search or run an action…", then the list. Rows are an icon, the label and meta, 36px, 44px on coarse pointers; the active row is on `card`.
- With no query: Actions, Sessions, Library and Folders. With one: a single ranked list. No match reads "Nothing matched". Each source reports for itself: "Loading your Library…", "Your Library could not be loaded." with Try again, and the same for sessions, with the rest still usable.
- A view that fails to render reads "This view could not be shown." with Try again and Show details, inside the shell.

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

- The sidebar's "Library" row (`LibraryIcon`, 15px) sits under Lessons and Practice, above the date shelves. It links to `/library` and carries `aria-current="page"` there.
- `/library` is one column, `max-w-[52rem]` like Home, under the shared top bar: the title "Library" (title serif, 30px), "Upload" and "New page" (raised-2, neither primary), then the "Search your Library" field, which filters names on the client.
- Folders (feature 011): "New folder" sits beside Upload and New page (raised-2). Inside a folder the title is the folder's name, under breadcrumbs ("Library / Physics / Waves", 13px `ink-2`, the current one in foreground with `aria-current="page"`). Folder rows come before items: folder icon, name, `Folder · {n} items`, then "Open folder", "Rename folder", "Move folder" and "Delete folder" with the name. "Move {name} to" is a dialog listing every allowed folder by its path. Searching covers the whole Library and appends each match's location to the meta line. An empty folder reads "This folder is empty."; a missing one "That folder is no longer in your Library." with Back to Library.
- Views (feature 012): a "Library views" row of links under Search: All, Favorites, Recent, Archive, Trash, the current one on raised-2 with `aria-current`. Tags appear as a second row of links once any exist. Favorites and pins show as small `ink-2` star and pin icons before the name; pinned entries sort first at every level.
- Delete moves to the trash: "Move {name} to the trash?" with "You can restore it from Trash." Everything in a folder goes with it. Trash rows have Restore and "Delete for good", which alone confirms "Delete {name} for good?" with "This can't be undone." A restored name that is taken steps as in a clash.
- Sorting and layout (feature 013): Sort, direction and Type controls, the two choices being menus with a check on the current one, then the list and grid icons at the row's end. Sort and layout persist per browser. "Select" turns on a checkbox per row and a sticky raised-2 toolbar: "{n} selected", Move to…, Favorite, Tags…, Archive and "Move to the trash". A bulk failure names each item and its reason and the rest still happen.
- Every row has a More menu (⋯), and the same list on right-click: Rename, favorites, pin, Tags… (items), Move to…, Archive, Move to the trash. Below 640px the Rename icon hides. Rows drag onto a folder or the breadcrumbs above; a selection drags together. Move to… is the keyboard and touch path.
- Rows are raised, 10px. The name is 15px and wraps. The meta line is `{Kind} · {size} · {date}`, plus "Made by the agent" or "No text could be read" when true. Clicking the row opens the item ("Open {name}"); "Rename {name}" and "Delete {name}" are named buttons.
- Upload is a file picker and a drop on the page, with a row and a percent per upload in flight. Refusals name the file and the reason and stay until dismissed.
- A name clash asks "{name} is already in your Library." with "Keep both as {suggested}" and "Cancel". Originals are never replaced.
- Empty: "Nothing here yet. Upload a document or start a page." Loading uses row skeletons. Failed: "Your Library could not be loaded." with Try again. A failed refresh keeps the list.
- Pages open in the pane. Markdown, text, code and CSV open read-only with "This is your original; it can't be edited here." PDFs open in the reader (features 019-020). Images open in a new tab. Over 1 MiB of text shows "Too long to preview" and Download.

### @ list

- It opens above the field, inside the prompt shell's width: raised-2, 10px, no border, up to 6 rows scrolling with hidden tracks. A row is the name, then `{Kind} · {size}` in meta, at least 44px on coarse pointers.
- The textarea is a `combobox` over a `listbox`. Up and Down move, Enter or Tab insert `@name ` at the token and keep focus, and Escape closes only the list. Clicking keeps focus in the field.
- No match shows "Nothing matched" as a status: Enter does the field's normal action, Tab inserts nothing and the text stays. A space after an unmatched query closes the list. "Your Library is empty.", "Loading your Library…" and "Your Library could not be loaded." leave the draft untouched.
- The last option in every field is "New page", styled like any row, under any status line. Choosing it creates a blank page ("Untitled page", a clash stepping as in the Library), opens it in the pane and inserts `@name `; it sends nothing and calls no model. With no match, Enter stays the field's own until an arrow reaches the row. With no pane on screen, the page opens on the next screen that has one. A failed create shows "New page · {reason}" under the field and keeps the draft (owner, 2026-10-31).
- It serves the chat, Home and new-session composer, both question fields and the practice field. When the text has references, one muted 13px line in the answer well reads "Attaching {name}, {name}".
- Sent messages show one quiet, always visible row per reference on the reading edge (13px, `ink-2`, the name in foreground), with the mode and reason worded as in the contract.

### Page pane

- A resizable pane shared with the demo workspace shows a demo or a page; the most recent explicit open wins and the one live iframe stays mounted. A question's automatic demo open does not replace an open page.
- The 52px header holds the page name (click to rename), a muted save state ("Saved", "Saving…", "Draft saved", "Not saved. Your text is kept in this browser." with Try again), History and close. The body is one rich-text surface at reading size, with no separate preview pane.
- Cmd/Ctrl+S saves a version. Escape returns focus to the transcript on desktop and closes the layer on phones.
- A conflict shows "This page changed elsewhere. Your text is safe here." with "Keep mine" and "Use latest". An AI edit never lands on the page: it waits under Held edits until he accepts. An accepted edit or an update from elsewhere on a clean page shows "Updated by the agent · version {n}" for 4s and announces it in a live region.
- History lists `Version {n} · {You | Agent} · {time}`, with a read-only preview and "Restore this version".
- Below 768px the pane is a full-screen layer with contained focus and "Back to chat". The composer's draft stays mounted underneath.
- Transcript rows follow the math-check skeleton with no amber: "Page · created {name}", "Page · revised {name} · version {n}", "Page · couldn't revise, it changed", "Page · failed", "Library · read {name}" and "Library · failed". Running rows show only the spinner and activity label.

### Page editor tools

These come from feature 010. Every string is in specs/010-page-editor-tools/contracts/ui-contract.md.

- **Text area**: no border or outline when focused (owner, 2026-10-31). The caret shows focus.
- **Header**: the save state is followed by "· {n} words". Formulas, code and images are not counted. Outline, Export and History sit beside it. Below 768 px these three show as named icons.
- **Toolbar**: a `surface-raised` row above the text, wrapping as it narrows. It holds:
  - undo and redo;
  - a text style select;
  - bold, italic, strikethrough, inline code and link;
  - lists, checklist and quote;
  - formula, table and image;
  - "Ask the tutor" at the end.
  Each button's name carries its shortcut, and unavailable buttons use muted ink, never opacity.
- **Table controls**: while the caret is in a table, a row of text buttons sits under the toolbar.
- **Slash menu and link popover**: both are `surface-raised-2` panels inside the editor.
  - The slash menu opens on "/" at the start of an empty line. Escape closes only the menu.
  - The link popover (Ctrl/Cmd+K) has a labelled field.
- **Placeholder**: an empty page shows one muted sentence. It is a decoration and never stored.
- **Selection bubble**: a `surface-raised-2` toolbar over selected text with Bold, Italic, Link, then Explain, Simpler, "Quiz me on this" and Ask….
  - While a question waits, a problem is active or the tutor is answering, the tutor's actions are replaced by one sentence saying why.
  - Explain, Simpler and Quiz me send at once; Ask… only fills the composer. From the Library they open a new session.
  - Feature 018 adds Summarize, Rewrite, Expand, Challenge and "Generate questions", in the order Explain, Simpler, Summarize, Rewrite, Expand, Challenge, Quiz me on this, Generate questions, Ask…. All but Ask… send at once. Simpler, Rewrite and Expand propose a change, through Held edits below. The rest answer in chat, and questions are graded checks that stay out of the page. The bubble wraps at 22rem.
- **Tutor changes**: AI edits wait for Accept (Held edits below), so this bar only shows on versions the agent wrote before that rule. A `surface-raised` bar ("The tutor changed {n} places · version {v}") with Previous, Next, "Undo the tutor's edit" and Done. Done is the one amber action.
  - The tutor's blocks sit on the `accent` step. Removed text is struck through in muted ink.
  - Done or closing the page clears them, and typing does not.
- **History**: opens on Changes, which shows added and removed blocks against the version before, each labelled in mono with its word and colour. Full text shows the rendered version. Versions can be named and copied.
- **Outline**: a column beside the text when the pane is at least 720 px wide, otherwise a list above it.
- **Export**: Copy as Markdown, Download .md, and Print. Print shows only the page, in Study ink's paper colours.
- **Images**: pasted, dropped or chosen images become Library images. An upload shows one progress line. A missing image shows its alt text on the `card` step.

### Notes

Features 016-018. Every string is in [their plan](specs/016-intelligent-notes/plan.md). No amber except keyboard focus and a dialog's Done.

- **Wiki links**: `[[Page name]]` in the text, an underlined inline atom showing the item's current name. A dangling or deleted one is muted with a dotted underline (deleted also struck through), and its accessible name says which. Clicking, or Ctrl/Cmd+Enter beside it, follows it. A dangling link's line reads "Nothing in your Library is called {name} yet." with Create page and Dismiss.
- **`[[` list**: a `surface-raised-2` panel inside the editor, built like the slash menu, up to 8 rows with kind in meta. A typed name with no page gets a row "Link it now, make the page later". Escape closes only the list.
- **Header**: Links sits between Outline and Export. In a pane under 720 px wide all four show as named icons, so the page's name keeps its room.
- **Links panel**: a column beside the text when the pane is at least 720 px wide, otherwise a `surface-raised-2` block above it, 40dvh at most. Sections: Links to this page, Links from this page, Related notes, Lessons, Ideas in your graph. Each row is a 13px name with muted meta beneath, and each section has its own empty sentence.
- **Callout**: a `card` block, 10px, no side rule and no colour by kind. A head row holds the type select and a title field.
- **Collapsible section**: a chevron button, then the title (500 weight), then the body indented to the title. Closed hides the body. The state is stored.
- **Saved passage**: a quote ending in a link, "Lesson: {title}". Following it jumps to the message, which flashes as a graph link's does. If the session is gone the link is muted and followed by "· this session was deleted, so the source is gone".
- **Save to a page**: a small `surface-raised-2` button over selected teacher prose, under it on coarse pointers. It opens a `card` dialog: the passage, one field that filters pages or names a new one, then the rows.
- **This session**: the context view starts with Notes: the session's pages, then "Turn this lesson into study notes" on lessons.

### Held edits

Feature 023. No AI edit changes the page until he accepts, from a selection's action or an ordinary turn.

- **Line**: above the editor on `card`: "The tutor proposed a change. Nothing changed yet." and Review. The Library lists the same for pages that aren't open, with the page's name, and leaves out the one open beside it. Empty renders nothing, and a failed read says so with Try again.
- **Review**: `popover` dialog, "Proposed change to {name}", then "Nothing has changed. This page stays as it is unless you accept." Comparison uses History's rows, each with its word. Actions end the dialog: Reject, Edit first, amber Accept.
- **Refused**: the reason replaces the comparison and Accept goes: "This page has a newer version than the one the tutor changed, so this can't be accepted. Your page and this proposal are both kept." or "You changed the same text since…". Copy the proposed text and Reject remain.
- **Edit first**: full screen with the page editor, "Back to comparison" and Accept. Its line says edits stay in the proposal.
- **After**: a status line with Dismiss: "Accepted as version {n}. Your text was saved first as version {m}. History has what came before." or "Rejected. The page didn't change." No review bar follows an Accept.
- **Transcript row**: "Page · proposed a change to {name}, waiting for your review", open by default so Review shows without a click.

### Documents

Features 019-020. Every string is in [their plan](specs/019-document-intelligence/plan.md). No amber except keyboard focus and a dialog's primary.

- **Search mode**: "Names" and "Full text" pills beside the Library's field; Names is the default and the choice persists. Full text hides Sort, direction and layout, keeps Type and tags, and adds Folder and "Hide archived".
- **Results**: raised 10px rows: the name, the snippet in `ink-2` with each match a `<mark>` on the `accent` step and underlined, then meta (`{Kind} · Page 3 · {folder}`). The count sits above them in a live region.
- **Index state**: a muted line under the results, `{n} searched · …`, with "Show which" listing each file not searched and why, and "Reindex". A scan reads "No text could be read". This line shows on an empty result too, so nothing is silently left out.
- **Palette**: name matches first, then "Inside your documents", each row with its snippet under the name.
- **Landing**: a page's block takes the `accent` step for about 2 seconds, as a decoration. A text file's line stays marked. A PDF's quote is outlined. If the words have gone, a muted line says so.
- **Reader**: in the right pane, with a tab. The 52px header holds the name, "Open in a new tab" and "Download" as named icons. Under it a wrapping row: previous, page field "of {n}", next, zoom out, percent (fits to width), zoom in, and "Highlights ({n})" at the end. Pages are white paper on the ground, the width of the pane.
- **Marks on paper**: colour here is data, like a chart's, so the accent stays reserved: a highlight is yellow, a note adds a dark underline so colour isn't the only signal, a citation's quote is blue with a 2px outline.
- **Select text**: first in the toolbar, pressed while on. A real selection starts on the page's first word, so the bubble below is the same one. Arrows move a word or line, Shift extends, Enter goes to the actions, Escape stops, all said in a status line under the toolbar with the selected words. Focus stays on the pages until Enter, and comes back there when the bubble goes.
- **Selection bubble**: `surface-raised-2`, 22rem at most: Highlight, Add a note, Save to a page, Make flashcards; then one muted line, "Ask the tutor. Sends this passage, from page {n}:", then Explain, Summarize, Challenge, Generate questions, Ask…. Above the selection, below it on coarse pointers, and always on screen. While a question waits or the tutor is answering, the tutor's actions become one sentence saying why.
- **Highlights list**: a `surface-raised-2` block above the pages, 40dvh at most: page, quote, note, then Go to, Add or Edit note, Remove. A row whose words have gone adds "This text is no longer on that page." Remove offers Undo.
- **Citation line**: a muted status above the pages saying whether the quote was found on that page, with Dismiss.
- **Sent passage**: in the transcript, the passage on the ground step inside the learner's block, then an underlined "Sent from page {n}".

## Review

Feature 021. Every string is in [its plan](specs/021-spaced-repetition/plan.md). Amber only on the one primary action, Home's kind label and focus.

- **Navigation**: "Review" in the sidebar, under Library, with no count. Palette: "Review flashcards", "New flashcard", and in a lesson "Make flashcards from this lesson".
- **Page**: one column, `max-w-[52rem]`, under the shared top bar: the title "Review" (title serif, 30px), "New card" (raised-2), then Due, All cards, Drafts and Deleted as links on the Library views' pills.
- **Home**: after the Lesson rows, one "Flashcards" row in "Waiting for you": "{n} due" in the teaser, "{n} on weak ideas" or "Today" in meta, a quiet Review. No row at zero; it counts as one in "{n} open". No card text. A failed count says so with Try again and keeps the last count.
- **Queue**: a muted "{n} cards due", then the All due, Weak ideas first and Only weak ideas pills. The card is a raised 10px block: the front at reading size, then amber "Show answer". On reveal, the back in `ink-2`, the source and ideas in muted 13px, then four equal raised-2 ratings: name, gap, and key in mono from 640px; two by two below it. Beneath: Edit (after reveal), History, Suspend, Delete. No idea or source shows before reveal.
- **After a rating**: a line under the card, "Good, back in 10 min.", and Undo last rating. Suspend and Delete offer Undo the same way.
- **States**: "No flashcards yet." with an amber New card; "All done for now." and when the next comes; "None of the {n} due cards link to a weak idea." with Show all due; skeleton; failed with Try again. A failed refresh keeps the card. A shown answer isn't replaced by a change elsewhere.
- **Editor**: a `surface-raised-2` dialog, Front, Back, "Ideas from your graph", Preview, Close and amber "Save card". Closing keeps the draft, and only "Discard draft" drops it. A duplicate is a `card` block in the dialog with the matching front, "Keep both" and "Skip"; Escape closes it first.
- **All cards**: search over fronts, "Only weak ideas" when any exist, raised rows with the front as plain text and meta, and the Library's More menu: Edit, History, Suspend or Unsuspend, Delete. No back.
- **Drafts**: recent runs in `ink-2` with cost, then raised blocks showing both sides. Keep (raised-2), Edit, Skip. A likely duplicate says so above "Keep both". No "Keep all".
- **Deleted**: Restore, and "Delete for good", which alone confirms.
- **Make flashcards**: a raised block saying how many characters go to which model, then amber "Generate drafts", "Write one by hand" and Cancel. With no model, the reason and Open settings replace the send. Doors: the Library's More menu on a page, the PDF bubble, and "This session" in the context view.
- **Dock**: a row "Making flashcards" with cost, linking to Drafts, with Abort.

## Diagrams

Feature 022; decisions in [its spec](specs/022-diagrams/spec.md). Amber only on Create, Approve and keyboard focus. No shadows or dashed borders: `diagram.css` overrides React Flow's defaults with Study ink tokens.

- **Doors**: "New diagram" in the Library (raised-2) opens a `surface-raised-2` dialog: three forms as radio rows, Name, Create. Palette: "New diagram". Tabs use the network icon.
- **Pane**: the page's 52px header: name, save state ("Not saved. Your diagram is kept in this browser."), then named icons as one group: Outline, Links, Export, History, Ask the tutor, Full screen. Full screen is the same element over the app; Escape leaves it and focus returns to the toggle.
- **Tools**: a `surface-raised` row: undo, redo, Add {node, idea or note}, Connect, Draw (whiteboard, canvas), Link and Delete (canvas), then Canvas and List. Labels show from 620 px, and otherwise are named icons. Unavailable tools use muted ink and say what to select.
- **Connect**: a `surface-raised-2` form under the tools: From, To, Label, Add, Close. It stays open to add more.
- **Canvas**: ground, no dot grid. A node is a `card` box, 6px, 15px text, with the 14% edge; a sticky note is `popover`, 10px, 180×120 at least. Selected takes a foreground edge. Edges are straight, in muted ink with an arrow; labels sit on ground in `ink-2`, 13px. Handles show on hover, focus and selection, always on coarse pointers with a 44px hit area. A linked node ends in a small link icon. Zoom out, in and fit sit bottom right.
- **List**: below 360 px of editor width it leads, and no canvas loads. Headed sections of fields: text, Link, Delete; then each connection's ends in `ink-2` with its label field.
- **Outline**: a `surface-raised-2` block, 40dvh at most: each node, its connections, its links. A name moves focus to that node.
- **Export**: Download SVG, Download PNG, Download JSON. The file uses literal Study ink colours. A failure stays as one line.
- **History**: `Version {n} · {You, Tutor or Tutor, edited by you} · {time} · {cause}`. A chosen version shows its picture, what changed in words, "Read as text" and "Restore this version".
- **Proposal bar**: a `card` row, "The tutor proposed a change. Nothing has changed." with Review. In the Library, rows above the views: "{name} · Proposed by the tutor, waiting for you". In the transcript: "Diagram · proposed {name}, waiting for your approval" with Review.
- **Review**: a `surface-raised-2` dialog: "Proposed changes to {name}" or "Proposed diagram: {name}", the summary, "Nothing has changed.", a preview picture, then Added, Removed and Changed nodes, connections and links as counted lists in words. Reject, Edit first, amber Approve. Labels are text, always.
- **Edit first**: the editor on the whole screen: "Editing the proposal: {name}", Back to comparison, amber Approve. Escape takes the field, then returns to the comparison.
- **States**: skeletons; "Nothing here yet. Add a {noun} to start."; "{name} could not be loaded." with Try again; "This diagram was saved by a newer version of the app, so it can't be opened or changed here."; "This diagram changed elsewhere. Your version is safe here." with Keep mine and Use latest.
- **Links panel**: as a page's, worded for a diagram, with "Link the whole diagram" above it. A page's panel lists a diagram with "Diagram ·".
- **Settings → Agent**: "Diagrams", "Proposes diagrams and concept maps for you to review and approve".

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

## Notebook

Feature 024, [specs/024-notebook-mode](specs/024-notebook-mode/spec.md). A second interface, a paper notebook after Riddled, approved by the owner for this mode only. These rules override Study ink, the type scale and the no-shadow rule **only inside Notebook mode** (`.nb-root`, `app/(app)/notebook/notebook.css`); Study is unchanged. Every string is in [ui-contract.md](specs/024-notebook-mode/contracts/ui-contract.md); every exact value, frame and source line in [visual-reference.md](specs/024-notebook-mode/contracts/visual-reference.md). Where a review tool disagrees with an exact Riddled value, the value wins.

### Tokens

- Light: paper `#f8f7f4`, shelf `#f1f0ec`, code `#ebe9e3`, ink `#1d1c1a`, graphite `#5c5953`, faint `#716d67`, rule `#dedbd4`, bulb `#d99a1e`, focus `#8c8a88`. Dark: paper `#1a1a19`, shelf and code `#151514`, ink `#e9e7e2`, graphite `#a9a69e`, faint `#858279`, rule `#33322f`, bulb `#f2b84b`, focus `#676661`. System follows the OS; a change cross-fades.
- The AI's ink (`--riddle`) is ink by default, or one of gray, brown, red, orange, green, blue, purple (`--text-*`, separate light and dark values). Its wash is ink at 5.5% (light) or 8% (dark), its line at 32% / 34%.
- Contrast passes WCAG AA (owner, 2026-11-07, "Raise to pass"): faint and the gray ink (`--text-gray` light `#716d66`, dark `#9a968e` unchanged) reach 4.5:1 on paper and on shelf in both themes; the focus ring (`--nb-focus`) reaches 3:1 on both. Every AI ink reaches 4.5:1 on paper and shelf (light orange `#a9580e`, Riddled `#b5621f` at 4.14:1).While a thread is open the other notes fade to Riddled's .38 (`--nb-faded`), the one deliberate exception: a faded note lifts to full strength under the pointer or on focus, so it is never read faded (agent, 2026-11-07; owner may overrule). Only lightness moved from Riddled's values (faint `#8e8a83` / `#7a776f`, gray `#858179`, orange); hue and warmth are kept. `tests/notebook-contrast.test.ts` reads the tokens from notebook.css and holds the thresholds.
- Grain: a fixed SVG fractal-noise tile, 180px, over the paper: opacity .16 multiply (light), .4 soft-light (dark). Floating panels carry their own grain.
- Lift: shadows are allowed here, on floating surfaces only (menus, selection menu, sidebar, chat, dialogs): `--lift` light `0 0 0 1px #1d1c1a12, 0 1px 1px #1d1c1a0a, 0 6px 16px -8px #1d1c1a29`, dark `0 0 0 1px #ffffff12, 0 8px 20px -8px #0009`.

### Type

- Instrument Sans (variable 400-700) for the UI and everything the learner writes. Newsreader 420, `opsz` 14, +.004em, for the AI's voice only; "Plain" lettering switches the voice to the sans.
- Note size `--note-size` 16px (15 small, 18 large; 15.5/14.5/17 below 640px). Body 1.8 line height, −.004em; title 2.45× at 500, −.032em; H1 1.65em and H2 1.3em at 550; H3/H4 600; strong 620.
- Margin notes 16px on 23.5px; inline replies 1.06× note size on 1.5; his replies sans 14.5px graphite; meta 12px faint; toolbar 13px faint.

### Layout

- Column 660px, centred and then 5.5px left at ≥768px (the frames' page sits there, a scrollbar gutter on the recording machine; ours keeps scrollbars hidden), page padding 103px top. Everything in the column moves with it; the selection menu sits 71.5px right of it. Linux sets the same fonts ≈3% wider than the macOS frames, so line breaks may differ from them; geometry follows the frames.
- Margins: left notes right-aligned, 376px wide, text 59px and dot 36px left of the column; right notes 51px (dot) and 71px (text) right of it. An open thread is 410px and left-aligned. Notes stack 14px apart; below 768px every layout falls back to Marks only, opening inline.
- Toolbar row above the title (reviewer, Instructions, mode, Export, chat), sticky at 26px, items 21px apart; the instruction line under it in the voice, graphite.
- Top left: ☰ and the wordmark. Corner hint bottom right, 24px in and ≥16px up, 11px faint: the only place activity, refusals and failures show.
- Sidebar: an overlay from the left, 288px (78vw max), the page slides aside and fades to .5. Chat 466px and Links 400px panels from the right, the page fades the same way. Settings 840 × 704, 16px radius; Export 504px, 12px radius; both centred with a dim.

### Components

- Margin thread: collapsed is one button (the whole question, never clamped, and "{n} replies"); open shows every message (the AI in the voice, his in sans graphite), the reply-line field, Resolve · Dismiss · ⋯ at 12px faint; others fade to `--nb-faded` (.38, Riddled) and lift to full strength under the pointer or on focus. A tether joins an open or fresh note to its passage; under the pointer a note shows the faint spine alone.
- Marks: the passage under a thread carries a 1px dotted `--riddle-line` (solid at 60% below 1.5 dppx); open adds the wash. Marks only shows a small "?" after the passage.
- Inline reply: under its paragraph, 22px indent, an ink dot, the same thread states.
- Sketch: title in the voice 19px, subtitle 13px faint, the SVG drawing step by step, a stepper ("‹ n/N › ↻") and See it larger.
- Selection menu: a 236px card beside the column (12px radius, lift and rule): block row, ink row, then Think about this, Ask about this, Visualize, Make flashcards with their hints.
- Option cards: 10px radius, rule edge, the chosen one a 1.5px ink ring; arrows move the choice. Switches are ink.
- Reply-line field: no box, a 1px rule under it; on focus a 1.5px line in the AI's ink draws in from the left (.46s) and fades out to the right.

### Motion

- AI text inks in word by word (`nb-ink-word` .64s); new notes settle (.2s) and unfold (.34s); the reading underline draws in pencil (.8s), the blot splats (.46s) and dries (3.4s); the tether draws its tie (.56s) then spine (.7s); sketch strokes and steps draw in (.6-.9s). Menus .16s, sidebar .18s, dialogs .2s, chat .28s; theme cross-fade .35s (view transition). Easings are Riddled's (visual-reference §12-§23).
- Reduced motion: every keyframe and transition above is off; strokes show finished, breathing marks rest at .7, the cross-fade is instant. State still changes.

### Focus and scrolling

- Focus is a 2px `--nb-focus` outline, offset 2px (inset where an edge would clip it); `--riddle-line` stays on marks, links and tethers as Riddled has it. The keyboard-active row of the `/` and `[[` menus shows the same ring inset (-2px) over its shelf fill. Text fields show their caret, no outline. Coarse pointers get 44px targets.
- Every scroller in the mode hides its track and thumb, as everywhere else.
