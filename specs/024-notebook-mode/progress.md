# Feature 024: Notebook mode
Stage: implement
Updated: 2026-11-06

## Decisions
- Owner answers (one question per call, 2026-11-06): see spec.md Clarifications. Mode "Notebook" / "Study"; AI has no name, verbs only; note = Library page; threads and chat stay with the note, not sessions; extras: rich editor, Make flashcards, Links panel; automatic reads uncapped but shown with cost and Stop; activity lives in the corner hint; switch in both sidebars + palette + one shortcut; Export replaces Share; strong slot for everything; phones not a focus.
- Agent: below 768px every layout falls back to Marks only, opening inline (owner deprioritised mobile).
- Agent: title = page name edited in place (no text inserted into the page); mode toggle Mod+Shift+O (Mod+Shift+M is the editor formula key); pace Regular 1600 ms / Slow 3200 ms (Riddled does not show its delay); sketches are our own validated JSON primitives rendered to SVG; Word export by a hand-written zip/docx writer; PDF via the existing headless Chromium.
- Owner gate 2 (2026-11-06): "go" — implement all 11 phases. Real-model checks use the ChatGPT subscription connection from the existing ~/.codex login, in a throwaway data dir.
- Agent: clarify found no further owner questions; the full microcopy goes to the owner at gate 2 in the UI contract.

## Log
- 2026-11-06 specify: spec.md and checklists/requirements.md written; all checklist items pass.
- 2026-11-06 clarify: 10 owner questions asked one per call before the spec; none left. Gate 1 covered by those questions.

- 2026-11-06 plan: plan.md, research.md, data-model.md, contracts/{api,ui-contract,visual-reference}.md, quickstart.md. Constitution Check I-VIII pass (VI with the owner's in-goal override for the Notebook section).
- 2026-11-06 tasks: 50 tasks in 11 phases; MVP = phases 1-5.
- 2026-11-06 analyze: 0 critical, 0 high; 3 medium (Notebook skips TopBar/MenuShell under the VI override, recorded in plan; reading pace delays are ours because Riddled's are not visible; ROADMAP's "Playwright not adopted" row must be updated in T048). Baseline before changes: npm test 3837 pass / 0 fail / 27 skipped, typecheck and lint clean.
- 2026-11-06 implement phase 1 (T001-T006): Playwright 1.65.0 (exact, no browser download), playwright.config.ts + tests/e2e smoke; fonts and notebook.css scaffold (not imported yet); `general.interface` and the `notebook` settings section with the five seeded reviewers; role `notebook` on the strong slot; `notebook-changed` event. npm test 3855 pass / 0 fail / 27 skipped; typecheck (now two programs) and lint clean; e2e smoke 1 passed.
- Agent: snap Chromium cannot open profiles under hidden $HOME folders (~/.cache, ~/.t3), so Playwright's TMPDIR is ~/snap/chromium/common/learnharness-e2e (PW_TMPDIR overrides). Each e2e run leaves a small lh-data-* dir there.
- Agent: with Playwright's types in the main program, tsc fails on a createElement overload in tests/svg-image.test.tsx (cause not traced), so playwright.config.ts and tests/e2e type-check as a separate program (tests/e2e/tsconfig.json); `npm run typecheck` runs both.
- Agent: the seeded reviewers are the factory value of `notebook.reviewers` (absent key = seeded list, stored list, even empty, wins), so "seeded on first read" needs no disk write and deleting a seeded reviewer sticks. Reviewer ids must match [A-Za-z0-9_-]{1,64}.

## Report
