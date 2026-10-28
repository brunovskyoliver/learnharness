# Progress: 004 Calibration feedback

## Stage

Implemented 2026-10-28. Not committed, pushed or deployed.

## Decisions

- Spec Clarifications (8 owner answers incl. the Review / empty wording asked during implementation); research.md R1–R5; plan approved 2026-10-28.
- Agent decisions (reversible): miss rows reuse `.waiting-row` with a `data-no-kind` grid (no kind column); T002 tests and T003 code were written in one step rather than red-then-green.

## Log

- 2026-10-28: spec, clarify, plan.
- Analyze (inline): all FR/SC mapped (FR-001 T002–T005, FR-002/003 T002, FR-004 T009–T010, FR-005 T007, FR-006 T006/T009, FR-007 T012, FR-008 T007/T009, SC-001 T002/T015, SC-002 T012, SC-003 T002, SC-004 T013); constitution gates T014/T016; no critical findings.
- T001: baseline (production build of the 003 tree, `perf.sh baseline`, 9 runs, medians): JS 707,204 B; API 16,899 B; ready 712 ms; FCP 72 ms; blocking 4 ms; CLS 0.0032; DOM 5,285.
- T002–T006: `src/core/calibration.ts` (`confidenceLevel`, `calibrationOf`, `mergeCalibration`, `levelLine`), `ChatSummary.calibration`, set in `readSummary`. Tests: `tests/calibration.test.ts` (8), `tests/waiting.test.ts` (+2, allowlist).
- T007–T010: `components/calibration-section.tsx` mounted in `components/home.tsx` after `WaitingSection`; `.waiting-row[data-no-kind]` in `app/globals.css`. Tests: `tests/render-calibration-section.test.tsx` (5).
- T011: DESIGN.md (Home item 3, Knowledge graph renumbered to 4), docs/ui-review.md, PRODUCT.md.
- T012: browser check (production build, isolated data: golden + review seed + synthetic `review-calibration` with 14 re-answered checks; `~/agent-runs/2026-10-28-feature-004/check-calibration.mjs`, log `check-calibration.log`): order waiting → calibration → graph; lines "Guessing · 2 answers · 0 right", "Unsure · 1 answer · 1 right", "Fairly sure · 4 answers · 3 right", "Certain · 12 answers · 4 right (33%)"; 5 misses then "Show all 8" → 8; Review → `/chat/review-calibration#message-cal-a-12`, anchor found 69 px from the top. First desktop screenshot showed miss rows indented 8 px by the empty kind column; fixed with the `data-no-kind` grid and re-checked. No overflow at 1440/390/320. Screenshots `shots/home-calibration-*.png` (the review-landing screenshot shows the fresh data's "Set up your models" dialog, so it is not evidence). Manual review against the shadcn/impeccable/web-design-guidelines checklists: amber unused in the section, quiet buttons, no new borders, type sizes from the scale.
- T013: performance, medians: JS 707,204 → 707,204 B (0%); API 16,899 → 17,191 B (+1.7%, calibration fields of the golden fixtures in the list); ready 712 → 724 ms (+1.7%); FCP 72 → 80 ms (run spread 56–156 ms); blocking, CLS, DOM unchanged. Within 5%.
- T014: `smoke-sidebar-ui.mjs` passes (8 PASS); `smoke-dock-ui.mjs` 20 PASS then the pre-existing "completed answer starts below the top row" (−2.7 px this run), as in 002/003.
- T015: hosted record streamed over ssh (read only): lesson checks alone Certain 61/51, Unsure 1/0, 10 misses (SC-001's quiz numbers). With probe answers counted per R2: Guessing 1/0, Unsure 7/2 (29%), Certain 66/55 (83%), 11 misses. SC-001 rewritten to state both; the usage report's "7 at 100" corrected to 5.
- T016: `npm test` 2599/2599; typecheck, lint, build pass.

## Report

**What changed**
- Home gains "Calibration" between "Waiting for you" and the graph: per-level lines across all sessions, then "Wrong while Certain" (newest 5, Show all, Review opens the session at the message before the check). Hidden until a graded answer with confidence exists.
- Each chat summary carries an allowlisted `calibration` (counts; misses with question text, time, link target). Nothing stored.

**How it was verified**
- 15 new unit/render tests, full suite, typecheck, lint, build, browser check with screenshots, performance before/after, hosted record check.

**What is left**
- Owner review: probe answers are counted (R2); the agent decisions above; the Principle VI substitute review.
- Pre-existing dock smoke failure unchanged.
- Not committed, pushed or deployed.
