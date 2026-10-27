# 001 Study ink and prompt bar: progress

## Stage

Implemented; awaiting owner review (plan and tasks done). Owner asked for an unattended full cycle on 2026-10-27; technical choices are logged in research.md (marked "agent").

## Decisions

Agent decisions taken during the unattended run (review these first):

- Tertiary ink nudged from the canvas's `#85837c` to `#8a8881`: the original measured 4.45:1 on raised-2, below FR-002's 4.5:1. Now 4.76:1.
- Collapsed bar keeps the answer well visible, following the existing DESIGN.md rule that folding hides only the question details and choices. The spec's "strip is the whole bar" wording was corrected to match.
- Newsreader applies to prose `h1`/`h2` and `.font-title`; `h3` and below stay in Source Sans. Serif headings are capped at weight 600.
- Queued steers have no remove control: a steer reaches the live agent as soon as it posts and no cancel route exists. Adding one needs server work outside this UI feature (FR-019 partly met).
- Scroll-to-latest sits at the bar's top-right corner, outside the reading column on desktop. On phones it can still overlap text while scrolled up (FR-020 partly met).
- Skip dispatches the same `lh:kbd-abort-turn` event as Escape, so it gets the identical guard and confirmation.
- Opacity text greys were mapped per research.md R2. UI `text-xs` (12 px) became `text-sm` (13 px) except next to `font-mono`.
- Model trigger reads "Choose a model" when unset; thinking reads "Thinking: {level}" ("Thinking" when unset; level alone below 640 px). With zero models the model control renders nothing and the setup action takes its place.
- In compact mode the controls row stays visible when it holds a setup action, so "Set up your models" never disappears (found by the dock smoke test).

Owner decisions (2026-10-27): warm near-black ground; amber accent; Newsreader titles; user turn as a raised block on the reading edge; visible Skip using the existing dismiss confirmation; usage percentage beside the ring; round send for chat only; scope = tokens, prompt bar, user turn and audit bug-level fixes (home and sidebar redesign deferred); constitution amended to 1.1.0 inside this feature.

## Log

- 2026-10-27: UI audit and design canvas published (https://claude.ai/artifact/5oZhYiW8seh7WbxCDn9nFh). Spec written; quality checklist passed.

- 2026-10-27: Baseline: `npm test` 2507 tests, 3 pre-existing failures (tests 96 and 97 in chatgpt-connection-ui, 773 provider runtime loader). Typecheck passes. `npm run lint` runs out of memory at the default heap; passes with `NODE_OPTIONS=--max-old-space-size=6144`.
- 2026-10-27: plan.md, research.md, data-model.md, contracts/prompt-bar.md, quickstart.md, tasks.md written.

- 2026-10-27: Implementation complete. Suite 2515 tests, 2 failures, both also failing on unchanged code. Typecheck, lint (6 GB heap) and production build pass.

## Report

**What changed**
- Study ink tokens in `app/globals.css`: ground/raised/raised-2, three inks plus `ink-2`, amber accent, type ladder 12–40, radii 6/10, edges. Newsreader title face in `app/fonts.ts` replaces the CMU file. `--font-title` follows only an explicit reading font.
- Prompt bar: `TurnStrip`, `AnswerWell`, `PrimaryAction` in `components/prompt-controls.tsx`. `Composer`, `QuestionDock` and `PracticeDock` now use the four zones. "I don't know" is a text button in the confidence row. Labelled Submit answer / Submit / Next problem / Stop; Skip on practice problems. The collapse control is on the turn strip; collapsed teasers render markdown; a "More below" cue shows when the body overflows.
- Setup actions moved into the toolbar (chat, home, new session), replacing the floating and portaled CTAs. Model and thinking triggers show words, never "—". Usage shows a percentage, or "?" when the limit is unknown.
- App-wide sweep: opacity text greys, `shadow-*`, `backdrop-blur`, dashed borders, `text-[11px]`, and UI `text-xs` → `text-sm` (73 files).
- Transcript: user turn as a raised block on the reading edge; thinking rows and reasoning on the reading edge; no side rules on blockquote or thinking; phase labels as left running heads; one-row demo stand-in while the workspace is open; turn rail from three turns.
- Constitution amended to 1.1.0; DESIGN.md, PRODUCT.md and docs/ui-review.md updated.

**How it was verified**
- `npm test`: 2515 tests, 2513 pass. The 2 failures (provider runtime loader, github-copilot connection dialog) also fail on the unchanged code; the copilot one fails in isolation too. The baseline's two chatgpt-connection-ui failures did not recur this run.
- New `tests/prompt-bar.test.tsx` (8 tests). Render tests that pinned retired visuals were updated; their behaviour assertions were kept.
- `tsc --noEmit` passes; `eslint .` passes with `NODE_OPTIONS=--max-old-space-size=6144`; `npm run build` passes.
- Contrast: every ink and status color is ≥4.5:1 on all three surfaces (lowest: tertiary on raised-2, 4.76:1). Ground on accent is 9.45:1.
- Performance (production build, 4× CPU and 10 Mbps throttle, median of 5, `/chat/review-belief-check`): JS 649,475 → 649,956 B (+0.07%), CSS 24,526 → 24,670 B, fonts 111,996 → 111,996 B, FCP 368 → 340 ms, ready 3,461 → 3,033 ms. Within the 5% budget.
- Playwright screenshots at 1440, 390 and 320 px of the four review threads, expanded and collapsed.
- `scripts/smoke-dock-ui.mjs` (Chromium with `--no-sandbox`): fails at the setup-focus-restore step (line 131) on both the unchanged code and this branch, so it is pre-existing in this environment. It found one real regression first (setup hidden in compact mode), which is fixed.

**What is left**
- Owner review against the canvas, and of the agent decisions above.
- Principle VI: the `shadcn`, `impeccable` and `web-design-guidelines` skills are not installed here; checks were substituted (see plan.md).
- Queued-steer removal needs a server cancel route (follow-up).
- Not run: `smoke-sidebar-ui`, `smoke-demo-workspace` (and live Electron).
- Home redesign ("Waiting for you") and sidebar simplification: a later feature, per the scope decision.
