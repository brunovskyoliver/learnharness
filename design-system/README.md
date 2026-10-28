Study ink is the interface of Brunovský's study, a learning app for guided lessons, practice and a knowledge graph. It is a dark reading room, not a terminal. The interface steps back so the lesson comes forward, and one amber accent always means "this needs you".

## Content fundamentals

- Write plainly, in sentence case, the way a tutor talks. Name things by what the learner recognizes ("Your thinking", "Lesson check"), never by how the system is built.
- Every action is a verb: "Submit answer", "Next problem", "Skip", "Stop". "Add a provider key" and "Set up your models" say what to do next.
- An empty value is a sentence, not a glyph: "Choose a model", "Thinking", "?" for an unknown context limit. Never "—", never a fake 0.
- Speak to the learner as "you" ("Your turn", "You"). No emoji, no exclamation marks.
- A label and a placeholder never repeat each other. A labelled field has no placeholder.

## Visual foundations

### Color

- Two themes. Dark is the app's own and the default. Light is a paper version for documents, print and light surfaces: the same roles, with a deeper amber (`primary` `#8c530a`, white `primary-foreground`) so the accent still reads as text. The app itself ships dark only.
- Grounds: `background` for the canvas, sidebar, lesson and demo chrome. `surface-raised` for the prompt bar, cards, the user turn and the demo frame. `surface-raised-2` for menus, hover and selected rows, and quiet buttons. Elevation comes from these three steps only.
- Inks: `foreground` for prose, titles and values; `ink-2` for labels, secondary copy and toolbar triggers; `muted-foreground` for timestamps, hints and meta. Each passes 4.5:1 on all three grounds. Never make a text colour with an opacity modifier.
- Accent: `primary` (amber) is reserved for the learner's turn (the Your turn label on `primary-soft`, waiting dots in the sidebar), the primary action, the selected choice and keyboard focus (`ring`). Text on an amber fill is `primary-foreground`. Links and decoration never use it.
- Edges: `input` for choices, inputs and the context ring track. `border` only for table rules. No structural separator lines between panes, headers or rows.
- Status: `destructive` and `success` always come with a word or mark. `warning` shares the amber, so pair it with words.
- `accent` is shadcn's hover surface (the same as `surface-raised-2`), not the brand accent.

### Type

- Source Sans 3 (`sans`) for interface text, prose, questions and answers. Newsreader (`title`) for lesson h1 and h2 and page titles, at 500 to 600, never black. JetBrains Mono (`mono`) for code and numeric metadata only.
- Use the ladder: `display` 40, `title` 30, `heading` 22, `reading` 17/27, `ui` 15, `label` 14, `meta` 13, `mono` 12. 13px is the floor for UI text; 12px only in mono.
- A learner's explicit reading-font choice applies to the interface and titles alike.

### Shape, spacing and motion

- Radii: `radius-sm` (6px) for controls, `radius-lg` (10px) for cards, the prompt bar and menus, `radius-full` only for the round chat send, status dots and avatars.
- Spacing is a 4px rhythm (`space-1` to `space-8`). The page gutter is at least `space-4`.
- No drop shadows, no backdrop blur, no gradients, no dashed borders, no side rules on quotes or thinking blocks.
- Motion: 160ms for state changes, 240ms for layout (the prompt bar's height morph). Reduced motion keeps the change without the transition.
- Scrollbar tracks and thumbs are hidden everywhere; scrolling stays.

## The prompt bar

One `surface-raised` shell holds four zones in a fixed order. Only their contents change.

1. **TurnStrip**: "Your turn" plus the kind of turn and a collapse control. Collapsed while reading history, it replaces the prompt body with a one-line teaser and an Answer or Solve button.
2. **Prompt body**: the question in `reading`, any note in `muted-foreground`, ChoiceRow options, then Confidence. Only this zone scrolls; a fade at its bottom edge shows there is more.
3. **AnswerField**: directly on the shell, no inner box. Its label brightens while the field has focus.
4. **PromptToolbar**: model, thinking and usage in words on the left; exactly one PrimaryAction (or the chat SendButton) on the right. Setup buttons take the triggers' place when no key or models exist.

Practice problems add a Skip (`prompt-secondary`) beside Submit; it opens the same confirmation as Escape.

## Transcript

- Assistant prose, UserTurn, agent thinking rows and phase running heads ("Planning", "Teaching") all start on one reading edge.
- Phase labels are left-aligned `meta` text in `muted-foreground`, with no rule.
- While the workspace shows a demo, its place in the lesson is one `surface-raised` row linking to it.

## Iconography

- Lucide icons at 16px with a 1.75 stroke, coloured by `currentColor` (usually `ink-2` or `muted-foreground`). Icon-only buttons need an accessible name.
- The mark (`assets/Logos/study-mark.svg`) is fixed white and grey. Use it on the dark theme's `background` or `surface-raised` only; on the light theme, set the name in type instead.

## Using the components

The components are `window.StudyInk` in `components/bundle.js` and need React 18 on the page. Their stylesheet `components/bundle.css` reads the tokens by name (`var(--primary)`, `var(--radius-lg)`). They are small hand-written renditions of the app's code for reference and prototyping; the app itself is the source of truth.

Not synced from the app: the model picker and usage menus, the settings dialog, the knowledge graph and the demo kit's charts. Plotly chart data keeps its own colours.
