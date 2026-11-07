# Feature 025: Unified redesign
Stage: implement
Updated: 2026-11-07

## Decisions
- Owner gate 1 (2026-11-07, one batch): Notebook's appearance set only (legacy values kept on disk, Study mode seeds the theme once); checks and problems as margin threads (inline when no room); right pane beside the lesson in Notebook's look; `--bulb` for waiting / "Your turn". Constitution theme line amended (R16), approved through Q1.
- Agent: gate 2 auto-passes. The owner's goal asks for questions only on real trade-offs and says to keep iterating; analyze found 0 critical / 0 high.
- Agent: technical decisions R1-R16 in research.md (tokens on html.lh-paper; shared appearance in the notebook section; fonts; type scale; lift-don't-fork into components/paper with nb-* classes; Study shell; checks seam with SessionPartState id=""; ink-in via rehype; corner hint for Study activity; codex-verify for Study; Electron setChrome).

## Log
- 2026-11-07 specify: spec.md written (6 stories, FR-001..043). Before-screenshot script delegated to a child (scripts/unified-screens.mjs).

- 2026-11-07 clarify: 4 owner questions in one batch, answered (Decisions).
- 2026-11-07 plan: plan.md, research.md (R1-R16), data-model.md, contracts/ui-contract.md. Constitution Check I-VIII pass (VI with the owner-directed amendment).
- 2026-11-07 tasks: 70 tasks in 11 phases.
- 2026-11-07 analyze: 0 critical, 0 high. Medium: FR-025 (inline sketches) resolved by R12 as frame-only for mermaid and plots, with no new model call; T070's long-running server is outside the repo (noted). Gate 2 auto-pass.

## Report
