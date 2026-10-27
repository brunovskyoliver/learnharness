# Thread UX audit and sidebar resizing

Requested 2026-10-27: visual audit of threads, layout, spacing, weights and fonts; fix sidebar lag; use sol-loop.

## Completed investigation

- Screenshots of teaching and practice transcripts at desktop, tablet and mobile sizes.
- Lag isolated to `duration-200` remaining active on the sidebar during dragging. Computed transition is `all / 0.2s`; with two rows, maximum lag was 71.3px. Temporarily disabling the transition produced 0px lag for the same pointer sequence.
- Window shrink reproduced a 640px sidebar leaving a 384px thread at a 1024px viewport, below the intended 640px floor.
- Crowded session rows shrink from the intended 36px to 18.195px.
- Resize rail is 4px wide, has no keyboard operation, and does not clear dragging on pointercancel.

Full report, screenshot evidence and interactive layout proposals: `/Users/oliver/agent-runs/2026-10-27-thread-ux-audit/`.

## Proposed plan

Oliver approved option 2 on 2026-10-27: the sidebar fixes plus the typography package below.

1. Repair sidebar drag transitions, viewport clamping, 36px row sizing, keyboard resizing and interruption cleanup. Keep the font families, colors, default sidebar width, 52rem shell and mobile overlay threshold; apply the approved typography package. Isolate resize state from the session list if the crowded-list check warrants it.
2. Verify actual pointer behavior, persistence, viewport shrink/grow, reset, cancellation, keyboard, list density and mobile navigation. Run relevant regression tests, typecheck and lint.
3. Run one Sol reviewer with up to three sol-loop rounds. Later rounds cover only changed behavior and open findings.
4. Capture after screenshots and record final implementation and review results here.

Approved typography package: 17px/27px prose, 76ch prose measure inside the 52rem shell, heading weight 700, paragraph spacing 16px and section spacing 32px. Grouping completed tool calls remains a separate proposed feature.

## Baseline verification

- Typecheck: passed.
- Lint: passed.
- Tests: 2425 passed, 1 pre-edit failure in `tests/jobs.test.ts:1742`, orphan running job recovery, expected `recovering: re-running`, got `failed`. Log saved with report. The suite writes some fixtures into development data; use an isolated `LH_DATA_DIR` for subsequent checks.
- Source design detector: `[]`; rendered browser checks still found the defects above.

## Status

Application implementation: complete and verified.
Sol review: APPROVE after 2 rounds, `gpt-6.1-sol` through provider `codex`, exposed effort high. S1-S3 resolved, no new issues.
Commit, push, merge, deployment: none.

## Implementation and verification

- Moved resize state into `SidebarFrame`, keeping session-list children stable during pointer moves. Disabled width transitions while dragging. Added pointer capture, pointer ID filtering and cleanup on pointerup, pointercancel, lost capture, blur, hide and unmount.
- Kept preferred width separate from viewport constraints. The main pane retains its 640px floor; widening the window restores the preferred width, including after a narrow-window reload.
- Added a 12px rail, keyboard arrows in 16px steps, Home/End bounds and Enter/double-click reset. Session and rename rows keep their 36px height.
- Default prose is 17px/27px, assistant reading width is 76ch inside the 52rem shell, headings default to 700. Paragraph, section and heading spacing are 16/32/12px; authored-turn gaps are 24px. Explicit appearance preferences remain authoritative.
- New real-browser regression `scripts/smoke-sidebar-ui.mjs`: all checks pass, including 82-row drag, persistence, responsive clamp/restore, keyboard, interruptions, row heights, typography and mobile navigation. No browser exceptions or page overflow.
- Ran the same pointer test with the original sidebar: fails at 33.94px maximum lag; changed sidebar passes at 0.00px. Source was restored byte-for-byte afterward. `regression-red.log` records the failure.
- `npm test` with isolated data: 2426 pass, 0 fail. Updated tests that pinned the old appearance defaults.
- Typecheck, lint and diff whitespace checks: pass. Design source detector: `[]`.
- Existing dock smoke covers scrolling, code, streaming, turn navigation and reading restoration successfully, then times out at `scripts/check-session-state-ui.mjs:96` while switching away from an unfinished question. The exact timeout reproduces on the original UI; both logs are saved. The existing dock probe's wheel coordinate was corrected to target the lesson instead of the sidebar. The unrelated unfinished-question check remains open.
- After screenshots and logs are in `/Users/oliver/agent-runs/2026-10-27-thread-ux-audit/`. `verified-result.html` contains the rendered evidence. Tests use headless Chromium; physical touch and the native Electron window were not exercised.

## Sol ledger

Round 1: CHANGES, provider `codex`, model `gpt-6.1-sol`, exposed effort `high`. Usage not exposed.

| ID | Severity | Outcome | Evidence |
|---|---|---|---|
| S1 | should | Resolved in round 2 | Handled resize keys use capture and stop propagation before document/window lesson handlers. Real active-dock regression fails before the fix (ArrowRight changes Unsure to Fairly sure), passes after; Enter does not submit a selected answer. |
| S2 | should | Resolved in round 2 | A click or a drag ending at its original rendered width preserves the original preference. Regression reproduced 640 becoming 384 before the fix; 640 survives click, reload and widening after. |
| S3 | should | Resolved in round 2 | Oliver approved Cmd/Ctrl+Shift+F to search, then Tab to handle. Search claims Tab in capture before the active dock's document handler. Browser test takes the real shortcut route, including with an active question; no direct programmatic rail focus. |

Declined or disputed findings: none. Round 2 checked only S1-S3 and changed code, resolved all three, and approved with no new issues. Independent reviewer whitespace and script syntax checks also passed. Logs: `round-1/s1-red.log`, `round-1/s2-red.log`, `round-1/focus-trace.log`, `round-2-sidebar-smoke.log`. All 2426 tests, typecheck and lint pass again after fixes. Sidebar regression now stresses 82 rows and keeps an active answer ready; accidental POST /api/chat is intercepted, so the test cannot invoke a model.

No commit, push, merge or deployment. Review is complete after 2 rounds; neither round exposed usage.

Review diff before Sol, including the two new files: 12 files, +356/-118.

Review diff after round 1 fixes: 12 files, +410/-118. Added behavior is limited to claiming resize keys, preserving unchanged drag preferences, and the approved focus route. The remaining growth is regression coverage.

## Final handoff

- Approved keyboard route: Cmd/Ctrl+Shift+F, then Tab. Left/Right resize by 16px; Home/End reach bounds; Enter or double-click resets to 256px.
- Sol round 2: [Sol recheck: resize keyboard and saved width](t3-thread://v1/thread:delegated-task:command%3Amcp%3Ae6a34cb8-c006-4781-89a9-d20a06865597%3Adelegate-task%3Athread-ux-sol-round-2-2fc819c9-20261027). Verdict APPROVE, all three should findings resolved. No declined findings. Provider codex, model gpt-6.1-sol, verified effort high. Usage not returned.
- Final review diff: 12 application/test files, +410/-118, versus +356/-118 before review. This excludes this task report. Behavior was unchanged after approval.
- Remaining: pre-existing unfinished-question session-switch smoke timeout; proposed completed-tool grouping, turn-marker target sizing, and coarse-pointer target review are separate follow-ups. Native Electron window and physical touch were not tested.
- Implementation, checks and independent review are complete. Commit/push/merge/deployment were not requested and were not performed.
