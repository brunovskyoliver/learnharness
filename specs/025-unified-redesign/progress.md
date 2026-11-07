# Feature 025: Unified redesign
Stage: implement
Updated: 2026-11-07

## Decisions
- Owner gate 1 (2026-11-07, one batch): Notebook's appearance set only (legacy values kept on disk, Study mode seeds the theme once); checks and problems as margin threads (inline when no room); right pane beside the lesson in Notebook's look; `--bulb` for waiting / "Your turn". Constitution theme line amended (R16), approved through Q1.
- Agent: gate 2 auto-passes. The owner's goal asks for questions only on real trade-offs and says to keep iterating; analyze found 0 critical / 0 high.
- Agent: technical decisions R1-R16 in research.md (tokens on html.lh-paper; shared appearance in the notebook section; fonts; type scale; lift-don't-fork into components/paper with nb-* classes; Study shell; checks seam with SessionPartState id=""; ink-in via rehype; corner hint for Study activity; codex-verify for Study; Electron setChrome).
- Agent (phase 1): `@custom-variant dark` is replaced, not just deleted: `dark:` now keys on html `data-theme` (dark, or system under an OS dark scheme), so the 19 shadcn `dark:` utilities in components/ui follow the chosen paper theme instead of the OS; T013 removes them.
- Agent (phase 1): element-level paper rules (selection, focus ring, cursor, hidden scrollbars, touch tint) are in `@layer base` for Study, so its utilities still win; 024's unlayered `.nb-root` copies stay in app/paper.css at their old cascade place. A computed-style dump of Notebook in 13 states (light, system dark, thread open, mode menu, export, chat, sidebar, settings, reviewers, sketch dialog, dark+blue+large+plain, dark settings, phone) is identical before and after the move (0 differences).
- Agent (phase 1): stays in notebook.css until its lift task: top-left menu and wordmark, sheet/column, toolbar row, title, editor body, slash and [[ menus, instruction line, selection menu (T047), pointer ink, Just my words.
- Agent (phase 1): `--font-title` maps to the Newsreader variable face (the old static Newsreader's replacement) until phase 2 moves titles to the sans; `--text-3xl` aliases the title size; `--ink-2`/`--color-ink-2` stay as aliases of graphite until the codemod; `--lh-prose-size` (17px), `--lh-prose-leading`, `--lh-heading-weight`, `--lh-ink-*` stay in globals.css `:root` for Study's prose until T013. R4 line heights: 2xs/xs/meta/sm 1.4, ui 1.35, md 1.4, reply 1.55, base 1.8, lg 1.5, xl 1.35, 2xl 1.25, title 1.12.
- Agent (phase 1): the old Study AppearanceProvider is no longer mounted; components/settings/appearance.tsx and appearance-vars.ts stay (their tests, the settings dialog's no-op callback, demo-card's fontFamily) until T013. Study's Appearance section saves but no longer restyles (retired in phase 6).
- Agent (phase 1): the body's grain is `.nb-paper.lh-body-paper` at z-index -1 (under page content; Notebook's own grain paints above it). The graph canvas and demo bridge also re-read tokens on a `prefers-color-scheme` change (the "system" theme changes no attribute). Electron: `lh:set-chrome` checks the trusted window and sender like the other channels; macOS takes only the background (no overlay).

## Log
- 2026-11-07 specify: spec.md written (6 stories, FR-001..043). Before-screenshot script delegated to a child (scripts/unified-screens.mjs).

- 2026-11-07 clarify: 4 owner questions in one batch, answered (Decisions).
- 2026-11-07 plan: plan.md, research.md (R1-R16), data-model.md, contracts/ui-contract.md. Constitution Check I-VIII pass (VI with the owner-directed amendment).
- 2026-11-07 tasks: 70 tasks in 11 phases.
- 2026-11-07 analyze: 0 critical, 0 high. Medium: FR-025 (inline sketches) resolved by R12 as frame-only for mermaid and plots, with no new model call; T070's long-running server is outside the repo (noted). Gate 2 auto-pass.
- 2026-11-07 implement phase 1 (T001-T009): app/paper.css split out of notebook.css (tokens on html.lh-paper), shared Appearance (src/core/appearance.ts, components/paper/appearance.tsx), fonts for the whole app, Study ink removed, Tailwind maps paper tokens, Electron setChrome. lint, typecheck, unit, build, Notebook e2e green.

## Report
