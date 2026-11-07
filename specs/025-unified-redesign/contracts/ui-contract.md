# UI contract: Unified redesign

Every existing string stays unless listed under "New or changed strings". Values come from Notebook (DESIGN.md "Notebook", 024 visual-reference.md); this file says which Notebook part each Study surface uses.

## Token mapping (codemod table)

| Study (remove) | Paper (use) |
| --- | --- |
| `bg-background`, `--background` ground | `bg-paper` (`--paper`) |
| `bg-card`, `bg-muted`, `bg-secondary`, `--surface-raised`, `--message-surface` | `bg-shelf` (`--shelf`) |
| `bg-popover`, `--surface-raised-2` (menus, dialogs, floating) | `bg-paper shadow-lift` (`--paper`, `--lift`) |
| `bg-accent` (hover, active row, selection) | `bg-shelf` |
| `text-foreground` | `text-ink` |
| `text-ink-2`, `--ink-2` | `text-graphite` |
| `text-muted-foreground` | `text-faint` |
| `border-border`, `border-input`, edges | `border-rule` |
| `bg-primary` / `text-primary-foreground` (primary action) | `bg-ink text-paper` (hover: ink at 88% mixed with paper) |
| `text-primary` as "your turn"/waiting | `text-bulb` / `bg-bulb` (owner Q4) |
| `text-primary` anywhere else | `text-ink` |
| `ring-ring`, `--ring` (amber) | `--nb-focus` |
| `text-destructive`, `--destructive` | `text-red` (`--text-red`) |
| `--success` | `--text-green` |
| `--warning` | `--bulb` |
| `font-ui`, `font-prose`, `font-sans` | `font-sans` (Instrument Sans) |
| `font-title` | `font-sans` at 500, −0.032em on titles; `font-voice` only for tutor text |
| `font-mono` | `font-mono` (`--nb-mono`) |
| `rounded-md` 6px controls | 8px (`--radius-md`); cards/panels 10px; menus/selection card 12px; dialogs 12px (export), 16px (settings); round only for dots, send |
| Study type sizes 12/13/15/17/22/30/40 | paper scale (research R4): 12 → `text-xs`, 13 → `text-sm`, 15 → `text-reply`/`text-md`, 17 reading → `text-base`, 22 → `text-xl`, 30 → `text-2xl`, 40 → `text-title` |

Shadows: only `shadow-lift` on floating surfaces (menus, popovers, dialogs, sidebar, side panels, the selection card, toasts). No other shadow.

## Surfaces

- **Root**: `html.lh-paper` with `data-theme`, `data-ink`, `data-text-size`, `data-lettering`; `body` paper with the fixed grain layer (`.nb-paper`), `color-scheme` per theme.
- **Top-left chrome (Study)**: Notebook's ☰ (`MenuGlyph`, "Open sidebar") and wordmark (links to Home in Study, to the note in Notebook).
- **Overlay sidebar**: Notebook's `.nb-sidebar` (288px, 78vw max, lift, grain, dim, ✕ "Close sidebar"). Study body per research R6.
- **TopBar**: 52px band, toolbar-row type; title in `text-sm` ink 500; actions as toolbar buttons (13px faint, icon 15px, ink on hover).
- **Tabs**: research R7.
- **Command palette**: Notebook's finder look: 560px lifted card (radius 12), field 15px sans with no box (rule underline), rows 36px (44 coarse) with `text-ui`, active row `bg-shelf` with the inset focus ring when keyboard-active, meta faint 12.5.
- **Menus, tooltips**: `.nb-menu` / `.nb-menu-item`; tooltips paper + lift, 12px graphite, radius 8.
- **Toasts / status lines**: corner-hint register (11.5-12.5px faint/graphite), lifted card for undo toasts (radius 10).
- **Dialogs**: lifted paper card (radius 12, grain), title `text-xl` 500 ink, body `text-md` graphite, actions right: secondary as text buttons, primary ink-filled pill (`.nb-pill`); backdrop `.nb-dialog-backdrop`.
- **Option cards**: `.nb-option-card` (radius 10, rule edge, chosen 1.5px ink ring, no fill) for settings choices, check choices, the New menu's Lesson/Practice in the setup flow, export formats.
- **Switches**: `.nb-switch`.
- **Fields**: reply-line field (no box, 1px rule underline, AI-ink line draws on focus) for single-line answer fields, search fields and rename fields; multi-line fields (composer, editor) keep the caret-only focus.
- **Transcript**: research R9-R10. Reading edge: one column, measure 660px at ≥768 (Notebook's column), 22px left gutter on phones.
- **Check thread**: research R8. Thread width 410, gap 71 from the column, tether from the anchor paragraph's last line, Notebook's unfold/settle and ink-in on the question.
- **Bottom bar (composer)**: a lifted paper shell (radius 12) over the transcript's foot, field on the shell (caret only), toolbar: model, thinking, usage ring in 12.5px faint; send round ink button; Stop as ink pill.
- **Right pane**: research R11.
- **Home**: title "What do you want to learn?" as a Notebook title (sans 500, −0.032em, `text-title` scaled to 0.7 → 30px class `text-2xl`); section heads `text-lg` 550 ink; rows as quiet list items on paper (no raised fill), hover `bg-shelf`, kind label in `--bulb` for waiting items (owner Q4), teaser `text-base` graphite; Answer/Solve as toolbar text buttons. Graph box: `bg-shelf` radius 10, graph colours from tokens (nodes ink, focus ring, muted faint).
- **Library, Review, Settings, Diagrams, PDFs**: rows quiet on paper with hover shelf; pills as `.nb-pill`; dialogs as above; settings per spec US5.
- **Empty states**: one sentence, `text-md` faint, left-aligned on the reading edge, with the action as a text button. **Loading**: shelf skeleton bars (no shimmer under reduced motion). **Errors**: sentence in ink + Try again text button + Show details.

## New or changed strings (our words, Notebook's voice)

| Where | String |
| --- | --- |
| Bottom bar, check pending | "Answer the check beside the lesson" · button "Go to it" |
| Bottom bar, problem pending | "Solve the problem beside the lesson" · button "Go to it" |
| Collapsed check thread | "{Kind}" (Lesson check, Question, Prediction, Explain, Recall, Problem) + teaser + "Answer" / "Solve" |
| Overlay sidebar (Study) search placeholder | "Find a session or page" |
| Overlay sidebar (Study) footer | "Settings", "Command palette", "Switch to Notebook", "Sign out" (hosted) |
| Corner hint idle (Study) | "⌘K searches everything" / "Ctrl+K searches everything" |
| Settings nav | "Customize", "Reviewers", "Providers", "Agent", "Graph", "Keyboard", "General" (Study's "Appearance" category is folded into Customize) |
| Learner turn label (screen readers and a faint meta line) | "You" |
