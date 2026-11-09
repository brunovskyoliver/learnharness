# Feature 025: Unified redesign (one design system)

**Feature Branch**: `unified-redesign` (harness worktree branch, from `notebook-mode` at 7da16e6)

**Created**: 2026-11-07

**Status**: Draft

**Input (owner goal, summarised; full text in this thread)**: Redesign and rework the whole app so every screen, including Study (lessons, chat, practice), looks and behaves like Notebook mode (feature 024). One design system, so moving between modes feels seamless. "The same" means Notebook's tokens (paper, ink, graphite, faint, rule, AI ink colours, light and dark), fonts (Instrument Sans for the learner and UI, Newsreader 420 for the tutor), type scale, spacing, radii, lift shadow, grain, component library and UI libraries, blocks and motion (ink-in words, breathing blot, self-drawing tethers, stepped sketches, unfold/settle). Reuse Notebook's components and CSS; no look-alikes. Remove what becomes dead, including Study ink tokens. Keep all behaviour and data; change look and interaction, not what features do. Where Notebook has a pattern for something Study does (margin threads for checks, selection menu, note chat panel, export), use it if it fits; otherwise design one in the same language. Hidden scrollbars, reduced-motion fallbacks. Rewrite DESIGN.md as one system.

## Clarifications

### Session 2026-11-07 (owner, gate 1, one batch)

- Q: What does the unified Appearance hold? → A: **Notebook's set only**: theme (system/light/dark), text size (3 steps), lettering (serif/plain), AI ink colour, for both modes. Study's old `appearance` values (mode, background, fontFamily, proseFontSize, sessionNameSerif, mdRendering) stay in settings.json untouched and are no longer read for the look; the stored Study mode seeds the shared theme once, only when the shared theme was never set. This amends the constitution's "Saved custom backgrounds and reading preferences are preserved" (owner approved through this question).
- Q: Where do lesson checks and practice problems live? → A: **Margin threads.** A pending check or problem opens as a thread in the margin beside the tutor paragraph it follows, with the question, choices, confidence, "I don't know", the answer field and its actions inside the thread. The bottom bar holds only free chat (and turn-level controls). Where the margin has no room (below 768 px or a narrow lesson column) the thread falls back inline under that paragraph, as Notebook's do.
- Q: Where does the right pane sit? → A: **Beside the lesson, in Notebook's look**: side by side and resizable, a paper panel with the rule hairline and grain, no dim. Below 768 px it stays the full-screen layer with "Back to chat".
- Q: What signals "waiting for you"? → A: **Notebook's `--bulb`**, only for the waiting dot and the "Your turn" label. Primary buttons are ink-filled, chosen options take the 1.5 px ink ring, focus uses `--nb-focus`.

### Standing rules that apply

- Constitution I–VIII. The owner's goal directs removing Study ink; the constitution's theme line ("Study ink, as defined in DESIGN.md") is amended to "the paper system defined in DESIGN.md" (PATCH-level wording change carrying the owner's in-goal direction; recorded in the Sync Impact Report).
- Feature 024's owner rulings stay binding inside Notebook (contrast raised to pass, faded notes per ink, column geometry, no AI name in Notebook, phones not a focus *for Notebook*). Study's phone layouts stay fully supported (constitution VI: 320/390/1440).
- Real-model checks may use the dev-only `LH_NOTEBOOK_ENGINE=codex-verify` switch (024 research R13), extended to Study's turn engine the same way if needed; it stays inert in production and when unset.
- Don't push, merge, deploy or touch `~/learnharness`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One product across modes (Priority: P1)

He is writing a note in Notebook, presses the mode shortcut and lands in Study's Home. Nothing jumps: the same paper and grain, the same ☰ and wordmark in the top left, the same type, the same corner hint, the same overlay sidebar when he hovers the left edge. Only the content changes.

**Why this priority**: it is the whole point of the feature; every other story is this rule applied to one surface.

**Independent Test**: switch modes at 1440 and 390 px in light and dark; screenshot a Notebook screen and the matching Study screen side by side; the paper colour, grain, chrome position, fonts and focus ring are identical (pixel-sampled), and a reviewer reads them as one product.

**Acceptance Scenarios**:

1. **Given** Notebook in dark, **When** he switches to Study, **Then** Study renders in the same dark paper tokens, with no flash of another theme.
2. **Given** either mode, **When** he changes Appearance (system / light / dark), **Then** both modes follow, and the change cross-fades as in Notebook.
3. **Given** either mode, **When** he hovers the left edge or presses the sidebar shortcut, **Then** the same overlay sidebar component opens, with the mode's own list and the shared footer.

---

### User Story 2 - A lesson on paper (Priority: P1)

He opens a lesson. The tutor's prose is set in Newsreader 420 in the AI ink, with no bubble; his own turns are plain Instrument Sans in graphite, no raised block. Tool rows, thinking and phase heads are quiet faint lines in the same register as Notebook's meta text. New tutor words ink in word by word while streaming. The lesson column has Notebook's measure and rhythm.

**Why this priority**: lessons are the core of Study.

**Independent Test**: open the review lesson threads; check the computed font, size, colour and absence of a bubble for tutor and learner blocks; stream a real reply and see the words ink in; under reduced motion they appear without animation.

**Acceptance Scenarios**:

1. **Given** a transcript, **When** it renders, **Then** tutor prose uses the voice face (Newsreader 420, opsz 14) in `--riddle`, and the learner's turns use Instrument Sans in `--graphite`, both on one reading edge, with no bubble or raised block.
2. **Given** a streaming tutor reply, **When** words arrive, **Then** each new word inks in (Notebook's `nb-ink-word`), and nothing re-animates on re-render or scroll-back.
3. **Given** tool calls, math checks, lookups, page rows, thinking and phase heads, **When** they render, **Then** they are quiet rows in the faint meta register with Notebook's disclosure, keeping every state and string they have today.
4. **Given** "Plain" lettering in Appearance, **When** a lesson renders, **Then** tutor prose switches to the sans, as Notebook's voice does.

---

### User Story 3 - Checks and practice in the same language (Priority: P1)

A lesson check appears. Its question, choices, confidence and "I don't know", the answer field and Submit all use Notebook's controls: option cards with the 1.5px ink ring when chosen, the reply-line field, ink primary buttons, faint meta. Practice problems, Skip, Next problem and Stop work as today.

**Independent Test**: answer a choice check with confidence, a free-text check, "I don't know", a practice problem with Skip and Next problem; every control is Notebook-styled and the request bodies are unchanged from today (confidence sent on real answers, dropped on "I don't know"; correct answers never on the client before answering).

---

### User Story 4 - Home, Library, Review and the rest (Priority: P2)

Home (waiting list, calibration, knowledge graph), the Library (list, grid, folders, trash, search, upload), the page editor in the pane (toolbar, slash and [[ menus, selection bubble, history, held edits, Links), PDFs, diagrams, Review (queue, cards, drafts, editor), demos and ML panels, tabs, the command palette, dialogs, menus, toasts, empty/loading/error states, setup and sign-in, Electron window chrome: each surface uses the shared tokens, components and motion, and every feature still works.

**Independent Test**: the Playwright journeys and existing browser regressions pass; the screenshot set covers each surface in light and dark at 1440 and 390 px; a grep finds no Study ink token or one-off colour, size or font outside the tokens.

---

### User Story 5 - One settings modal (Priority: P2)

Settings opens as Notebook's modal (840 × 704, lifted, grain, vertical nav, option cards and switches) in both modes. Its nav holds Customize and Reviewers (Notebook) and every Study category (providers and keys, models, agent, graph, prompts and the rest). Search settings, deep links, immediate persistence, per-section failure lines and Try again work as today.

**Independent Test**: open Settings from each mode, by the footer and by Mod+,; visit every category; search a row and land on it; change a setting and see it persist; a refused save shows its line and Try again.

---

### User Story 6 - Phones (Priority: P2)

At 390 px (and 320) every Study surface works without page overflow: the overlay sidebar is the phone sidebar, the right pane is the full-screen layer with "Back to chat", the prompt bar keeps the answer field above the keyboard, coarse targets are 44 px.

---

### Edge Cases

- A saved Study appearance (dark/light mode, custom background, reading font, prose size, heading weight, bold/italic colours, serif session names) from before this feature: never lost from `settings.json`; it stays on disk untouched; the stored mode seeds the shared theme once (owner, gate 1).
- Demos in the sandboxed iframe get the new theme through the existing theme bridge without reloading (constitution VII); kit tokens follow paper/ink.
- ML panels, charts, heatmaps and PDF highlights keep their data colours (data, not decoration).
- A view that fails to render, a failed settings save, a failed Library load: same honest states, new look.
- Reduced motion: every new animation (ink-in, blot, tether, settle/unfold, panel slides) has a no-motion fallback; state still changes.
- Electron: the title bar overlay and window background follow the paper colour per theme, including at startup before React mounts.
- Hosted mode (Clerk): sign-in and account rows use the shared look through Clerk's appearance object.

## Requirements *(mandatory)*

### Functional Requirements

**One system**

- **FR-001**: The app MUST have one set of design tokens: Notebook's paper, shelf, code, ink, graphite, faint, rule, focus, AI inks (`--riddle`, `--text-*`), wash, line, bulb, lift, grain, with light and dark values, defined once at the root and used by both modes.
- **FR-002**: Study ink tokens (`--surface-raised`, `--surface-raised-2`, `--ink-2`, the amber `--primary`, Study's ground and edges) and every rule or class that only they used MUST be removed. shadcn bridge names (`--background`, `--foreground`, `--card`, `--popover`, `--muted`, `--muted-foreground`, `--border`, `--input`, `--ring`, `--primary`, `--accent`, `--destructive`) MAY remain only as aliases of the shared tokens.
- **FR-003**: Fonts MUST be Instrument Sans (UI and learner text) and Newsreader 420 / opsz 14 (the tutor's voice), loaded once for the whole app; Source Sans 3 and Study's other faces MUST go unless a surface needs monospace (code, numeric metadata) — the mono face is Notebook's.
- **FR-004**: Type sizes, spacing, radii, shadows and motion MUST come from the shared scale; a lint-style test MUST fail on one-off colours, font sizes or font families in components and CSS outside the token files (data colours for charts, demos, PDF marks and exports excepted and listed).
- **FR-005**: Appearance (system / light / dark), text size, lettering (serif / plain) and AI ink colour MUST apply to both modes, from one setting each.
- **FR-006**: Notebook's components and CSS MUST be reused for the shared chrome (overlay sidebar, menus, dialogs, option cards, switches, settings modal, corner hint, ink text, blot, tether, sketches), moved to shared locations as needed; no parallel look-alike components.

**Chrome and navigation**

- **FR-010**: Study MUST use Notebook's overlay sidebar (menu icon, hover at the left edge, shortcut; dims the page; Escape/✕/outside click), with Study's content: search, New lesson / New practice, Lessons / Practice filters, Library tree, Review, sessions by date with waiting and running status; footer with Settings, the palette, the mode switch and account.
- **FR-011**: Workspace tabs, the command palette, menus, tooltips and toasts MUST be restyled in Notebook's language (toolbar-row type, lifted menus, faint meta), keeping every behaviour and string.
- **FR-012**: The right pane (demos, pages, PDFs, diagrams, context view) MUST use Notebook's panel look; it stays beside the lesson, resizable (owner, gate 1).
- **FR-013**: Electron window chrome (title bar overlay colours, window background) MUST follow the paper tokens per theme.

**Lessons, checks, practice**

- **FR-020**: Tutor prose MUST render in the voice (Newsreader 420, AI ink, no bubble); learner turns in Instrument Sans graphite, no bubble; both on one reading edge with Notebook's measure.
- **FR-021**: Streaming tutor words MUST ink in word by word; settled history MUST NOT animate.
- **FR-022**: Tool rows, math check rows, lookup rows, page/library rows, held-edit rows, thinking and phase heads MUST keep their states and strings and take the faint meta register.
- **FR-023**: Checks (choices, confidence, "I don't know", free text) and practice problems (Submit, Skip, Next problem, Stop) MUST use Notebook's option cards, reply-line field and buttons; behaviour, request bodies and teaching rules unchanged. They open as margin threads beside the tutor paragraph they follow (owner, gate 1), falling back inline where the margin has no room. Home's Answer / Solve opens the session scrolled to that thread with it open and its field or first choice focused (the job of today's "prompt bar expanded on that item"). Drafts, selections and confidence survive navigation, reload and collapse as today.
- **FR-024**: Demos, quick plots and ML panels MUST follow the shared tokens through the theme bridge; data colours stay data colours.
- **FR-025**: Inline sketches MAY appear in lessons where Notebook's sketch block fits a delivered visual; no new model call is added for this.

**Library, notes, review, settings**

- **FR-030**: Library, page editor (toolbar, slash and [[ menus, selection bubble, link popover, tables, callouts), history, held edits, Links panel, PDF reader, diagrams and Review MUST use the shared tokens and components; Notebook's selection menu pattern is used for the editor's selection bubble where it fits, keeping every action.
- **FR-031**: Settings MUST be Notebook's settings modal in both modes, with every Study category, search, deep links, failure lines and immediate persistence.
- **FR-032**: Dialogs MUST be Notebook's lifted dialogs (focus trap, Escape, focus return); empty, loading and error states MUST be distinct, in Notebook's microcopy voice, with no centred illustrations.
- **FR-033**: Setup (no key, no models) and hosted sign-in MUST use the shared look.

**Quality**

- **FR-040**: Scrollbars hidden everywhere; focus always visible (2px `--nb-focus`, offset 2px); Escape innermost first; 44px coarse targets; 320/390/1440 without overflow; WCAG AA contrast (4.5:1 text, 3:1 non-text).
- **FR-041**: Every animation MUST have a reduced-motion fallback.
- **FR-042**: Every existing feature MUST keep working; existing tests are updated only where they assert the old look, never to drop a behaviour.
- **FR-043**: Startup JS MUST NOT grow more than 5% on Study routes against this branch's base.

### Key Entities

- **Design tokens**: one root token set with light/dark values (no new data).
- **Appearance preferences**: theme, text size, lettering, AI ink; shared by both modes (stored where Notebook stores them today, or a shared section — plan decides, additive and rollback-safe).
- **Legacy Study appearance**: the existing `appearance` section, kept on disk untouched.

## Success Criteria *(mandatory)*

- **SC-001**: A grep (as a test) finds no Study ink token and no one-off colour, size or font outside the token files.
- **SC-002**: Before/after screenshots of every surface in scope, light and dark, at 1440 and 390 px, plus Notebook/Study side-by-side pairs, under `~/agent-runs/2026-11-07-unified-redesign/`.
- **SC-003**: Every existing feature works end to end against a real model; the full unit suite passes; Playwright journeys cover the main flows in both modes.
- **SC-004**: Lint, typecheck, build, unit tests and Playwright are green; startup JS grows ≤5%.
- **SC-005**: impeccable, web-design-guidelines and an accessibility pass (keyboard, screen reader, 4.5:1) have no open findings, or only owner-approved ones.

## Assumptions

- Notebook's own look (feature 024) is the reference and does not change, except where moving its CSS to shared files requires renaming selectors.
- The mode switch, the two modes and each mode's last location stay as in 024.
- No new runtime dependency.
