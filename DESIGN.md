# Interface design

One design system for the whole app: the paper notebook that feature 024 built for Notebook mode, made the app's only look by feature 025 ([specs/025-unified-redesign](specs/025-unified-redesign/spec.md)). Study and Notebook use the same tokens, faces, type scale, chrome, components and motion, so a mode switch changes the content and nothing else.

- Source: `app/paper.css` (tokens on `html.lh-paper`, shared parts, keyframes, reduced motion), the Tailwind theme in `app/globals.css` (paper utilities and the type scale), `app/fonts.ts`, and the mode-neutral components in `components/paper/`. `app/(app)/notebook/notebook.css` holds the note page only.
- Exact values, frames and source lines for everything taken from Riddled are in [024's visual-reference.md](specs/024-notebook-mode/contracts/visual-reference.md); where a review tool disagrees with an exact Riddled value, the value wins. Strings are in each feature's UI contract; 025's mapping and new strings are in [its ui-contract.md](specs/025-unified-redesign/contracts/ui-contract.md).
- Owner rulings that shape the system: 2026-11-07 (feature 024) "Raise to pass" for contrast, Notebook's column geometry, no AI name in Notebook, phones not a focus for Notebook; 2026-11-07 (feature 025, gate 1) Notebook's appearance set for both modes, checks and problems as margin threads, the right pane beside the lesson, `--bulb` for "Your turn"; and the dated rulings kept in each section below.
- [design-system/](design-system/README.md) mirrors the retired Study ink and is out of date; this file wins.

Run `npm run dev:review` for persistent example threads. See [the UI review guide](docs/ui-review.md) for review routes and behaviour checks.

## Tokens

All tokens live on `html.lh-paper`, keyed by `data-theme` (light, dark, or system, which follows the OS through `prefers-color-scheme`), `data-ink`, `data-text-size` and `data-lettering`. The root layouts set them on the server from the shared Appearance (`components/paper/appearance.tsx`, resolved in `src/core/appearance.ts`), so the first paint has the right theme on every route. A theme change cross-fades (.35s view transition).

- **Light**: paper `#f8f7f4`, shelf `#f1f0ec`, code `#ebe9e3`, ink `#1d1c1a`, graphite `#5c5953`, faint `#716d67`, rule `#dedbd4`, control edge `#938a73`, bulb `#d99a1e`, bulb-ink `#8f6614`, focus `#8c8a88`, backdrop ink at 34%.
- **Dark**: paper `#1a1a19`, shelf and code `#151514`, ink `#e9e7e2`, graphite `#a9a69e`, faint `#868379`, rule `#33322f`, control edge `#686660`, bulb and bulb-ink `#f2b84b`, focus `#676661`, backdrop black at 60%.
- **Roles**: paper is the ground of every page, panel and floating surface; shelf is hover, selection, the composer shell, the graph box and expanded rows; code is code blocks; ink is titles, values and primary actions; graphite is secondary copy and the learner's words; faint is meta, hints and timestamps; rule is hairlines, dividers and table rules; the control edge (`--nb-control-edge`, Tailwind `edge`) is the boundary of a control: line-field and reply-line underlines, unchosen option cards, pills and ratings, rule-ringed fields and boxes, the switch's off track. Never derive text colour from an opacity modifier.
- **AI inks**: the AI's ink (`--riddle`) is ink by default, or gray, brown, red, orange, green, blue or purple (`--text-*`, light and dark values), picked in Customize for both modes. Its wash is ink at 5.5% (light) or 8% (dark), its line at 32% / 34%. `--text-red` is the destructive colour, `--text-green` success.
- **Bulb**: `--bulb` is Notebook's lit bulb and the plan block's glow. `--bulb-ink` is the bulb as text and as the waiting dot: "Your turn", Home's kind labels, the sidebar's waiting dot and the practice "solved with hints" chip (owner gate 1: the bulb marks "waiting for you"). Nothing else uses it.
- **Focus**: `--nb-focus`, a 2px ring (see Focus and scrolling).
- **Contrast** (owner, 2026-11-07, "Raise to pass"): faint and the gray ink (light `#716d66`, dark `#9a968e`) reach 4.5:1 on paper and shelf in both themes; the focus ring reaches 3:1 on both; every AI ink reaches 4.5:1 on paper and shelf (light orange `#a9580e`, Riddled's `#b5621f` was 4.14:1). Only lightness moved from Riddled's values (faint `#8e8a83` / `#7a776f`, gray `#858179`, orange); hue and warmth are kept. Text is measured on the paper as rendered, under its grain (light `#f4f3ef`, dark `#1b1b1a`; owner, 2026-11-08), which moved dark faint from `#858279` to `#868379` (4.54:1 there). Control edges reach 3:1 on paper, shelf and the grained paper (owner, 2026-11-08: `--rule` moved along lightness by the smallest step, light `#938a73`, dark `#686660`; Riddled's `--rule` stays for hairlines). Feature 025 applied the same ruling to `--bulb-ink` (light: the bulb's HSL lightness lowered by the smallest 0.1% step that reaches 4.5:1 on paper and shelf; dark: the bulb, already 9.7:1). `tests/notebook-contrast.test.ts` and `tests/paper-contrast.test.ts` hold ink, graphite, faint, red, green, bulb-ink (4.5:1), the focus ring and the control edge (3:1) on paper, shelf and the grained paper in light, dark and system dark.
- **Faded notes**: while a thread is open the other notes fade and still pass: their words fade per AI ink to `--nb-faded`, the smallest two-decimal opacity at which that ink over the grained paper reaches 4.5:1 (light ink .65, blue .93, green .97, red .91, purple .90, brown .93, orange .99; dark ink .51, blue .72, green .68, red .83, purple .74, brown .78, orange .72; tokens `--nb-faded-<ink>`); dot, tether and rail fade to Riddled's .38 (`--nb-faded-mark`, non-text).
- **Data colours** stay data: chart series, heatmaps, PDF marks, graph clusters and exports keep their own colours, listed in `tests/token-hygiene.test.ts`'s allowlist. Demo series follow the scheme: dark keeps the kit's palette; light uses the same hues with lightness lowered by the smallest step that reaches 3:1 on light paper and shelf (blue `#4488f5`, teal `#299a8b`, gold `#b5811d`, red `#ec5a4d`, green `#389d47`; `DEMO_SERIES` in src/core/demo-theme.ts). A demo's own colours win. The kit's error text (`.k-error`) is chrome: `#c92315` on light (4.5:1 on paper, shelf and its own red tint), `#f28b82` on dark (`DEMO_ERROR_INK`).
- **Grain**: a fixed SVG fractal-noise tile, 180px, over the paper: opacity .16 multiply (light), .4 soft-light (dark). The body carries it under every page (`.nb-paper.lh-body-paper`); floating panels, the right pane and dialogs carry their own.
- **Lift**: the only shadow, on floating surfaces only (menus, popovers, tooltips, the selection card, sidebar, side panels, dialogs, toasts, the palette): light `0 0 0 1px #1d1c1a12, 0 1px 1px #1d1c1a0a, 0 6px 16px -8px #1d1c1a29`, dark `0 0 0 1px #ffffff12, 0 8px 20px -8px #0009`. No backdrop blur. In-flow panels are shelf or rule-edged, never lifted.
- **Radii**: 8px controls (`rounded-md`), 10px cards, rows, panels and the composer, 12px menus, the selection card, the palette and dialogs, 16px the settings modal; fully round only for dots, pills, the send button and avatars.
- **Hygiene**: no one-off colour, font size or font family outside the token files; `tests/token-hygiene.test.ts` fails on them. The shadcn bridge names (`--background`, `--foreground`, `--card`, `--popover`, `--muted`, `--border`, `--input`, `--ring`, `--primary`, `--accent`, `--destructive`) exist only as aliases of paper tokens for components/ui and Streamdown, and the test refuses them in components and app code.
- **Print**: a printed page is light paper whatever the theme (`html.lh-paper[data-lh-printing] #lh-print-root`).

## Type

- **Faces** (`app/fonts.ts`): Instrument Sans (variable 400-700, `wdth` axis) for the UI and everything the learner writes. Newsreader 420, `opsz` 14, +.004em (`.nb-voice`) for the tutor's and the AI's voice only. "Plain" lettering switches the voice to the sans. Monospace is the system stack (`--nb-mono`: `ui-monospace, "SF Mono", Menlo, monospace`), for code, raw keys, token ids, shapes and numeric metadata only. No third face downloads.
- **Voice vs learner**: tutor prose, check questions, sketch titles, margin and inline replies are the voice in `--riddle`; the learner's turns, replies and answers are sans graphite; everything else is sans ink, graphite or faint by role.
- **Note size** `--note-size`: 16px (15 small, 18 large) from 640px, 15.5px (14.5 / 17) below. Body text at the note size on 1.8, −.004em; title 2.45× at 500, −.032em; H1 1.65em and H2 1.3em at 550; H3/H4 600; strong 620.
- **Scale** (Tailwind `text-*` and CSS `--text-*`, line heights in brackets):

| Token | Size | Use |
| --- | --- | --- |
| `2xs` | 11px [1.4] | corner hint |
| `xs` | 12px [1.4] | meta lines, phase heads, sidebar shelves and times, tooltips |
| `meta` | 12.5px [1.4] | quiet rows, references, menu descriptions, pills, the palette's meta |
| `sm` | 13px [1.4] | toolbar row and tools, tabs, band titles, text actions, Links rows |
| `ui` | 13.5px [1.35] | sidebar rows, menus, palette rows, queued steers |
| `md` | 14px [1.4] | UI body, dialog text, empty states, settings rows |
| `reply` | 14.5px [1.55] | his replies in Notebook threads |
| `base` | `--note-size` [1.8] | reading text: notes, the page editor, the learner's turns, card sides, Home teasers |
| `lg` | 17px [1.5] | section heads (Home, settings groups) |
| `xl` | 19px [1.35] | dialog titles, sketch titles |
| `2xl` | 1.65em of the note [1.25] | page titles: Home, Library, Review (26.4px) |
| `title` | 2.45× the note [1.12] | the note title |

- **Named one-offs** kept exact where 024 calibrated them against a frame (`app/paper.css` scale block): `--text-mark` 10 (the "?" mark), `--text-kbd` 10.5 (shortcut hints), `--text-caption` 11.5 (sketch counter, panel sub lines), `--text-margin` 15 (margin notes), `--text-wordmark` 15, `--text-select` 15.5 (selection-card actions), `--text-instruction` 16.5 (the instruction line), `--text-sample-*` 15/16/18 (Customize samples).
- **Tutor prose** (`.lh-prose.nb-voice.lh-voice`) is the voice at 1.06× the note size on 1.6; bold and italic keep the voice colour, links ink with a 40% underline; tables, code panels and inline code reset to the sans or mono in ink. Margin notes are 16px on 23.5px, inline replies 1.06× on 1.5.
- Titles that name things (Home, Library, Review, settings pages) are sans 500, −.032em (`tracking-title`). The voice is never used for chrome.
- Numbers that change in place (cost, counts, times) use tabular figures.

## Layout

- **Column**: 660px (`--lh-measure`), Notebook's measure. In Notebook it is centred and then 5.5px left at ≥768px (the frames' page sits there, a scrollbar gutter on the recording machine; ours keeps scrollbars hidden), with 103px top padding, and everything in it moves with it. Linux sets the same fonts ≈3% wider than the macOS frames, so line breaks may differ; geometry follows the frames. Study's lesson column is centred with 24px side padding (22px below 640px), and every transcript row shares its left edge.
- **Margins** (Notebook): left notes right-aligned, 376px wide, text 59px and dot 36px left of the column; right notes 51px (dot) and 71px (text) right of it. An open thread is 410px and left-aligned. Notes stack 14px apart. Below 768px every layout falls back to Marks only, opening inline.
- **Thread geometry in Study** (`components/study/check-geometry.ts`): a check thread needs 71 + 410 + 16px right of the column. When the centred column leaves less, the column moves left (`--lh-check-shift`, .34s) as long as its text keeps 80px from the lesson's left (the turn rail ends at 56px); at 1440 with the pane closed it moves 107px. Below about 1237px of lesson width, with the right pane open at 1440, and on phones, the thread is inline. The bottom bar moves with the column. While a margin thread shows, breakout visuals and bleeding tables widen left only.
- **Top-left chrome** (both modes, one place): the ☰'s box starts `--lh-chrome-left` in and `--lh-chrome-top` down (23 / 20px; 8 / 12px below 640px) and is `--lh-chrome-size` square (32px, 44px on coarse pointers), so its centre is (39, 36) on desktop and (24, 28) on phones with a fine pointer. The wordmark follows 5px after it, 1.5px above the centre line. Notebook's header is fixed (absolute below 640px); Study's chrome leads every band. `tests/e2e/study/chrome-alignment.spec.ts` holds both modes equal within .5px at 1440, 1024, 768, 390 and 320.
- **Bands** (Study): every top bar (`TopBar`, Home, new session, the conversation's fixed phone twin) is `--lh-band` tall: twice the chrome's top plus its size, at least 52px (72px on desktop, 56px on phones with a fine pointer). The row is centred, so the ☰, wordmark, breadcrumb, title and actions share one centre line. Tabs sit under the band, never in it, so drag regions and native gutters don't change. The right pane opens under the band and tabs, so its own header keeps a 52px row.
- **Toolbar row** (Notebook): above the title (reviewer, Instructions, mode, Export, chat), sticky at 26px, items 21px apart; the instruction line under it in the voice, graphite.
- **Overlay sidebar**: from the left, 288px (78vw max), paper with grain and lift, over a dim; Notebook's page slides aside and fades to .5, Study's page stays and takes a 50% paper wash. Its head is 72px (64px on phones) with the ✕ where Notebook puts it.
- **Side panels** (Notebook): chat 466px and Links 400px from the right; the page fades the same way.
- **Right pane** (Study, owner gate 1): beside the lesson, one column, one saved width, resizable; paper with grain (`.lh-paper-panel`); its edge is a 1px rule hairline that is also the resize handle (graphite on hover and drag, a 2px focus-colour line from the keyboard, no grip); its header is a 52px row. Below 768px it is a full-screen layer with "Back to chat".
- **Settings modal**: 840 × 704, 16px radius, centred over the dim; full screen on phones.
- **Dialogs**: centred, 12px radius, over `.nb-dialog-backdrop`; the export dialog is 504px.
- **Corner hint**: bottom right, 24px in and at least 16px up.
- **Page columns**: Home, Library and Review are one scrolling column of `max-w-[52rem]` with a hidden scrollbar; headings, their text and rows share one left edge with the page title.
- **Phones**: every Study surface works at 320 and 390 without page overflow: the overlay sidebar is the phone sidebar, the right pane is the full-screen layer, check threads are inline, the composer keeps its field above the software keyboard, coarse targets are 44px. On a phone a band with a title hides the wordmark (the ☰ stays; the sidebar head shows the wordmark). Notebook's phones keep 024's layouts (owner: phones are not a focus for Notebook).
- **Separators**: spacing and headings group things. No structural lines between headers, footers or rows, except the right pane's hairline edge, a toolbar row's single hairline under the page editor's tools, and the "In Notebook" label's hairline in Customize. Input, choice, selection, focus and resize boundaries remain. No dashed borders.

## Components

Everything below lives in `components/paper/` and `app/paper.css`, keeps its `nb-*` class names and test ids, and is used by both modes; Notebook's own files re-export or wrap them.

- **Surface root** (`surface-root.tsx`): the portal container. Notebook provides `.nb-root`; Study falls back to `document.body`, which carries the tokens through `html.lh-paper`.
- **Appearance** (`appearance.tsx`): the shared provider: html attributes, system theme, the cross-fade, Electron's chrome colours (`lh.setChrome`).
- **Chrome** (`chrome.tsx`): `MenuGlyph` (Riddled's two-bar glyph in graphite), `CloseGlyph`, `Wordmark` (our mark and name: to the open note in Notebook, to Home in Study). `.nb-menu-button` is the ☰: graphite, shelf and ink on hover.
- **Overlay sidebar** (`overlay-sidebar.tsx`, `overlay-sidebar-dialog.tsx`): a Radix Dialog loaded on first open (preloaded during the edge hover's 250ms wait). Dim, ✕ "Close sidebar", Escape clears a search first, menus, rename and delete inside hold Escape (`holdEscape`), hover-open from a 12px left-edge strip on fine pointers (`.nb-edge`, real pointer moves only), pointer-leave closes it until a click or key promotes it, focus returns to the opener. `SidebarBody` takes head, search, actions, rows and footer from each mode; rows are `.nb-side-row`, the footer `SidebarFooterRow` with shortcuts.
- **Menus**: `.nb-menu` / `.nb-menu-item` (paper, lift, radius 12, `ui` type, name and faint description), scaling in from .98. MenuShell menus take the same look and keep each site's width. Tooltips are paper with the lift, 12px graphite, radius 8.
- **Corner hint** (`corner-hint.tsx`, `corner-hint-popover.tsx`): 11px faint, the only place activity, refusals and failures show in Notebook and where Study's activity shows. One run reads "{kind} · cost · Stop"; several read "N running · total" without a Stop on the line (each popover row has its own). Unpriced runs read "cost not known". Clicking the running line opens the lifted popover list (loaded on first click). Idle in Study: "⌘K searches everything" / "Ctrl+K searches everything" from the live palette binding; idle is hidden on phones.
- **Option cards** (`option-cards.tsx`, `.nb-option-card`): 10px radius, control edge, the chosen one a 1.5px ink ring and no fill; arrows move the choice. Used for settings choices, check choices, export formats.
- **Pill row** (`.nb-set-pill`): a row of small choices, the chosen one ringed in ink (also by `aria-pressed` / `aria-current`). Used for confidence, Library views and tags, Review views, search mode, History's Changes / Full text.
- **Primary pill** (`.nb-pill`): ink-filled, round, 32px, `meta` type, the paper colour on it. One per state or dialog. A destructive confirm is `nb-pill lh-pill-danger` (red).
- **Switch** (`.nb-switch`): on, an ink track; off, the control-edge track (3:1, owner 2026-11-08). Locked: shelf track, faint knob.
- **Reply-line field** (`.nb-reply-line`, `.lh-line-field`): no box, a 1px control edge under it; on focus a 1.5px line in the AI's ink draws in from the left (.46s) and fades out to the right. Single-line answers, search and rename fields. Multi-line fields (composer, editor) show only the caret; Review's Front and Back are boxes with the control edge (`.lh-box-field`) that turn ink while typing.
- **Settings shell** (`settings-shell.tsx`): `SettingsShellFrame` (Radix Dialog, backdrop, `.nb-settings`), `SettingsShellBody` (vertical tabs, the search slot on top, results in the tabs' place), `SettingsPage` with ✕, `SettingsTitle`.
- **Export** (`export.ts`, `export-dialog.tsx`): `PaperExportDialog` with PDF, Word and Markdown cards, the notes switch only when asked, a surface's own actions left of Cancel. The last choice is shared by both modes.
- **Selection card** (`selection-card.tsx`, `selection-action.tsx`, `.nb-sel-menu`): 12px radius, lift and rule; the block-style row, the marks row, the ink row, then actions in the voice (`--text-select`). After an action the card closes and the selection collapses to its end with the caret back in the editor; Ask moves the focus to its own field.
- **Ink text** (`ink-text.tsx`, `rehype-ink-words.ts`): AI text inks in word by word (`.nb-ink-word`); InkText caps a reattached ink at 1.8s.
- **Blot** (`blot.tsx`): `InkWait`, `BlotGlyph`, the breathing blot for waiting and thinking.
- **Ink dot** (`ink-dot.tsx`), **tether** (`tether.tsx`), **thread geometry** (`thread-geometry.ts`: note measures, `placeStack`, `tetherPaths`), `use-measured-refs.ts`: the margin thread's pieces.
- **Lifted dialog** (`.lh-dialog`): paper, radius 12, lift, grain under `isolation`; title `.lh-dialog-title` 19px 500 ink, body `.lh-dialog-text` 14px graphite, `.lh-dialog-actions` right-aligned: text actions, then one `.nb-pill`. components/ui's DialogContent takes the same grain. Dialogs trap focus, close on Escape and return focus to the opener (`useModalFocus` where Radix doesn't).
- **Study's shared classes** (app/paper.css and app/globals.css): `.lh-tool` (toolbar register: 13px faint words, 15px icons, ink on hover, pressed or open, shelf behind a pressed toggle), `.lh-tools`, `.lh-text-action` (graphite words, ink on hover, faint when unavailable, red on hover with `data-danger`), `.lh-row` / `.lh-row-name` / `.lh-row-meta` (quiet rows on paper, shelf on hover, selection and drop), `.lh-grid`, `.lh-line-card` (rule edge, no fill: status cards), `.lh-card-block` (rule edge, radius 10: Review blocks), `.lh-float-card` (lifted), `.lh-rating`, `.lh-state` / `.lh-state-detail`, `.lh-quiet-summary` / `.lh-quiet-line` / `.lh-quiet-panel` / `.lh-quiet-chevron` (quiet rows), `.lh-check-*` (check threads), `.lh-paper-panel`, `.lh-tab`, `.lh-at-menu` / `.lh-at-row`, `.lh-page-bubble`, `.lh-page-editor`.
- **components/ui** on paper: Button default and destructive are ink and red pills (hover 88%), outline and secondary are text buttons with a rule ring, ghost is the toolbar button, link is ink with a 40% underline. Popover and tooltip paper with lift. Input is a line field. Skeleton is shelf bars.
- **Buttons**: one primary per state, ink-filled; everything else a text action or a toolbar word. Primaries are named with a verb.

## Motion

- **Keyframes** (all in app/paper.css unless noted): `nb-ink-in` (blocks), `nb-ink-word` (.64s, word by word), `nb-code-in`, `nb-unfold` (.34s) and `nb-settle` (.2s) for new notes and threads, `nb-fade-in`, `nb-pencil-draw` (the reading underline, .8s), `nb-tether-draw` (tie .56s, then spine .7s), `nb-blot-splat` (.46s) and `nb-ink-dry` (3.4s), `nb-ink-sheen`, `nb-ink-drip`, `nb-reading-breathe`, `nb-ink-wait`, `nb-quiet-mark`, `nb-sketch-grow`, `nb-sketch-thread`, `nb-sketch-pop`, `nb-sketch-dot`, `nb-sketch-pop-in` (strokes and steps .6-.9s), `nb-caret-blink`, `nb-whisper-caret`, `nb-voice-bar`, `nb-desk-catch-in`, `nb-menu-in` (.16s), `nb-side-in` (.18s), `nb-chat-in` (.28s); globals.css keeps `lh-card-enter` (transcript cards: fade and 4px rise, 150ms), `lh-mark-in`, `lh-text-shimmer` (running rows), `braille-frame` (tool-row spinner), `dock-variant-in` and `chrome-fade-in`. Dialogs .2s; the theme cross-fade .35s. Easings are Riddled's (visual-reference §12-§23).
- **State and layout**: 150-160ms for colour and state, 240ms for layout, .34s for the check column shift.
- **Ink-in** runs only on new text: streaming tutor words, a check's question on its first opening in a page load, a fresh note. Settled history never animates, on re-render or scroll-back.
- **Reduced motion**: every keyframe and transition above is off; strokes show finished, breathing marks rest at .7, the cross-fade is instant, spinners stop (`motion-reduce:animate-none`), skeletons don't pulse. State still changes.

## Focus and scrolling

- Focus is a 2px `--nb-focus` outline, offset 2px (inset where an edge would clip it, as in settings panels and the keyboard-active row of menus, the palette and the sidebar, which show the ring inset at −2px over their shelf fill). `--riddle-line` stays on marks, links and tethers. Text fields show their caret, no outline. components/ui's Button and Item add `focus-visible:outline-solid` so Tailwind's outline-none doesn't hide the ring.
- Keyboard focus is always visible; the whole app is usable by keyboard. Study's keyboard model replaces the browser's Tab walk outside dialogs with field cycling (owner, 2026-09-17); dialogs, the sidebar, the palette and settings use Tab. In a lesson whose check waits with its thread closed there is no field, so Tab goes to the bottom bar's "Go to it", and Enter there opens the thread and focuses its field or first choice (owner, 2026-11-08). Escape closes the innermost layer first. Pointer clicks do not leave focus on transcript controls.
- Coarse pointers get 44px targets everywhere (`pointer: coarse` rules in app/paper.css).
- Every scroller hides its track and thumb: app content, textareas, code, math, menus, dialogs, the sidebar, the tab row in phone settings and rendered demos. Wheel, touch, keyboard and programmatic scrolling still work, with focus visible, scroll anchors kept and content behind floating controls reachable (AGENTS.md).

## Notebook

Feature 024, [specs/024-notebook-mode](specs/024-notebook-mode/spec.md): a paper notebook after Riddled. Every string is in [ui-contract.md](specs/024-notebook-mode/contracts/ui-contract.md). The tokens, type, chrome and motion above are 024's; these are the rules that only the note page has (`app/(app)/notebook/notebook.css` and Notebook's components). No AI name appears in Notebook.

- **Margin thread**: collapsed is one button (the whole question, never clamped, and "{n} replies"); open shows every message (the AI in the voice, his in sans graphite), the reply-line field, Resolve · Dismiss · ⋯ at 12px faint. A note's hover ⋯ sits outside a left note and inside a right one (at its right edge, as inline notes have it), so nothing passes the window's edge at 1440 (owner, 2026-11-08). Others fade (words to the ink's `--nb-faded`, dot, tether and rail to `--nb-faded-mark`, the reply count and detached lines at full strength, since faint is 4.5:1 on its own) and lift to full strength under the pointer or on focus. A tether joins an open or fresh note to its passage; under the pointer a note shows the faint spine alone.
- **Marks**: the passage under a thread carries a 1px dotted `--riddle-line` (solid at 60% below 1.5 dppx); open adds the wash. Marks only shows a small "?" after the passage.
- **Inline reply**: under its paragraph, 22px indent, an ink dot, the same thread states.
- **Sketch**: title in the voice 19px, subtitle 13px faint, the SVG drawing step by step, a stepper ("‹ n/N › ↻") and See it larger. An inline sketch keeps 18px clear on its right at ≥768px (frame inline-sketch-and-selection); its step line starts on the drawing's left edge.
- **Selection menu**: the shared selection card, 236px, beside the column 71.5px right of it: block row, ink row, then Think about this, Ask about this, Visualize, Make flashcards with their hints. Escape hides it for that selection; Shift+F10 / Alt+F10 goes into it; Mod+Enter thinks.
- **Toolbar row, title, instruction line, pointer ink, Just my words**: as visual-reference §5, §6, §21, §22.1.
- **Settings**: Customize (Appearance, Text size, Lettering, Ink colour, then under "In Notebook": New notes start in, Ink from the pointer, Reading pace, Where questions appear) and Reviewers, in the shared modal.

## Home

One scrolling column, in this order.

1. "What do you want to learn?" (sans 500, `text-2xl`, −.032em) over the topic composer. The field's placeholder is "A topic, a question, or a chapter to work through" ("What do you want to practice?" in practice mode); the Teach | Practice switch, the pick bar and the setup gates stay as they are.
2. "Waiting for you" (`text-lg` 550 ink) with "{n} open" in meta: one quiet row per unanswered check or open problem across sessions, newest posed first. Rows sit on the paper (no fill, shelf on hover, radius 10, bleeding 12px so their text keeps the title's edge). The kind ("Lesson check", "Prediction", "Question", "Explain", "Recall", "Problem") is the only `--bulb-ink`; then session title · time in meta (a long title truncates, the time never does), the teaser on one line at the note size in graphite (two lines on phones, where meta and the action share the last row), and Answer or Solve as a toolbar word (ink on row hover) that opens the session scrolled to that check's thread, opened, with its field or first choice focused. After those rows, one "Lesson" row per lesson whose plan still has a topic never checked (feature 003), most recently active first: session title · time since last active in meta, "{left} of {total} topics left · next: {topic}" in the teaser slot, and Continue, which opens the lesson at the bottom with "Continue with {topic}" in an empty composer (never replacing a draft, never sent). A waiting lesson with topics left stays one Answer row and carries the same progress line under its teaser (14px faint; it wraps on phones). One "Flashcards" row follows when cards are due (see Review). "{n} open" counts every row. Empty: the heading and "Nothing is waiting. Every check is answered and every problem solved." Loading uses row skeletons; failure says so with Try again; a failed refresh keeps the list.
3. "Calibration" (feature 004), between "Waiting for you" and the knowledge graph, hidden until a graded answer with confidence exists: one plain line per used level in the order Guessing, Unsure, Fairly sure, Certain ("Certain · 61 answers · 51 right (84%)", the percent only from 5 answers), then the faint 14px subheading "Wrong while Certain" with the newest 5 misses as quiet rows without a kind label (session · time in meta, the question on one line, Review, which opens the session at the teacher message before the check) and "Show all {n}" as a text action that expands in place. No misses: "None yet. Every answer you marked Certain was right."
4. "Knowledge graph" with "{n} ideas · {m} chains" in meta (hidden on phones), Import notes and Expand as toolbar words in the header. The live graph sits in a shelf box, radius 10, 420px tall (260px on phones). Its floating chrome (search, Chains, cost panel, running pills, the node card, the engine failure, Close when expanded) is paper with the lift and no border. Nodes are ink, the focus ring `--nb-focus`, muted nodes faint; cluster labels keep their hue (data) with a deep tint on light paper (34% lightness) and a pale one on dark (78%). Expand turns the same element into a full-screen dialog (camera, selection and search kept); Close or Escape returns focus to Expand. The chain table covers the whole Home content area; its search is a line field, its selection bar a lifted card, Practice an ink pill. An empty graph shows one sentence: "Start a session or import notes to build your graph." With graph rendering off, the minimal summary fills the same box, centred (owner, 2026-10-06).

No centred icon or illustration anywhere on Home.

## Sidebar

Both modes use the overlay sidebar (Components). Notebook's body is 024's (notes, folders, search, New note, footer). Study's:

- **Opening**: the ☰, a hover at the left edge on fine pointers, Mod+B, or Mod+Shift+F (opens on its search). Mod+\ stays Study's right-pane toggle. Mod+K inside the sidebar waits until it closes, as in every dialog.
- **Head and actions**: the wordmark and ✕, the search field "Find a session" (it filters sessions only), then New lesson and New practice.
- **Navigation**: "Lessons" and "Practice" with their counts, which narrow the list below (shelf while on, a second press clears), then "Library" (`LibraryIcon`, links to `/library` with `aria-current="page"` there) with a chevron for its folder tree (features 012-014), then "Review" (feature 021, no count). The tree lists folders by name, indented by depth; it fetches only while open and keeps the current folder visible. Loading uses skeletons, empty reads "No folders yet.", failed reads "Folders could not be loaded." with Try again.
- **Sessions**: by Today, Yesterday and Earlier (faint 12px shelves, counts in meta). A row is the type icon (lesson or practice, shared size and stroke), the whole title (wrapping, never truncated), then a 6px `--bulb-ink` dot named "Waiting for you" when the session waits on him, or the running indicator while a turn runs, in a separate trailing slot, then the time. The keyboard-active row is shelf with the inset ring.
- **Footer**: account (hosted, Clerk's menu opens inside the sidebar dialog), Settings, Command palette (the touch path to it), Switch to Notebook, Sign out (hosted), each with its shortcut.
- Settings opens from the footer and Mod+,. The graph's display controls live in Settings → Graph → Display.

## Tabs and palette

Features 014 and 015; decisions in [their spec](specs/014-workspace-navigation/spec.md).

### Tabs

- A row directly under the band on sessions and the Library, and on Home and new sessions once tabs exist. 36px tall, 48px on coarse pointers.
- A tab is a type icon, the title (13px, truncating at 13rem, whole in its tooltip) and a × named "Close {title}" that shows on hover and focus (always on coarse pointers). Tabs are faint, ink when on screen or selected; the selected one has a 1.5px ink underline under its label. No fills; 21px gaps. A loading tab swaps its icon for the running indicator.
- Visiting a session or opening an item in the pane opens its tab, up to 12. PDFs hold a tab like a page. Images and other files open as in the Library, without a tab.
- The strip ends in "Hide right pane" or "Show right pane" from 768px.

### Right pane

- One column, one saved width (Layout). A page or demo holds it as described below. With neither, the toggle shows the context view: a 52px header, then for a session "This session" with Notes (the session's pages, then "Turn this lesson into study notes" on lessons), "Outline" and "Demos"; for a Library place "Location", "Tags here" and "Recently opened". It has no iframe.
- Collapsing takes the column to no width with everything mounted. Any explicit open expands it. Below 768px the page layer and demo sheet are unchanged. With neither up, the toggle opens the context view as a full-screen layer with "Back to chat" (feature 023); it is never saved.

### Command palette

- Cmd/Ctrl+K, or the sidebar's footer row. A 560px lifted card near the top, radius 12: the field reads "Search or run an action…", with no box and a rule underline that turns ink on focus, then the list. Rows are an icon, the label (`ui`) and meta (`meta` faint), 36px, 44px on coarse pointers; the active row is shelf, with the inset focus ring only when the arrows moved it.
- With no query: Actions, Sessions, Library and Folders. With one: a single ranked list. No match reads "Nothing matched". Each source reports for itself: "Loading your Library…", "Your Library could not be loaded." with Try again, and the same for sessions, with the rest still usable.

## Lessons

### Transcript

- One reading edge for every block: tutor prose in the voice (no bubble), the learner's turn (no fill or padding: sans graphite at the note size on 1.6 under a faint 12px "You" that is also its accessible label), thinking rows and phase heads ("Planning", "Teaching", "Practice": 12px faint labels, no rule, never centred). System lines (Retrying…) sit on the reading edge.
- Streaming tutor words ink in word by word; bold runs, inline code and math, and links ink as one unit; code blocks, display math, quotes and SVG don't. Settled replies render without the effect.
- Thinking: the breathing blot replaces the spinner in the thinking placeholder and the streaming "Thinking..." row, which hand off seamlessly (owner, 2026-10-02). There is no separate reading-thinking field.
- While the workspace shows a demo, its place in the lesson is a single row linking to it. Quick plots render the demo head as a sketch title (voice, 19px, ink) with no card edge; ML panels keep the demo head; demo heads are toolbar icons (15px faint, ink on hover, no fill). Mermaid diagrams are borderless blocks.
- The turn rail appears from three turns; its current tick is in `--riddle`, its preview card radius 12 with the lift.
- Compaction labels are 12px faint without a pill; the cut divider keeps its dotted rules.
- A sent PDF passage is an indented graphite italic quote inside the learner's turn, then an underlined "Sent from page {n}". A message's references show as one quiet row each on the reading edge (`meta` faint, the name in ink), the mode and reason worded as in the 009 contract.
- Breakout visuals (ML panels, demos at 832px) are not clipped by the row's paint containment.

### Check threads

Owner gate 1 (2026-11-07): an active lesson question or practice problem is a thread beside the tutor paragraph it follows (`components/study/check-thread.tsx`).

- **Placement**: Notebook's margin thread, 71px right of the column, 410px open, level with the anchor paragraph's last line and never below the lesson's end, tethered to it; inline under the anchor (22px in) where there is no room (Layout). The anchor is the nearest earlier tutor text part with words. Moving between margin and inline keeps the focused control and caret.
- **Collapsed**: one button: "Your turn" in `--bulb-ink`, then the kind ("Your turn · Lesson check"; "Your turn · Check your understanding" until a teach check is revealed), the teaser in the voice (clamped to 4 lines), a faint "Draft kept" when the closed thread holds typed text, a choice, "I don't know" or a moved confidence, and Answer or Solve.
- **Open**: the question in the voice (inking in on its first opening in a page load; the dot splats only when the check arrived while the lesson was open), details, choices as option cards with a small radio or check mark (1.5px ink ring when chosen), confidence as a pill row, "I don't know" as a text button, the reply-line field, then the ink pill: Submit answer; Skip and Submit for problems; Next problem and Stop between problems. "Using {demo}" sits inside the thread. The body scrolls inside itself at 50dvh at most; tables in a thread never bleed. A chevron collapses it ("Collapse question" / "Collapse problem"). Closing hides the form; drafts, choice and confidence are kept and show on opening. Scrolling never folds it.
- **Placeholders**: "Explain your reasoning, or leave blank to submit your choice" (choice questions), "Type your answer" (free-text questions), "Work through the problem here" (practice problems).
- **Focus**: opening a thread by click, Enter (when a check waits and focus is not in a field), `?answer=` or Home's Answer / Solve scrolls it into view, opens it and focuses the answer field (free text, problems) or the first choice (choice checks) on fine pointers; phones do not raise the keyboard (owner, 2026-10-28). On coarse pointers a focused inline field stays above the bottom bar when the keyboard opens.
- **Keyboard**: arrows, Space, Tab, ←/→ for confidence and Enter work while focus is inside the open thread. Escape layering is unchanged; Skip takes the Escape confirmation.
- **Teaching rules**: request bodies are unchanged: confidence is sent on real answers and dropped on "I don't know"; correct answers never reach the client before he answers; problems never announce their target and wait for Next problem. The active problem is exempt from transcript windowing. A question's exact demo reference opens the workspace once for that question.
- Answered and dismissed checks stay in the transcript as their cards.

### Bottom bar

- A shelf shell, radius 10, over the transcript's foot, moving with the column. The field sits on the shell (caret only, no inner box, fill or label). The toolbar holds the labelled model and thinking triggers ("Choose a model" and "Thinking" when unset, never "—") and the usage ring with a percentage ("?" when the limit is unknown), 12.5px faint. Without a key or models it shows "Add a provider key" or "Set up your models" as the ink pill. Plain chat ends in the round ink send; a running turn shows Stop.
- While a check waits, the composer's place reads "Answer the check beside the lesson" / "Solve the problem beside the lesson" ("Answer the check above" / "Solve the problem above" when the thread is inline) with "Go to it", which scrolls to, opens and focuses the thread; with no field on the page, Tab lands on it. The stats bar lives only here.
- Queued steers sit above the shell as right-aligned rows (radius 10, `ui` type); each has a round × without fill ("Remove queued message: {text}", 44px on coarse pointers) that withdraws it before delivery, with no confirmation or undo. If the agent already had it, the row reads "Already sent" until its card lands; a failed removal reads "Could not remove".
- Scroll-to-latest sits just above the shell's top-right edge. On phones it sits instead in its own 48px band above the shell, below the queued rows, on the paper, present only while the button shows; this is the one opaque band above the bar (owner, 2026-10-28), so the button never covers transcript text.
- The composer stays mounted through presentation changes. Scrolling into history compacts it until the conversation's bottom, where it expands; editing expands it; it never compacts during focus or input composition (`dock/composer/expanded`). A measured tail spacer keeps the last content reachable. No divider or opaque footer cuts off the transcript. On mobile, the answer input stays reachable above the software keyboard.
- Escape closes the innermost menu first.

### Quiet rows

Tool calls, math checks, lookups, page and library rows, held-edit rows and diagram rows share one register: a summary line in `meta` faint sans with the row's own icon (14px) and a chevron disclosure, an expanded panel on shelf with radius 10, on the transcript's reading edge. Only the summary is unselectable, so expressions and values can be copied. Running rows show only the spinner and shimmer with their activity label; inputs are never shown live. Failures use `--text-red`, with the reason as a sans sentence.

### Math check

- A `math_check` call (feature 007) is one quiet row. Its headline always reads "Wolfram · {verdict}": "Wolfram · equal" (with a check mark), "Wolfram · not equal", "Wolfram · couldn't decide", "Wolfram · check failed" (red), or "Wolfram · check not finished" (owner, 2026-10-28). Collapsed by default. Expanded, it shows the checked `lhs = rhs`, assumptions, counterexample or reduced form in monospace, and the time taken. Wolfram's raw reply appears only when it couldn't decide.
- While it runs, the row shows only "Checking with Wolfram…" with the spinner.
- A check made before a question renders nothing until that question is answered or the problem concluded. A grading check during an active problem shows the verdict and "Expressions shown after the problem is concluded".
- Answered quiz and explain cards and conclude cards whose answer was checked end with a faint line, a check mark and "Checked with Wolfram". The words carry the meaning; the icon is decoration.

### Lookup rows

- ML and source tools (feature 008) use the quiet row. Headlines: "Hugging Face · {what}", "Semantic Scholar · {n} papers for '{query}'", "arXiv · {title}" and "Read · {title} · pp. {pages}". Failures: "Hugging Face · lookup failed", "Papers · search failed" or "Read · failed".
- Running rows read "Looking up on Hugging Face…", "Searching papers…", "Reading a paper…", "Drawing a panel…" or "Tokenizing…". Successful tokenize rows read "Tokenized · {count} tokens ({encoding})" ("1 token" when singular) and show the text and each token in words (`␣world 1917`, bytes as `<0xF0>`), never raw JSON; failed or unfinished tokenize calls use the generic tool row. Counts take the singular at one ("1 model", "1 paper"), and a single page reads "p. 4". A checked plot or panel that failed its check reads "Plot · failed its check" or "Panel · failed its check", never the tool name.
- Hub model fields use a two-column grid: labels in words, raw keys and values in monospace. Papers show linked titles and available author/year/id/PDF metadata. Read rows show page links and "{n} of 10 pages this turn". Links are ink with a 40% underline, open in a new tab with `rel="noreferrer"`, and name the destination accessibly. Every link in a lookup row opens on plain Enter when keyboard-focused. Page citations in prose are ink (owner, 2026-10-29).
- Settings → Agent has ML visuals, Model hub and Papers after Math check: hints "Shows tokens, attention, sampling, networks and shapes as interactive panels", "Looks up model configs, datasets and papers on Hugging Face" and "Finds papers on arXiv and Semantic Scholar and cites their pages"; accessible names "tool ml visuals", "tool model hub" and "tool papers".
- Binding reference: [008 canvas](https://claude.ai/artifact/EmWdcYcnZrXu5Ng1VyHiA6), Rows board and [UI contract](specs/008-ml-llm-lab/contracts/ui-contract.md).

### Tables

Below 640px, oversized Markdown tables shrink proportionally to fit their container, stopping at 13px effective text. Wider tables remain horizontally swipeable with hidden scrollbars and visible keyboard focus. Tables that already fit keep their reading size; Copy controls stay unscaled (owner, 2026-10-28).

## Library, @ list, page pane and notes

Feature 009; the binding reference is its [UI contract](specs/009-library-canvas/contracts/ui-contract.md).

### Library view

- `/library` is one column under the shared top bar: the title "Library" (sans 500, `text-2xl`), "Upload", "New page", "New folder" and "New diagram" as toolbar words (none primary), then the "Search your Library" line field, which filters names on the client.
- **Folders** (feature 011): inside a folder the title is the folder's name, under breadcrumbs ("Library / Physics / Waves", 13px graphite, the current one in ink with `aria-current="page"`). Folder rows come before items: folder icon, name, `Folder · {n} items`, then "Open folder", "Rename folder", "Move folder" and "Delete folder" with the name. "Move {name} to" is a dialog listing every allowed folder by its path. Searching covers the whole Library and appends each match's location to the meta line. An empty folder reads "This folder is empty."; a missing one "That folder is no longer in your Library." with Back to Library.
- **Views** (feature 012): the "Library views" pill row under Search: All, Favorites, Recent, Archive, Trash, the current one ringed with `aria-current`. Tags appear as a second pill row once any exist. Favorites and pins show as small graphite star and pin icons before the name; pinned entries sort first at every level.
- **Trash**: Delete moves to the trash: "Move {name} to the trash?" with "You can restore it from Trash." Everything in a folder goes with it. Trash rows have Restore and "Delete for good", which alone confirms "Delete {name} for good?" with "This can't be undone." (the red pill). A restored name that is taken steps as in a clash.
- **Sorting and layout** (feature 013): Sort, direction and Type, the two choices being menus with a check on the current one, then the list and grid icons at the row's end. Sort and layout persist per browser. "Select" turns on a checkbox per row and a sticky lifted card: "{n} selected", Move to…, Favorite, Tags…, Archive and "Move to the trash". A bulk failure names each item and its reason, and the rest still happen.
- **Rows**: quiet rows on paper (grid cards add a rule ring). The name is 15px and wraps. The meta line is `{Kind} · {size} · {date}`, plus "Made by the agent" or "No text could be read" when true. Clicking the row opens the item ("Open {name}"); "Rename {name}" and "Delete {name}" are named buttons. Every row has a More menu (⋯), and the same list on right-click: Rename, favorites, pin, Tags… (items), Move to…, Archive, Move to the trash. Below 640px the Rename icon hides. Rows drag onto a folder or the breadcrumbs above, shelf showing the drop; a selection drags together. Move to… is the keyboard and touch path.
- **Upload** is a file picker and a drop on the page, with a row and a percent per upload in flight. Refusals name the file and the reason and stay until dismissed.
- **Clash**: "{name} is already in your Library." with "Keep both as {suggested}" and "Cancel". Originals are never replaced.
- **States**: empty "Nothing here yet. Upload a document or start a page."; loading row skeletons; failed "Your Library could not be loaded." with Try again; a failed refresh keeps the list.
- **Opening**: pages open in the pane. Markdown, text, code and CSV open read-only with "This is your original; it can't be edited here." PDFs open in the reader (features 019-020). Images open in a new tab. Over 1 MiB of text shows "Too long to preview" and Download.

### @ list

- Notebook's menu card (`.nb-menu`, paper, lift, radius 12) above the field, inside the prompt shell's width, up to 6 rows scrolling with hidden tracks. A row is the name, then `{Kind} · {size}` as the description, at least 44px; the keyboard-active row is shelf with the inset ring.
- The textarea is a `combobox` over a `listbox`. Up and Down move, Enter or Tab insert `@name ` at the token and keep focus, and Escape closes only the list. Clicking keeps focus in the field.
- No match shows "Nothing matched" as a status: Enter does the field's normal action, Tab inserts nothing and the text stays. A space after an unmatched query closes the list. "Your Library is empty.", "Loading your Library…" and "Your Library could not be loaded." leave the draft untouched.
- The last option in every field is "New page", styled like any row, under any status line. Choosing it creates a blank page ("Untitled page", a clash stepping as in the Library), opens it in the pane and inserts `@name `; it sends nothing and calls no model. With no match, Enter stays the field's own until an arrow reaches the row. With no pane on screen, the page opens on the next screen that has one. A failed create shows "New page · {reason}" under the field and keeps the draft (owner, 2026-10-31).
- It serves the chat, Home and new-session composers, the check fields and the practice field. When the text has references, one faint 13px line in the answer well reads "Attaching {name}, {name}".

### Page pane

- A resizable pane shared with the demo workspace shows a demo or a page; the most recent explicit open wins and the one live iframe stays mounted. A question's automatic demo open does not replace an open page.
- The 52px header holds the page name (click to rename), a faint save state ("Saved", "Saving…", "Draft saved", "Not saved. Your text is kept in this browser." with Try again), "· {n} words" (formulas, code and images not counted), then Outline, Links, Export and History as toolbar words, and close. In a pane under 720px wide (and below 768px) these show as named icons, so the name keeps its room. The body is one rich-text surface at the note size, with no separate preview pane.
- Cmd/Ctrl+S saves a version. Escape returns focus to the transcript on desktop and closes the layer on phones.
- A conflict shows "This page changed elsewhere. Your text is safe here." with "Keep mine" and "Use latest". An accepted edit or an update from elsewhere on a clean page shows "Updated by the agent · version {n}" for 4s and announces it in a live region.
- Below 768px the pane is a full-screen layer with contained focus and "Back to chat". The composer's draft stays mounted underneath.
- Transcript rows are quiet rows: "Page · created {name}", "Page · revised {name} · version {n}", "Page · couldn't revise, it changed", "Page · failed", "Library · read {name}" and "Library · failed".

### Page editor tools

Feature 010; every string is in specs/010-page-editor-tools/contracts/ui-contract.md.

- **Body**: Notebook's note body (`.lh-prose.lh-page-editor`): the note size on 1.8, −.004em, Notebook's block rhythm and heading margins, a 2px ink rule on quotes, code on the code wash, wiki links with the `--riddle` underline. No border or outline when focused (owner, 2026-10-31); the caret shows focus. An empty page shows one faint sentence, never stored.
- **Toolbar**: Notebook's format buttons on the paper with one hairline under the row, wrapping as it narrows: undo and redo; a text style select; bold, italic, strikethrough, inline code and link; lists, checklist and quote; formula, table and image; "Ask the tutor" at the end. Each button's name carries its shortcut; unavailable buttons are faint, never faded by opacity.
- **Table controls**: while the caret is in a table, a row of text actions sits under the toolbar.
- **Slash menu, `[[` list and link popover**: menu cards inside the editor; the keyboard-active row is shelf with the inset ring. The slash menu opens on "/" at the start of an empty line; Escape closes only the menu. The link popover (Ctrl/Cmd+K) has a labelled field.
- **Selection card**: the shared selection card under or over selected text (placed above, flipping below, inside the pane; capped at the room it has and scrolling inside itself): the block-style row, the marks row (Bold, Italic, Underline, Strikethrough, Code, Link), the inks, then the tutor's actions in the voice in the order Explain, Simpler, Summarize, Rewrite, Expand, Challenge, Quiz me on this, Generate questions, Ask… (features 010 and 018). While a question waits, a problem is active or the tutor is answering, the actions are replaced by one sentence saying why ("Answer the question in the chat first.", "Finish or skip the problem first.", "The tutor is still answering."). All but Ask… send at once; Ask… only fills the composer. From the Library they open a new session. Simpler, Rewrite and Expand propose a change through Held edits; the rest answer in chat, and questions are graded checks that stay out of the page. After any action the card closes and the selection collapses to its end, the caret back in the editor (Ask… leaves the focus in the composer it fills), as Notebook's menu does.
- **Tutor changes** (versions the agent wrote before held edits): a line card "The tutor changed {n} places · version {v}" with Previous, Next, "Undo the tutor's edit" and Done (the ink pill). The tutor's blocks sit on the shelf; removed text is struck through in faint. Done or closing the page clears them; typing does not.
- **History**: `Version {n} · {You | Agent} · {time}`, opening on Changes (added and removed blocks against the version before, each labelled in mono with its word and colour); Full text shows the rendered version; a read-only preview and "Restore this version" (the ink pill). Versions can be named and copied.
- **Outline**: a column beside the text when the pane is at least 720px wide, otherwise a list above it.
- **Export**: the shared export dialog (PDF, Word, Markdown through POST /api/notebook/:pageId/export) with Copy as Markdown and Print as its own actions; "Include the notes" only when the page has threads. After a file arrives the pane says "Exported “{file}”." for 4s in a live region. Print shows only the page, on light paper.
- **Images**: pasted, dropped or chosen images become Library images. An upload shows one progress line. A missing image shows its alt text on the shelf.

### Notes

Features 016-018. Every string is in [their plan](specs/016-intelligent-notes/plan.md).

- **Wiki links**: `[[Page name]]` in the text, an underlined inline atom showing the item's current name. A dangling or deleted one is faint with a dotted underline (deleted also struck through), and its accessible name says which. Clicking, or Ctrl/Cmd+Enter beside it, follows it. A dangling link's line reads "Nothing in your Library is called {name} yet." with Create page and Dismiss.
- **`[[` list**: up to 8 rows with kind in meta. A typed name with no page gets a row "Link it now, make the page later". Escape closes only the list.
- **Links panel**: a column beside the text when the pane is at least 720px wide, otherwise a shelf block above it, 40dvh at most. Sections: Links to this page, Links from this page, Related notes, Lessons, Ideas in your graph. Each row is a 13px name with faint meta beneath, and each section has its own empty sentence.
- **Callout**: a shelf block, radius 10, no side rule and no colour by kind. A head row holds the type select and a title field (0.95em).
- **Collapsible section**: a chevron button, then the title (500 weight), then the body indented to the title. Closed hides the body. The state is stored.
- **Saved passage**: a quote ending in a link, "Lesson: {title}". Following it jumps to the message, which flashes as a graph link's does. If the session is gone the link is faint and followed by "· this session was deleted, so the source is gone".
- **Save to a page**: a small lifted button over selected tutor prose, under it on coarse pointers. It opens a lifted dialog: the passage, one field that filters pages or names a new one, then the rows.

### Held edits

Feature 023. No AI edit changes the page until he accepts, from a selection's action or an ordinary turn.

- **Line**: a line card above the editor: "The tutor proposed a change. Nothing changed yet." and Review. The Library lists the same for pages that aren't open, with the page's name, and leaves out the one open beside it. Empty renders nothing; a failed read says so with Try again.
- **Review**: a lifted dialog, "Proposed change to {name}", then "Nothing has changed. This page stays as it is unless you accept." The comparison uses History's rows, each with its word. Actions end the dialog: Reject and Edit first as text actions, Accept as the ink pill.
- **Refused**: the reason replaces the comparison and Accept goes: "This page has a newer version than the one the tutor changed, so this can't be accepted. Your page and this proposal are both kept." or "You changed the same text since…". Copy the proposed text and Reject remain.
- **Edit first**: full screen with the page editor, "Back to comparison" and Accept. Its line says edits stay in the proposal.
- **After**: a status line with Dismiss: "Accepted as version {n}. Your text was saved first as version {m}. History has what came before." or "Rejected. The page didn't change." No review bar follows an Accept.
- **Transcript row**: "Page · proposed a change to {name}, waiting for your review", open by default so Review shows without a click.

### Documents

Features 019-020. Every string is in [their plan](specs/019-document-intelligence/plan.md).

- **Search mode**: "Names" and "Full text" pills beside the Library's field; Names is the default and the choice persists. Full text hides Sort, direction and layout, keeps Type and tags, and adds Folder and "Hide archived".
- **Results**: quiet rows: the name, the snippet in graphite with each match a `<mark>` on the shelf and underlined, then meta (`{Kind} · Page 3 · {folder}`). The count sits above them in a live region.
- **Index state**: a faint line under the results, `{n} searched · …`, with "Show which" listing each file not searched and why, and "Reindex". A scan reads "No text could be read". This line shows on an empty result too, so nothing is silently left out.
- **Palette**: name matches first, then "Inside your documents", each row with its snippet under the name.
- **Landing**: a page's block takes the shelf for about 2 seconds, as a decoration. A text file's line stays marked. A PDF's quote is outlined. If the words have gone, a faint line says so.
- **Reader**: in the right pane, with a tab. The 52px header holds the name, "Open in a new tab" and "Download" as named icons. Under it a wrapping tool row: previous, page field "of {n}", next, zoom out, percent (fits to width), zoom in, and "Highlights ({n})" at the end. Pages stay white (data) inside the pane's 16px gutters.
- **Marks on paper**: colour here is data, like a chart's: a highlight is yellow, a note adds a dark underline so colour isn't the only signal, a citation's quote is blue with a 2px outline.
- **Select text**: first in the toolbar, pressed while on. A real selection starts on the page's first word, so the card below is the same one. Arrows move a word or line, Shift extends, Enter goes to the actions, Escape stops, all said in a status line under the toolbar with the selected words. Focus stays on the pages until Enter, and comes back there when the card goes.
- **Selection card**: Highlight, Add a note, Save to a page, Make flashcards; a hairline; the faint line "Ask the tutor. Sends this passage, from page {n}:", then Explain, Summarize, Challenge, Generate questions, Ask…. Above the selection, below it on coarse pointers, and always on screen. While a question waits or the tutor is answering, the tutor's actions become one sentence saying why.
- **Highlights list**: a shelf block above the pages, 40dvh at most: page, quote, note, then Go to, Add or Edit note, Remove. A row whose words have gone adds "This text is no longer on that page." Remove offers Undo.
- **Citation line**: a faint status above the pages saying whether the quote was found on that page, with Dismiss.

### Linked repos

Feature 026. Every string is in [its UI contract](specs/026-library-git-sync/contracts/ui-contract.md).

- **Entry**: "Link a repo" (lucide `GitBranch`) is a toolbar word after "New folder". The dialog is the lifted dialog: Repo address (HTTPS), Folder name (prefilled from the repo name), Personal access token (password field, private repos only), a Branch disclosure ("Default branch" until opened), "In {folder path}", then Link (ink pill, "Linking…" with the blot) and Cancel. Refusals sit under their field in `--text-red`, with the raw detail behind "Show details". While the first pull runs, the target folder shows a pending row, "Syncing for the first time…", that can't be opened.
- **Linked folder**: the row has lucide `FolderGit2` and the meta `Repo · {n} items` plus the status. Inside it, a faint `role="status"` line under the title reads "Syncing…", "Synced {n} min ago" (only the time part is `aria-live="off"`, so the minute tick isn't announced) or "Sync failed · {sentence}" with "Show details" and "Sync now". A skipped count adds "· {n} files skipped" with "Show which". Toolbar words inside: "Sync now" (aria-disabled "Syncing…" while one runs) and "Repo details". Upload, New page, New folder, New diagram and Link a repo hide inside a mirror.
- **Read-only mirror**: mirror folders and mirrored files have no Rename or Delete icons, aren't drag sources or drop targets, and are left out of Move to…. Their menus offer only Open, favorites, pin, Tags… (files), Archive and Download. Bulk Move to… and Move to the trash refuse them as "{name}: comes from the repo.". The linked folder keeps Rename and Move, and its Delete folder opens the unlink confirm.
- **Repo details**: a lifted dialog titled with the folder name: Address (a link, no credentials), Branch, Last sync, Commit (7 characters), Token (the mask with "Replace token" and "Remove token", or "No token" with "Add token"). Footer: "Sync now", "Unlink…" (`lh-text-action data-danger`), Close.
- **Unlink confirm**: "Unlink {folder name}?", the body says the files go and highlights, notes and flashcards stay, red Unlink pill, focus starts on Cancel. It stacks over Repo details; Escape closes the innermost first.
- **Opening**: text opens read-only with "This comes from {display}. Change it in the repo.", and PDFs show "From {display}" in the reader header. If a pull changes the open file, a faint "Updated from the repo" line appears with Reload. If a pull removes it, the line says "Removed from the repo" and the view keeps what it was showing. A reference to a removed file reads "{name} · Removed from the repo".

## Review

Feature 021. Every string is in [its plan](specs/021-spaced-repetition/plan.md).

- **Navigation**: "Review" in the sidebar, under Library, with no count. Palette: "Review flashcards", "New flashcard", and in a lesson "Make flashcards from this lesson".
- **Page**: one column under the shared top bar: the title "Review" (sans 500, `text-2xl`), "New card" as a toolbar word, then Due, All cards, Drafts and Deleted as a pill row.
- **Home**: after the Lesson rows, one "Flashcards" row in "Waiting for you": "{n} due" in the teaser, "{n} on weak ideas" or "Today" in meta, Review. No row at zero; it counts as one in "{n} open". No card text. A failed count says so with Try again and keeps the last count.
- **Queue**: a faint "{n} cards due", then the All due, Weak ideas first and Only weak ideas pills. The card is a rule-edged block, radius 10: the front at the note size on 1.7, then "Show answer" (the ink pill). On reveal, the back in graphite, the source and ideas in faint 13px, then four equal ratings (`.lh-rating`, an option card's ring, faint on hover): name, gap, and key in mono from 640px; two by two below it. Beneath: Edit (after reveal), History, Suspend, Delete as text actions. No idea or source shows before reveal.
- **After a rating**: a line under the card, "Good, back in 10 min.", and Undo last rating. Suspend and Delete offer Undo the same way.
- **States**: "No flashcards yet." with New card as the ink pill; "All done for now." and when the next comes; "None of the {n} due cards link to a weak idea." with Show all due; skeleton; failed with Try again. A failed refresh keeps the card. A shown answer isn't replaced by a change elsewhere.
- **Editor**: a lifted dialog: Front, Back, "Ideas from your graph" (a line field; chosen ideas rule-ringed chips), Preview, Close and "Save card" (the ink pill). Closing keeps the draft; only "Discard draft" drops it. A duplicate is a rule-edged block in the dialog with the matching front, "Keep both" and "Skip"; Escape closes it first.
- **All cards**: search over fronts, "Only weak ideas" when any exist, quiet rows with the front as plain text and meta, and the Library's More menu: Edit, History, Suspend or Unsuspend, Delete. No back.
- **Drafts**: recent runs in graphite with cost, then rule-edged blocks showing both sides. Keep (the ink pill), Edit, Skip. A likely duplicate says so above "Keep both". No "Keep all".
- **Deleted**: Restore, and "Delete for good", which alone confirms (the red pill).
- **Make flashcards**: a rule-edged block saying how many characters go to which model, then "Generate drafts" (the ink pill), "Write one by hand" and Cancel. With no model, the reason and Open settings replace the send. Doors: the Library's More menu on a page, the PDF card, and "This session" in the context view.
- **Activity**: a row "Making flashcards" with cost in the corner hint's list, linking to Drafts, with Abort.

## Diagrams

Feature 022; decisions in [its spec](specs/022-diagrams/spec.md). No dashed borders; `diagram.css` overrides React Flow's defaults with paper tokens, and React Flow's `colorMode` follows the resolved theme.

- **Doors**: "New diagram" in the Library opens a lifted dialog: three forms as radio rows, Name, Create (the ink pill). Palette: "New diagram". Tabs use the network icon.
- **Pane**: the page's 52px header: name, save state ("Not saved. Your diagram is kept in this browser."), then named icons as one group: Outline, Links, Export, History, Ask the tutor, Full screen. Full screen is the same element over the app; Escape leaves it and focus returns to the toggle.
- **Tools**: a toolbar row: undo, redo, Add {node, idea or note}, Connect, Draw (whiteboard, canvas), Link and Delete (canvas), then Canvas and List. Labels show from 620px, otherwise named icons. Unavailable tools are faint and say what to select.
- **Connect**: a shelf form under the tools: From, To, Label, Add, Close. It stays open to add more.
- **Canvas**: paper, no dot grid. A node is a shelf box, radius 8, 15px text, with the rule edge; a sticky note is paper with the lift, radius 10, 180×120 at least. Selected takes an ink edge. Edges are straight, faint with an arrow; labels sit on paper in graphite, 13px. Handles show on hover, focus and selection, always on coarse pointers with a 44px hit area. A linked node ends in a small link icon. Zoom out, in and fit sit bottom right, 40px up so the corner hint never covers them.
- **List**: below 360px of editor width it leads, and no canvas loads. Headed sections of fields: text, Link, Delete; then each connection's ends in graphite with its label field.
- **Outline**: a shelf block, 40dvh at most: each node, its connections, its links. A name moves focus to that node.
- **Export**: Download SVG, Download PNG, Download JSON. The file uses literal light-paper colours (src/core/diagram-svg.ts), so previews in History and Review read light in the dark theme too. A failure stays as one line.
- **History**: `Version {n} · {You, Tutor or Tutor, edited by you} · {time} · {cause}`. A chosen version shows its picture, what changed in words, "Read as text" and "Restore this version".
- **Proposal bar**: a line card, "The tutor proposed a change. Nothing has changed." with Review. In the Library, rows above the views: "{name} · Proposed by the tutor, waiting for you". In the transcript: "Diagram · proposed {name}, waiting for your approval" with Review.
- **Review**: a lifted dialog: "Proposed changes to {name}" or "Proposed diagram: {name}", the summary, "Nothing has changed.", a preview picture, then Added, Removed and Changed nodes, connections and links as counted lists in words. Reject, Edit first, Approve (the ink pill). Labels are text, always.
- **Edit first**: the editor on the whole screen: "Editing the proposal: {name}", Back to comparison, Approve. Escape takes the field, then returns to the comparison.
- **States**: skeletons; "Nothing here yet. Add a {noun} to start."; "{name} could not be loaded." with Try again; "This diagram was saved by a newer version of the app, so it can't be opened or changed here."; "This diagram changed elsewhere. Your version is safe here." with Keep mine and Use latest.
- **Links panel**: as a page's, worded for a diagram, with "Link the whole diagram" above it. A page's panel lists a diagram with "Diagram ·".
- **Settings → Agent**: "Diagrams", "Proposes diagrams and concept maps for you to review and approve".

## Demos and ML panels

### Demos

- A question's exact demo reference opens the workspace automatically once for that question. Closing or switching it is respected.
- One live iframe serves the inline, workspace and focused presentations. Its original location shows a preview while the workspace is active.
- Kit graph focus uses a native modal dialog and places parameters to the right. Narrow viewports use a collapsible lower parameter area.
- Expand animates from the selected graph; reduced motion removes that transition. Escape and Close restore focus and reading position without resetting simulation state.
- Legacy HTML expands as a whole demo. Do not infer graph boundaries or extract arbitrary controls.
- Preserve the sandbox (`allow-scripts`, no `allow-same-origin`). Bridge messages require the expected source window and validated payload fields.
- **Theme bridge**: a theme change updates the live iframe without replacing its document; parameter values, simulation history and 3D camera are kept. The bridge sends the paper roles (`--lh-bg` paper, surface shelf, surface-2 code, border rule, text ink, muted faint), the font (Instrument Sans) and the resolved `color-scheme` ("light" or "dark" only). Without the bridge (download, builder test) a demo follows the viewer's system through `light-dark()` defaults. Authored demo CSS may override the injected defaults.
- **Invert**: with nothing saved, a demo whose own page declares the other scheme is inverted to follow the theme live; the learner's saved switch wins.
- Quick plots (feature 005) are demos: a checked `plot` renders in the reply with the same workspace, expand, download and invert as a delivered demo, and joins the session's demos for bold-title links. A plot that failed its check shows only the quiet row; the agent explains in words.

### ML panels

- Chats containing completed ML or source results or composed ML panels use native Tab/Shift+Tab traversal. Keyboard-focused lookup summaries and paper page links keep native Enter activation, including while a check is waiting. Ordinary chats and pointer-focus Enter keep their existing rules (owner, feature 008).
- Six demo-kit kinds use the existing card, sandbox and kit controls: tokens, next-token bars, heatmap, network, scatter and shapes. All have Expand. Heatmap, next-token and scatter heads carry a plain faint "Illustrative numbers", before Expand; below 560px it moves under the title. Series colours come from the kit palette, never the bulb (owner override, feature 008).
- Bodies use kit tokens with no nested cards, borders, shadows or decorative gradients. Existing input edges and focus and selection outlines remain. Primary actions use ink fill. Dense chips, cells, points and neurons have one roving tab stop with arrows and Enter/Space pinning. Hover and focus produce matching live readouts and accessible names. Numeric values are tabular; monospace is reserved for token ids, gradients and tensor shapes.
- Token splits come from the server's pinned tokenizer. Text edits debounce 300ms through the validated local-only bridge; previous chips stay at 60% while "Updating…". Errors retain the previous split; downloaded demos say "Editing works in the app". Sampling recomputes temperature, top-k and top-p in the order Hugging Face transformers uses (top-k, renormalise, top-p, renormalise), writes cut reasons, and draws only retained tokens. Each row has an accessible name and updates the readout on hover and focus. A temperature, top-k or top-p bound to a demo parameter has only the demo's slider; the panel shows its own slider only for unbound values. A supplied title keeps its heading with `After “{context}”` above the bars; otherwise that phrase is the heading. Valid supplied slider values extend the bounds without clamping.
- Heatmaps expose every value, highlight its row and column labels and include a min/mid/max legend. Sequential colours run paper to blue; diverging colours run blue through paper to red. A strong cell's text is the paper on dark and the ink on light (`--k-strong-ink`). Omitted bounds derive from the data, including zero for diverging scales. Values print only at ≥44px cell width. Column and row labels stay on one line (ellipsis for long labels, the full label in the readout); grids keep at least 40px per column and scroll inside the panel instead of squeezing. Network steps compute forward and backward values locally, show signed gradients and label edge signs in words. Scatter arithmetic and distance are computed locally. Shapes start on their first step; changed dimensions have a shelf fill and ink edge and a derived previous-shape → current-shape explanation.
- Captions appear beneath each panel. Linked panels match exact raw labels; heatmap cells broadcast their key-column label. Focus preserves values, text, selections and camera, moves local and global controls into one sidebar and uses one phone Parameters toggle. Overflow stays inside the panel with hidden scrollbars; layouts work at 320/390/1440 and coarse targets are ≥44px. Transitions are at most 160ms and disappear under reduced motion.
- Binding reference: [008 canvas](https://claude.ai/artifact/EmWdcYcnZrXu5Ng1VyHiA6) and [UI contract](specs/008-ml-llm-lab/contracts/ui-contract.md), with owner clarifications in [progress](specs/008-ml-llm-lab/progress.md).

### Code and math

Shiki uses one CSS-variables theme for both sides (`components/ai-elements/paper-code-theme.ts`): keyword purple, string green, constant orange, function blue, comment faint, punctuation and parameters graphite, foreground ink, so a theme change recolours code without re-highlighting. Mermaid takes the paper tokens. KaTeX inherits its colour.

## Course track

The plan popup (viewport on shelf, no border; zoom buttons paper with the lift) shows a "Course" section below the diagram when the lesson has a recorded syllabus (feature 006): the heading with the course title (linked) and "{covered} of {items} covered", then one row per item in course order in the meta register: kind (Lecture, Problem set, Notes, Reading) in faint, the title (linked, new tab, underlined), "Topics: …" in faint 14px, and the state ("Covered" in ink, "Not yet" and "Not in this lesson's plan" faint). With a syllabus the popup scrolls and the diagram keeps 60vh (at least 280px). Plan block titles are 13px Instrument Sans; box widths come from a width estimate fitted to that face. Home's lesson rows append " · Course: {covered} of {items} covered" to the progress line.

## Settings

One modal for both modes (Components, Layout), opened from the sidebar footer and Mod+,.

- **Nav**: Customize, Reviewers, Providers, Agent, Graph, Keyboard, General. Each mode opens on its own first page when no page is asked for: Customize in Notebook, Providers in Study. `open("models")` maps to Agent, `"appearance"` to Customize. Opening focuses the current page's tab; the search field is one Shift+Tab away.
- **Customize** (both modes): Appearance (system, light, dark), Text size (3 steps), Lettering (serif, plain), Ink colour, then a faint "In Notebook" label over a hairline with Notebook's own rows. One setting each applies to both modes (owner gate 1).
- **Pages**: the title as Notebook's settings title; groups are a 14/18 500 label over one rule-edged card (radius 10) of rows: label 14/18 500 ink, hint 12.5 faint, control on the right, stacked below a 32rem card (a lone switch stays beside its label). Toggles are switches; model and engine triggers and native selects are 32px boxes ringed in the control edge with `.nb-menu` menus; Quizzing is a pill row; single-line inputs are line fields; text actions are faint text buttons. Phones: the nav is the search over a sideways-scrolling tab row; three-choice card groups stay three across, layouts stack below 480px, the inks go four across.
- **Search**: "Search settings" matches every row's name and hint, Customize and Reviewers included. Results list under their category headings in the nav's place ("Nothing matches {query}" otherwise). Choosing one or pressing Enter clears the search, opens the page, scrolls to the row, focuses its first control (a card group focuses its chosen card) and shows a shelf highlight for 160ms. Escape clears a non-empty search before it closes the modal.
- **States**: while loading, a page shows its title over row skeletons. A failed load reads "Settings could not be loaded." with Try again. A failed save stays pinned under the page title with a hairline: "Your {section} settings could not be saved.", Show details for the raw reason, and Try again repeating that save. The row keeps showing what is stored. Providers, models, prompts and graph display each state their own failure with Try again.
- **Unavailable rows** use faint on label and hint with a locked control, never opacity (owner, 2026-10-30).
- **Escape and focus**: Escape closes the innermost layer first (search, key editors, rebind, section menus, connection dialogs, then the modal). Focus returns to the opener, or, when the opener is gone, to what held focus when the modal opened, else to the ☰. Outside clicks on the dim close it, except on a menu or another modal. Menus portal into the active modal. Changes persist immediately; section and row deep links keep working.
- **Graph → Display** holds the graph's display controls, as switches (`toggle-background-colors`, `toggle-cluster-labels`).
- Coarse pointers get 44px controls.

## Dialogs and states

- **Dialogs** are the lifted dialog: delete session and idea(s), abort, dismiss and discard, the setup dialog, the lazy setup and connection loading shells, connection dialogs (over the settings modal), the keyboard cheat sheet, Library, Review and diagram dialogs. The title is ink, 19px; a destructive action carries its red on the pill, not the title. Settings, setup and connection dialogs contain focus.
- **Setup**: the setup dialog's body scrolls under a fixed head; triggers are `.nb-set-trigger`, the key field `.nb-set-input`, Save key and Save models the ink pill, no separator lines. The setup call to action in the composer ("Add a provider key" / "Set up your models") is the ink pill.
- **Empty states**: one sentence, `text-md` faint, on the reading edge, with the action as a text action. No centred illustrations. components/ui's Empty and the minimal home stay centred (owner, 2026-10-06).
- **Loading**: shelf skeleton bars, no pulse under reduced motion; opaque scrims only inside loading shells.
- **Errors**: view-level and dialog failures read as an ink sentence with Try again and Show details as text actions; inline refusal lines (Library, Review, diagrams) use `--text-red`. A failed refresh keeps the last good data. A view that fails to render reads "This view could not be shown." with Try again and Show details, on the reading edge under a TopBar, the detail in mono graphite. A missing route reads "This page could not be found." under a TopBar.
- **Update banner**: a lifted card (radius 10) under the band at the top right, Restart as the ink pill.
- **Toasts** and status lines are in the corner hint's register; undo toasts are lifted cards (radius 10).
- Home, chains and activity share the same surface and control tokens. Loading, empty and failed stay distinct.

## Hosted and Electron

- **Hosted** (Clerk): `components/clerk-appearance.ts` takes paper tokens as CSS variables for every colour (paper, ink, faint, shelf, rule, red, green, bulb-ink, focus, backdrop, fonts), so it follows light, dark and system with one set; the card and the account popover get the lift and radius 12, the primary button the ink pill. Sign-in and sign-up pages are on paper. The account menu opens inside the sidebar dialog. "Continue with ChatGPT" shows OpenAI's official black mark on light paper and the white one on dark.
- **Electron**: the system title bar is hidden (macOS hiddenInset; Windows and Linux hidden with the native controls overlay). Study's bands are the drag surface (`.lh-drag`, a dedicated mask first in the DOM; native interactive elements carve out automatically, `.lh-no-drag` only for clickable non-natives; an overlay with a TopBar is the last child of its container). The traffic lights sit at x 16, y 29.25, so their centres are on the bands' centre line at 36px; the ☰ keeps a 92px gutter after them (`.lh-closed-toggle`, divided by `--lh-zoom` so it stays physical under ⌘±), and the sidebar's ✕ keeps the same gutter. Windows and Linux reserve the native buttons' width through `env(titlebar-area-*)` (`.lh-wco-gutter`). The window background and title bar overlay follow the paper colour per theme through `lh.setChrome`, and a cold start opens on the OS's light or dark paper (`#f8f7f4` / `#1a1a19`), so nothing flashes another colour before React mounts. The renderer never shows the Electron window controls over content.

## Changed by feature 025

Rules from the earlier file that no longer hold, and why:

- **Study ink** (ground `#0b0b0a`, raised `#151513`, raised-2 `#1d1d1a`, `ink-2`, the 7% / 14% edges) and elevation by raised steps: replaced by the paper tokens and the shelf. Owner goal (2026-11-07): one design system, Notebook's tokens, Study ink removed.
- **Amber accent** for the learner's turn, the primary action, the chosen option and focus: primaries are ink-filled, chosen options take the 1.5px ink ring, focus is `--nb-focus`, and only "Your turn" and the waiting dot keep a warm colour, `--bulb-ink` (gate 1, question 4). Every "amber Done / Accept / Approve / Show answer / Save card / Generate drafts / New card" is now the ink pill.
- **No drop shadows**: now the lift on floating surfaces only (owner goal; research R16).
- **Source Sans 3 and serif titles** (Newsreader 500-600 for headings and titles; the 12/13/15/17/22/30/40 scale; the 17/27 reading baseline): Instrument Sans for UI and titles, Newsreader 420 for the voice only, the paper scale (owner goal: Notebook's fonts and type scale).
- **Reading preferences and custom backgrounds** (reading font, prose size, heading weight, bold/italic colours, serif session names, the Appearance section and its live preview): retired from styling; the values stay on disk and Study's old mode seeds the shared theme once. Customize holds the shared set (gate 1, question 1; constitution 1.1.3).
- **Persistent resizable left sidebar** with its full-height divider and grip (owner, 2026-10-31), its header search field, "New" menu, 15px titles and serif date shelves: Study uses Notebook's overlay sidebar (owner goal: the same overlay sidebar in both modes; research R6). The right pane's divider stays, as a hairline without a grip.
- **52px app and demo header alignment** and the traffic lights aligned to the old phase pill (y 22.5): bands are `--lh-band` tall with their row on the ☰'s centre line, which sits where Notebook's header puts it (spec US1, "nothing jumps"; phase 11).
- **The prompt bar's question zones** (turn strip, prompt body in the dock, collapse while reading history, "the answer well stays, so a draft is never hidden"): checks and problems are margin threads; a closed thread hides its form and shows "Draft kept" (gate 1, question 2).
- **Raised user-turn block with a "You" label**: no block; a faint "You" line (owner goal: no bubble, no raised block).
- **Tabs and palette on raised steps**: tabs are faint with an ink underline; the palette is a lifted 560px card (owner goal: Notebook's language).
- **Settings with icon categories, a "Settings / section" header and serif section titles**: Notebook's modal with Study's categories in its nav (spec US5).
- **Selection bubble as a raised toolbar** (Bold, Italic, Link, wrapping at 22rem) that stayed open after an action: Notebook's selection card, which closes and collapses the selection after an action (spec FR-030; phase 11).
- **Export as Copy as Markdown, Download .md and Print; print "in Study ink's paper colours"**: the shared export dialog; print on light paper (FR-030).
- **Activity dock and the sidebar's Background agents section**: the corner hint and its popover (research R13).
- **"No side rules on quotes"**: the page editor's quotes take Notebook's 2px ink rule (Notebook's note body for both modes).
- **Red small titles on destructive dialogs** (2026-10-13): ink dialog titles with the red on the pill (the lifted dialog, FR-032).
- **Update banner at the bottom right**: under the band at the top right, where it covers neither the composer nor the corner hint.
- **PDF pages "white paper on the ground", diagram exports "in literal Study ink colours"**: white pages in the pane's gutters; exports in light-paper literals.
- **Keyboard focus "in ink instead of the amber ring" for feature 008's rows**: every control now uses the same `--nb-focus` ring.
- **"These rules override Study ink only inside Notebook"**: the Notebook rules are the app's rules.
