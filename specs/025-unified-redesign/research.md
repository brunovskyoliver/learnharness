# Research and decisions: Unified redesign

Each decision is reversible and technical unless marked "owner". Sources: the three code maps made 2026-11-07 (chat dock and transcript; appearance and settings; Notebook components), feature 024's spec, plan, progress and DESIGN.md section.

## R1 Where the tokens live

**Decision**: `app/paper.css` defines the tokens on `html.lh-paper` keyed by `data-theme` (light | dark | system with a `prefers-color-scheme` block), `data-ink`, `data-text-size`, `data-lettering`. The values are 024's, byte for byte (raised-contrast faint, gray, orange, `--nb-focus`, per-ink fades). `.nb-root` no longer defines tokens; NotebookApp still sets `data-nb-*` on `.nb-root` (its e2e tests read them) and they always equal the html attributes.

**Why**: one source; the server can render the right theme on first paint for every route; the graph canvas and demo bridge observers watch `<html>` (their attribute filters gain the `data-*` names).

## R2 Shared Appearance storage (owner gate 1, Q1)

**Decision**: the shared values are `notebook.appearance`, `notebook.textSize`, `notebook.lettering`, `notebook.ink` (already stored and validated). Resolution, pure in `src/core/appearance.ts`: theme = stored `notebook.appearance` if the key is present on disk, else stored `appearance.mode` if present (dark/light; Study's only explicit choice), else `system`. Nothing is written by the resolution; the first change in Settings writes `notebook.appearance`. Study's `background`, `fontFamily`, `proseFontSize`, `sessionNameSerif`, `mdRendering` are no longer read for styling (`appearanceVars` deleted) and stay on disk.

**Alternatives**: a new `look` section (migration, rollback path); writing the seed on first read (a write on a GET).

## R3 Fonts

**Decision**: `app/fonts.ts` exports Instrument Sans (variable, `wdth` axis as 024) as `--nb-font-sans` and Newsreader (variable, opsz, normal + italic) as `--nb-font-voice`, both `display: swap`, Instrument Sans preloaded, Newsreader not preloaded on routes that open without tutor prose (next/font `preload` is per-declaration; Newsreader is preloaded because lessons and Notebook both use it on first paint — measured in phase 1, flipped if the startup budget needs it). `notebook-fonts.ts` is deleted. Tailwind `--font-sans`/`--font-ui` → Instrument Sans; `--font-voice` → Newsreader; `--font-mono` → Notebook's `--nb-mono` stack (`ui-monospace, "SF Mono", Menlo, monospace`). Source Sans 3, JetBrains Mono and the static Newsreader 500/600 are removed.

## R4 Type scale

**Decision**: one scale from the sizes Notebook actually uses, as Tailwind text tokens and CSS variables: `--text-2xs` 11px, `--text-xs` 12px, `--text-meta` 12.5px, `--text-sm` 13px, `--text-ui` 13.5px, `--text-md` 14px, `--text-reply` 14.5px, `--text-base` var(--note-size) (16px; 15/18 small/large; phone 15.5/14.5/17), `--text-lg` 17px, `--text-xl` 19px, `--text-2xl` 1.65em-of-note heading (26.4px), `--text-title` 2.45× note size. Line heights as Notebook's (body 1.8, UI 1.35-1.5). Notebook's remaining one-off sizes (10, 10.5, 11.5, 15, 15.5, 16.5, 18) are either mapped to the nearest step where 024 recorded no frame measurement, or kept as named tokens where 024 calibrated them against a frame (listed in `app/paper.css`'s scale block with their source).

## R5 Reuse without renaming

**Decision**: shared components move to `components/paper/` (mode-neutral props; a `SurfaceRoot` context gives the portal container, defaulting to `document.body`, which now carries the tokens through `html.lh-paper`). Notebook files re-export or wrap them so imports used by tests keep working. Class names stay `nb-*`; Study uses the same classes. Shared CSS selectors become `.lh-paper .nb-x` (same specificity as `.nb-root .nb-x`).

## R6 Study shell

**Decision**: AppShell renders, for Study routes, Notebook's top-left ☰ + wordmark, the overlay sidebar (left-edge hover strip, Mod+\ as in Notebook, plus Study's existing sidebar shortcut), and the page. The persistent resizable left sidebar, its width bootstrap script and `lh:sidebar-*` storage are removed (stored keys are ignored, not deleted). The overlay's body for Study: "Find a session or page" search, New lesson / New practice, Lessons · Practice filters, Library (folder tree), Review, then sessions by Today / Yesterday / Earlier with waiting (`--bulb` dot, owner Q4) and running status; footer: account (hosted), Settings, Command palette, Notebook (mode switch) with shortcuts, Sign out (hosted). The page does not slide aside in Study (it does in Notebook): Study pages are wider and the dim already separates.

## R7 TopBar and tabs

**Decision**: TopBar keeps its 52px band, drag region and native gutters (Electron), restyled in the toolbar-row register (13px faint, 21px gaps, ink on hover). The ☰ and wordmark sit at its left. Tabs: 13px sans, faint; selected in ink with a 1.5px ink underline, no fills; × on hover/focus.

## R8 Checks as margin threads (owner gate 1, Q2)

**Decision**: the pending question's form (`QuestionDockForm`, exported) and the active problem's `PracticeDock` render from the transcript part slot where the answered card renders today, wrapped in `<SessionPartState id="">` so storage keys stay bare (`question/<id>/…`, `problem/<id>/…`, `dock/<id>/expanded|revealed`). A `CheckThread` (components/study) wraps them in Notebook's thread shell: ink dot, open thread layout, tether to the tutor paragraph, and is portalled into a margin layer beside the lesson column (`createPortal`, so `content-visibility` rows don't clip it). Anchor: the nearest preceding assistant text part (`[data-answer-part-id]`). Placement uses Notebook's `placeStack`/`useMeasuredRefs`; right margin only; width 410 (open thread). When the space right of the column is under 410 + 71px (phones, the right pane open, narrow windows), the thread renders inline under the anchor paragraph (Notebook's inline variant, 22px indent).

- Collapsed (reading history, or the learner closed it): the collapsed thread shows the kind and the teaser, "Answer" / "Solve" opens it. Open: question (voice), details, choices as option cards (1.5px ink ring when chosen), confidence as Notebook's pill row, "I don't know" text button, the reply-line answer field, then the primary (ink) Submit and, for problems, Skip. Reveal-gated teach checks show "Check your understanding" as the collapsed line until revealed.
- The fold machine on scroll is removed for checks (a thread does not need to get out of the way); `dock/<id>/expanded` becomes the thread's open state.
- Keyboard: the walking machine is armed while focus is inside the open thread; opening a thread (click, Enter-opens-the-waiting-check, `?answer=`) focuses the answer field (free text, problems) or the first choice (choice checks) on fine pointers, as today.
- Escape layering (`escAbortTarget`) unchanged; Enter-opens-the-waiting-check unchanged in effect (it scrolls the thread into view and opens it).
- `?answer=`: scroll the anchor into view, open the thread, focus as above, drop the param.
- The bottom bar while a check is pending shows the StatsBar, queued steers, scroll-to-latest and one line in the composer's place: "Answer the check beside the lesson" / "Solve the problem beside the lesson" with a "Go to it" button (our words, ui-contract). Stop stays where today's dock shows it for a running turn.
- An active practice problem in the deferred transcript prefix is exempt from windowing (it always renders).
- Demo auto-open per question unchanged; the "Using {demo}" line moves into the thread.

## R9 Transcript voice and ink-in

**Decision**: assistant prose (`MessageResponse`/Streamdown `.lh-prose`) takes `.nb-voice` (Newsreader 420, opsz 14, `--riddle`, "Plain" lettering → sans) at `--text-base`×1.06 on 1.6 (024's inline reply). Headings in the voice at 550 with Notebook's heading ems. Code, math and tables keep their own faces. The learner turn: no raised block, no "You" label chip: Instrument Sans at `--text-base` in `--graphite`, with a small faint "You" meta line kept as the accessible label (ui-contract). Ink-in: a rehype plugin wraps each word of the streaming message's last block in `span.nb-ink-word` with Notebook's stagger; settled messages render without it, so history never animates; React keeps already-rendered spans, so only new words animate. Reduced motion: no plugin effect (CSS off).

## R10 Quiet rows

**Decision**: tool rows, math check, lookups, page/library rows, held-edit rows, thinking and phase heads become one quiet row style: 12.5px faint sans, a 14px lucide icon, chevron disclosure, expanded panel on `--shelf` with 10px radius. Phase heads ("Planning", "Teaching") are 12px faint caps-free labels. Running rows keep the spinner; Notebook's breathing blot replaces the braille spinner in the voice-adjacent places (thinking placeholder, running phase head).

## R11 Right pane (owner gate 1, Q3)

**Decision**: stays a resizable column beside the lesson; paper with grain, 1px `--rule` hairline as its edge (the existing divider/resize handle), 52px header in the toolbar-row register. Phone layer unchanged in behaviour.

## R12 Inline sketches in lessons

**Decision**: Notebook's Sketch block renders only sketch data the app already has (Notebook threads). Study's tutor visuals are demos, plots and mermaid diagrams, which keep their own renderers; no new tool or model call is added (constitution V). "Where they fit" therefore resolves to: mermaid diagrams and quick plots take the sketch block's frame (serif title, faint subtitle, no card border), not its stepped player. Recorded as a scope note in the report.

## R13 Activity

**Decision**: Study's activity dock becomes the shared corner hint (bottom right, 11px faint; running · cost · Stop; click opens the lifted popover list), the same component as Notebook's with Study's feed rows. Its idle line in Study: "⌘K searches everything" (our words).

## R14 Real-model checks for Study

**Decision**: extend the dev-only `LH_NOTEBOOK_ENGINE=codex-verify` switch so Study turns resolve to the same pi-ai `openai-codex` transport when it is set (outside production, never from settings), with the same read-only Codex auth file and the same inert-when-unset unit tests.

## R15 Electron chrome

**Decision**: the preload exposes `lh.setChrome({ background, symbol })`; main applies `setTitleBarOverlay` (win/linux) and `setBackgroundColor`. The shared Appearance provider calls it on mount and on every resolved-theme change. The window's initial background follows `nativeTheme.shouldUseDarkColors` (paper dark `#1a1a19` / light `#f8f7f4`), so a cold start does not flash Study's old black.

## R16 Constitution (owner gate 1, Q1, and the goal)

**Decision**: PATCH 1.1.2 → 1.1.3, the theme line as in plan.md. DESIGN.md is rewritten as one system; the "no drop shadows" rule becomes "lift on floating surfaces only".
