# Keyboard shortcuts

Decided 2026-09-17 (owner key-map review after the first draft; the whole
app must be usable with the keyboard only — voice first, keyboard as the
second pillar of input).

## Architecture

- **Registry**: `src/core/keyboard.ts` — `KEYBOARD_ACTIONS` holds every
  action: `{ id, label, scope, binding }`. The cheat sheet renders FROM
  the registry, so it can never list a non-functional shortcut.
- **Provider**: `components/keyboard-shortcuts.tsx` — one window-level
  keydown listener (bubble phase, mounted once in AppShell). Normalizes
  keys to `mod+d`-style strings, resolves overrides, dispatches
  `lh:kbd-<action-id>` window CustomEvents. Surfaces listen for their
  own events (matching the pre-existing `lh:chat-renamed` seam style).
- **Persistence**: overrides live under localStorage `lh:keymap` as
  `{actionId: binding}` merged over defaults. No editor yet — the
  settings milestone owns key map editing.
- **displayOnly entries**: the registry also lists SURFACE-owned keys
  (the question dock's row machine) for the cheat sheet only —
  `effectiveKeymap` skips them so bare arrows can never leak to pages
  where the surface isn't mounted.

## Rules

- **Tab cycles the active surface's text fields** (owner, 2026-10-06):
  forward only, wrapping; Tab from outside the chain focuses the first
  field (`components/field-cycle.ts`). Dialogs and menus keep their own
  focus trap. Shift+Tab cycles the thinking level — also while typing in
  a field (modifier combos are the only keys that fire from typing
  surfaces; bare keys never do).
- **Esc priority chain**: topmost popover → cheat sheet → cancel
  dictation (DISCARD — the transcript flush is Cmd+D/Stop only, owner
  round) → abort turn (local stream only — a server-side wake turn has
  no client request to abort). Every element/document-level Esc handler
  that acts calls `e.stopPropagation()` so the window chain never
  double-fires. The session search claims Esc to blur back to normal.
- **Focus ring**: keyboard focus is always visible (owner, 2026-10-27;
  constitution principle VI). `app/globals.css` draws a `--ring` outline
  on `:focus-visible` only, so pointer clicks show no ring.

## Key map (Wave A — global)

| Action | Binding | Seam |
|---|---|---|
| Toggle dictation | ⌘D | `lh:kbd-toggle-dictation` (dictation.tsx) |
| Command palette | ⌘K | `lh:kbd-command-palette` (command-palette.tsx). The page editor keeps ⌘K for its link popover; the palette also stands down in the editor's toolbar and fields, dialogs and menus (features 014-015) |
| Model selector | ⌘⇧K (was ⌘K until feature 015) | `lh:kbd-open-model-picker` (model-picker.tsx); also "Choose a model" in the palette |
| Focus the open tabs | ⌘⇧E | `lh:kbd-focus-tabs` (workspace/tab-strip.tsx) |
| Toggle right pane | ⌘\\ | `lh:kbd-toggle-right-pane` (workspace/workspace-context.tsx): collapses a page or demo, or shows the context view |
| Cycle thinking level | Shift+Tab | `lh:kbd-cycle-thinking` (model-picker.tsx) |
| Toggle sidebar | ⌘B | `lh:toggle-sidebar` (sidebar.tsx) |
| Sessions search | ⌘⇧F | `lh:kbd-sessions-search` (sidebar.tsx) |
| Walk search results | ↑ / ↓ *in the search field* | sidebar.tsx (cycles the filtered rows, wraps) |
| Open search result | Enter *in the search field* | sidebar.tsx (walked row, else the first match) |
| ~~Cycle session~~ | ~~⌥↑ / ⌥↓~~ | RETIRED (owner, 2026-10-10) — the search walk above replaces it |
| ~~Open selected session~~ | ~~⌥Enter~~ | RETIRED (owner, 2026-10-10) — the search Enter above replaces it |
| Jump to graph (home) | ⌘G | router.push in keyboard-shortcuts.tsx |
| New session | ⌘N | router.push in keyboard-shortcuts.tsx |
| Show the answer, rate 1 to 4, undo the last rating | Space, 1 2 3 4, U *on `/review`, outside fields, dialogs and menus* | `components/review/queue-panel.tsx` (displayOnly: never dispatched from the registry) |
| Rename session | F2 | `lh:kbd-rename-session` (chat.tsx) |
| Cheat sheet | ? | keyboard-shortcuts.tsx |
| Find (graph: node search) | ⌘F | `lh:kbd-find` (graph-view.tsx; chat transcript search rides the same event when that feature lands) |

## Tab strip and sidebar block (features 014-015)

- **Tab strip**: one tab stop. ←/→/Home/End walk without activating, Enter or Space activates, Delete closes, Esc returns to where focus was. The handlers claim their keys in the capture phase, so lesson handlers never see them.
- **Sidebar block**: ⌘⇧F, Tab (resize rail), Tab reaches it. ↑/↓/Home/End walk Lessons, Practice, Library and the folders. → and ← open and close the Library row and folders, and ← goes to the parent. Enter activates.
- **Palette**: a combobox over a listbox. ↑/↓ wrap, Enter takes the active row, Esc or ⌘K closes, and focus returns to the opener.

## Model menu keyboard machine (owner polish, 2026-09-17)

(Removed from the settings/cheat-sheet registry 2026-10-10 — obvious
in-field navigation; the behavior below is unchanged.)

While the model menu is open, focus stays in the search field and the
menu owns ↑/↓/Enter inside the input's own handler:

- **↑/↓** walk the filtered results — clamped, no wrap. First ↓ starts at
  the first row; first ↑ at the last. The walked row gets a muted ring and
  scrollIntoView.
- **Enter** picks the walked row, or the **first result** when nothing is
  walked yet (owner decision). Typing a new query resets the walk.
- Clicking and Enter share one `pickModel` path; Esc still closes the menu.

## Question dock row machine (Wave B, owner rounds 2026-09-17)

While a question is expanded, the dock owns ↑/↓/Space/Enter/Tab:

- **↑/↓** walk every answerable row in order — options first, then the
  quiz's "I don't know" / the ask's "Other…" (never both) — **clamped at
  the ends, no wrap** (owner: faster to navigate when the walk stops).
  The walked row gets a subtle ring (`bg-accent/40`) and scrollIntoView.
- **Space** acts on the walked row exactly like a click: multi toggles,
  single displaces; Other also focuses its inline input for typing.
- **Enter** submits once an answer exists (`canSubmit`).
- **Tab (plain)** toggles focus between the thinking field and the
  answer rows — nothing else (owner round 3). From the thinking side it
  focuses the walked (or first) row; from the rows it returns to the
  thinking field. Focus follows the walk while the user is in the rows,
  so focused and walked never diverge. Shift+Tab is NOT the dock's —
  the global thinking-level cycle owns it everywhere.
- Guards: keys from a typing surface keep their native meaning (arrows
  move the caret, space types — the thinking field is never hijacked),
  and modifier combos are never the dock's — Alt+arrows cycle sessions
  without ALSO walking the question rows (owner round 3). The listener
  lives only while the dock is expanded — collapsed, the bar's native
  Enter expands it.

## Status

- Wave A (global plumbing + shortcuts above) — landed, CDP-verified.
- Wave B (question row machine) — landed, CDP-verified.
- Wave C remainder: ⌘F chat transcript search (new feature, needs its own
  design pass), ⌘I import notes on graph. ⌘F graph node search shipped
  early (owner live-tested the gap).

## PDF reader

Select text in the reader's toolbar starts a selection on the first word of the page in view. On the pages region: arrows move a word or line and go on to the next page at an edge; Shift with an arrow extends, within the page; Enter moves focus to the actions; Escape ends the selection and keeps the reader open. Feature 023.
