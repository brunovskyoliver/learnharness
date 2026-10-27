# Research: Study ink and prompt bar

Each entry: Decision, Rationale, Alternatives. Entries marked (agent) are technical choices made without the owner during the unattended run; review them first.

## R1 Token mapping

- **Decision**: Keep shadcn role names and remap values in `:root, .dark`: `--background #0b0b0a`, `--card`/`--secondary`/`--muted #151513`, `--popover`/`--accent #1d1d1a`, `--foreground #edece8`, new `--ink-2 #b4b2ab`, `--muted-foreground #85837c`, `--border rgb(255 252 240 / 7%)`, `--input rgb(255 252 240 / 14%)`, `--primary #e3a957`, `--primary-foreground #0b0b0a`, `--ring` = primary, `--message-surface` = card. Add Tailwind color `ink-2`.
- **Rationale**: Every component already reads the roles; remapping changes the whole app at once and keeps the demo theme bridge and the custom-background derivation working.
- **Alternatives**: New token names everywhere (large churn, no benefit).

## R2 Opacity text greys (agent)

- **Decision**: Map `text-muted-foreground/{70,80}` → `text-muted-foreground`; `/{40,50,60}` → `text-muted-foreground` (disabled states keep `opacity-*` on the control, not on text color); `text-foreground/{70,80,85}` → `text-ink-2`; `text-foreground/50` → `text-muted-foreground`.
- **Rationale**: Tertiary ink is the faintest passing ink; anything fainter fails 4.5:1.
- **Alternatives**: Keep `/70` (fails contrast at small sizes on the new ground).

## R3 Type scale (agent)

- **Decision**: `--text-xs 12`, `--text-sm 13`, `--text-base 15`, `--text-lg 17`, `--text-xl 22`, `--text-2xl 30`, `--text-3xl 40`. UI text that used `text-xs` (12) moves to `text-sm` (13) except monospace metadata; `text-[11px]` → `text-xs` for mono, `text-sm` otherwise; `text-[16px]` → `text-base`/`text-lg` per role. The session scale rule (`.lh-session-scale`) keeps its clamps with the new floors.
- **Rationale**: FR-005 and FR-025; 13 px floor.
- **Alternatives**: Rename the Tailwind steps (breaks every utility).

## R4 Title face (agent)

- **Decision**: Load Newsreader via `next/font/google` (`preload: false`, `display: "swap"`, weights 500 and 600, variable `--font-newsreader`). Factory `--font-title` = Newsreader. `appearanceVars` sets `--font-title` to the prose font only when the learner chose an explicit reading font. Prose `h1` and `h2` and `.font-title` use `--font-title` at `min(var(--lh-heading-weight), 600)`; `h3`–`h6` stay in the prose family. Remove the CMU local font and the `.font-title { font-weight: 900 }` rule. The legacy `sessionNameSerif` flag stays stored and ignored, as today.
- **Rationale**: FR-004 and DESIGN.md's "explicit reading-font preference applies consistently". `preload: false` keeps startup flat.
- **Alternatives**: Self-host the file (extra asset handling, same bytes).

## R5 Radii and elevation (agent)

- **Decision**: `--radius-sm 6`, `--radius-md 6`, `--radius-lg 10`, `--radius-xl 10`, `--radius 6`. `rounded`/`rounded-xs` map through the same tokens. `rounded-full` stays only for the round send, status dots, avatars and the context ring button. All `shadow-*` and `backdrop-blur*` utilities in app-owned components are removed; loading scrims use `bg-background` (opaque) instead of `/80` plus blur.
- **Rationale**: FR-006, FR-007 with the fewest edits (token remap does most of the radius work).
- **Alternatives**: Rewrite every `rounded-*` class (high churn).

## R6 Prompt bar structure

- **Decision**: Add to `prompt-controls.tsx`: `TurnStrip` (label "Your turn", kind, trailing slot), `AnswerWell` (inset field wrapper with visible label and `:focus-within` ring), and a `PrimaryAction` (labelled 6 px button, accent when enabled, raised-2 when disabled). `PromptToolbar` gains a `setup` slot that replaces the controls. `PromptSubmit` (round arrow) is used only for plain chat. `.prompt-shell:focus-within` no longer recolors the border; the well carries the ring.
- **Rationale**: One shared anatomy for three surfaces (FR-011) without touching the shell, its height morph or its compaction machine.
- **Alternatives**: Merge the three docks into one component (risky, touches tested state machines).

## R7 Turn kind labels (agent)

- **Decision**: Kind text: quiz → "Lesson check" (probe → "Question", predict → "Prediction"), explain → "Explain" (recall → "Recall"), ask → "Question", practice → "Problem". The reveal variant keeps its "Check your understanding" invitation copy inside the strip as the teaser heading, with "Open" becoming an "Answer" button; the play icon is removed.
- **Rationale**: Keeps owner-ruled tool labels (Probe/Recall/Prediction) while unifying the strip.

## R8 Setup prompts in the toolbar

- **Decision**: `chat.tsx` stops portaling `setupCta` into the transcript and passes it to `StatsBar` as `setup`; when set, the toolbar renders it instead of the model control. Same for home and new-session through `ComposerActions`' setup slot (moved into the toolbar). Copy unchanged ("Add a provider key", "Set up your models"); test ids unchanged.
- **Rationale**: FR-016; no behavior change to the setup dialog.

## R9 Model triggers without "—" (agent)

- **Decision**: Model trigger text = model name, else "Choose a model". Thinking trigger = "Thinking: {level}" (prefix hidden below 640 px), else "Thinking". When the catalog has zero models, `ModelControl` renders nothing (the setup slot covers it).

## R10 Usage percentage

- **Decision**: Usage button shows the ring plus `{n}%` (rounded) when the limit is known, `?` otherwise; screen-reader text unchanged.

## R11 Skip

- **Decision**: `PracticeDock` gets `onSkip`; `chat.tsx` passes a handler that opens the existing abort confirm in "problem" mode (`setAbortAsk("problem")`), the same path as Escape.

## R12 Queued steers removal (agent)

- **Decision**: Rows get a remove button only if the queue exposes a cancel; if the steer queue has no cancel API, rows render without the remove control and the gap is reported rather than adding a server change. (Checked during implementation; see progress.md.)
- **Rationale**: Principle I/III: removing a write-ahead steer may need server work outside this UI feature.

## R13 Transcript alignment

- **Decision**: User rows and agent thinking rows render inside the same `.lh-reading` measure as assistant prose; the user row becomes a 10 px-radius raised block without the 3ch inset. Blockquote and thinking lose side borders (indent + ink-2). Phase labels become left-aligned running heads. The demo inline preview becomes a one-row link. The turn rail renders only with ≥3 turns.

## R14 Verification substitutes

- **Decision**: Contrast verified with a small script over the token pairs; Playwright screenshots of the four review threads at 320/390/1440; `npm test`, lint, typecheck, build. Required UI skills unavailable (Principle VI exception).
