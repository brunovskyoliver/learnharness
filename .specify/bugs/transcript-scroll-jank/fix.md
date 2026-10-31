# Bug Fix: Transcript scrolling stalls and falls behind on long sessions

- **Slug**: transcript-scroll-jank
- **Fixed**: 2026-10-31
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

A dock fold no longer restyles the whole session, offscreen rows skip rendering after rendering once at their real height, and anchor tracking reads only the rows it needs. Backfill now waits for the reader's gesture to pause.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `components/chat.tsx` | modified | Removes the inherited `--lh-composer-height`; mounts the two new components |
| `components/transcript-window-view.tsx` | modified | Adds `TranscriptScrollPadding` and `TranscriptRenderSkip`; backfill holds for 150 ms after wheel, touch or key input |
| `components/transcript-window.ts` | modified | Adds `lastIndexAtOrBefore` and `transcriptAnchorAt` |
| `components/session-reading-state.tsx` | modified | Saves and restores from targeted reads instead of measuring every anchor |
| `components/session-turn-rail.tsx` | modified | Finds the active marker by document order, without layout reads per marker |
| `app/globals.css` | modified | Adds `content-visibility: auto` for measured rows and answer parts |
| `tests/transcript-window.test.ts` | added test | Covers the binary search |
| `scripts/check-transcript-scroll-ui.mjs` | added | Long-session browser regression |

## Tests Added or Updated

- `tests/transcript-window.test.ts` (`lastIndexAtOrBefore`): last item at or above the line, few reads, empty and above-first cases.
- `scripts/check-transcript-scroll-ui.mjs`:
  - first-wheel restyle count stays under 5,000 elements
  - no 300 px wheel moves more than 330 px
  - top and bottom are reachable by wheel
  - browser find and Session find reach skipped rows
  - a rail jump aligns and highlights its marker
  - reading position survives a reload
  - no page overflow at 320, 390 and 1440 px

## Local Verification

Measured with `~/agent-runs/2026-10-31-scroll-perf/measure.mjs`: 150 turns, 480 KB, about 45,000 DOM nodes, production build, headless Chromium with no GPU. Ranges across two trials.

| Metric | CPU | Before | After |
| --- | --- | --- | --- |
| First-wheel elements restyled | 1x | 51,093 | 34 |
| First-wheel longest task | 1x | 214 ms | 28 ms (measured before the render-once and gesture-hold changes; not re-traced on the final build) |
| Long tasks during a flick, settled | 1x | 1 task, 223–225 ms | 0 |
| Wheel ack p95, settled | 1x | 28–32 ms | 4 ms |
| Long-task total, settled | 4x | 3,564–8,769 ms | 104–111 ms |
| Wheel ack p95, settled | 4x | 183–264 ms | 42–47 ms |
| Frame p95, settled | 4x | 91–128 ms | 18–28 ms |
| Time for 120 wheels paced for 1.9 s, settled | 4x | 11.1–15.7 s | 2.7–3.0 s |
| Time until whole session is mounted | 1x | 3.1–3.4 s | 2.9–3.1 s |
| Time until whole session is mounted | 4x | 11.8–12.4 s | 9.5–9.7 s |

The DOM stays at about 45,000 nodes, by the owner's choice.

Commands run:

- `node scripts/check-transcript-scroll-ui.mjs` → 8 of 8 checks pass.
- `npm test` → 3,422 tests, 3,395 pass, 0 fail, the remainder not reported as passing or failing in the summary lines captured.
- `npm run lint`, `npm run typecheck`, `next build` → pass. The script itself is outside lint's scope (ignored pattern). The `npm test`, lint and typecheck runs predate the final additions to the browser script only.
- `LH_UI_STATE_ONLY=1 node scripts/smoke-dock-ui.mjs` → pass: restore, interruption, hash navigation, drafts, responsive layout at 375, 800 and 1600 px, mobile navigation.

Failures in `scripts/smoke-dock-ui.mjs`:

- `checkStreamingUi`, "completed answer starts below the top row": also fails with this fix stashed (offset -132.7 before, -148.8 after). Pre-existing, though the differing offset was not investigated.
- `checkTurnNavigationUi`, "scrolling away cancels the queued expansion": fails the same way with the fix stashed. Pre-existing. It stops that script before its own rail checks, so the rail is covered by the new script instead.
- Full run, `[data-testid="setup-cta"]` not found at `scripts/smoke-dock-ui.mjs:133`: the script's setup step, before any scrolling. Not re-run with the fix stashed, so its origin is unconfirmed. Everything after it in the full run, including the dock motion checks, did not run.

## Deviations from Assessment

- Rows render once before skipping (`TranscriptRenderSkip`). The assessment proposed tuning a placeholder height, but any fixed height made a wheel jump: 300 px gave 1,211 px per 300 px wheel. Rendering once gives real remembered heights, and movement now matches an unskipped transcript.
- Answer parts skip individually as well as rows, because grouped assistant turns form one giant row.
- `IntersectionObserver` was not needed for anchors; binary search over row boxes covers it.
- `scripts/measure-session-performance.mjs` was left unchanged; the budgets live in the new script.

## Follow-ups

- Not verified: smoothness on a real GPU and high-refresh monitor, the desktop app, touch scrolling on a phone, focus rings at row edges, sandboxed demo state in skipped rows, printing, and sessions with Mermaid or tall demos.
- The startup benchmark (constitution VIII) was not run. The change adds no dependency and only a small amount of client code.
- `impeccable` and `web-design-guidelines` were not run; the change is intended to have no visual effect.
- The two pre-existing regression failures and the `setup-cta` failure need their own tickets.
