# Bug Assessment: Transcript scrolling stalls and falls behind on long sessions

- **Slug**: transcript-scroll-jank
- **Created**: 2026-10-31
- **Source**: pasted text
- **Verdict**: valid
- **Severity**: medium (no data risk; long sessions on every surface feel slow, worst on slower CPUs)

## Report (verbatim or summarized)

> When I scroll on the client it lags a bit. I don't think I'm getting smooth scrolling based on the framerate which I have on the monitor. I shall have full scrolling so that I can easily scroll no matter what. Also handle large cases of a thread being displayed so that we can pre-load it or lazy load it so that only the rendered stuff is being actually rendered. And make it so that we get smooth scrolling with no visual lag whatsoever because now when I fast scroll it kind of slows down so it's like it cannot keep up with the pace.

## Symptom

Scrolling a long session stalls when a gesture starts and falls behind during fast scrolling. Expected: scrolling keeps up with input at the monitor's refresh rate at any session length, and the whole session stays reachable.

## Reproduction

1. Open a long session (fixture: 150 turns, 480 KB, about 45,000 DOM nodes; the largest chat file found on the live host is 912 KB).
2. Flick the wheel upward from the bottom, both right after opening and after older messages finish mounting.
3. Observe the stall at the start of the gesture and the slowdown during the flick.

Scripts and raw results: `~/agent-runs/2026-10-31-scroll-perf/` (`measure.mjs`, `probe.mjs`, `results.json`, `probe.log`).

[NEEDS CLARIFICATION: the owner's client (browser, desktop app or phone), monitor refresh rate and input device were not reported.]

## Measurements

Production build, headless Chromium on a VM with no GPU, 120 wheel events of 300 px, two trials per variant. Frame pacing here says nothing about compositing or a real high-refresh monitor; main-thread work is the reliable signal. `content-visibility` was injected as CSS and passive listeners by patching `addEventListener`; no source changed.

After every message has mounted, ranges across two trials:

| Variant | CPU | Wheel ack p95 (ms) | Frame p95 (ms) | Long tasks | Long-task total (ms) |
| --- | --- | --- | --- | --- | --- |
| Current | 1x | 28–32 | 17.3–17.4 | 1 | 223–225 |
| Passive wheel | 1x | 32–36 | 16.9–17.6 | 1 | 223–224 |
| content-visibility | 1x | 7 | 6.1–6.2 | 1 | 213–215 |
| Current | 4x | 183–264 | 91–128 | 41–104 | 3,564–8,769 |
| Passive wheel | 4x | 175–186 | 93–98 | 59–62 | 4,726–5,056 |
| content-visibility | 4x | 81–83 | 39–40 | 2 | 1,050–1,079 |

Other results:

- **First wheel of a reading gesture (1x):** one style recalculation of 51,093 elements taking 173 ms. The next gesture's longest task was 7 ms.
- **Forced recalculation after changing `--lh-composer-height`:** 198 ms as built, 10 ms with content-visibility.
- **First wheel with content-visibility:** still a 214 ms script call, now containing 152 small style and layout passes.
- **Flick during backfill:** 120 events paced for 1.9 s took 2.7–3.8 s to deliver as built (`measure.mjs`) and 4.9–6.9 s in `probe.mjs`. The two runs disagree on the amount but both show input falling behind.
- **Time until every message is mounted:** 3.1–3.4 s at 1x and 11.8–12.4 s at 4x as built; 2.4 s and 7.8–8.0 s with content-visibility.
- **Reading distance with content-visibility during backfill:** 43,600 px moved for 36,000 px requested, against 33,000 px without it. Placeholder heights distort distance, so the placeholder size needs tuning.

## Suspected Code Paths

- `components/chat.tsx:1383` — sets inherited `--lh-composer-height` on the transcript root. Its only consumer is `scroll-padding-bottom` at `components/chat.tsx:1387`. When the dock folds on the first reading scroll, every descendant recalculates style.
- `components/transcript-window-view.tsx:56` — backfill mounts every older chunk and nothing is ever unmounted, so the DOM ends at the full session size.
- `components/transcript-window-view.tsx:95` — `TranscriptScrollKeeper` reads and writes scroll geometry on each chunk, during the gesture.
- `components/session-reading-state.tsx:36` and `components/session-turn-rail.tsx:79` — re-measure every anchor with `getBoundingClientRect` after each mutation or resize. This is the likely source of the 152 passes seen with content-visibility (inferred from the count matching about 150 answers, not attributed by a profile).
- `components/chat.tsx:2227` — non-passive wheel listener on the scroller. Measured and cleared: making it passive gave no gain, and during backfill it made things worse because more chunks mounted. A comment there records why it is deliberate. Leave it.

## Root Cause Hypothesis

Confidence: high for the first two causes on main-thread cost, medium for how much of the owner's perceived lag they explain, since that was not measured on the owner's hardware. (1) An inherited custom property at the transcript root makes each dock fold restyle the whole session. (2) All mounted messages stay live for style, layout and paint, so per-frame cost grows with session length. (3) Backfill mounts chunks during the gesture and each chunk triggers full anchor re-measurement, which is what makes a fast scroll fall behind in the part of the session still loading.

## Proposed Remediation

**Preferred**: three changes, in order, re-measuring after each.

1. Replace the inherited variable with a direct `scrollPaddingBottom` style on the scroller.
2. Add `content-visibility: auto` with remembered intrinsic size to top-level transcript rows, tuning the placeholder estimate. Browser find, Session find, anchors and keyboard scrolling keep working because the DOM stays whole.
3. Make anchor bookkeeping stop forcing layout: measure from an `IntersectionObserver` or only on demand when saving or jumping, and make backfill yield during an active gesture.

**Alternatives**:

- Windowed virtualization that unmounts offscreen rows. It gives the smallest DOM and lowest memory, but it conflicts with what depends on mounted rows: Session find, the turn rail, hash and reading-position arrival, the answer and demo state in rows, and the single live demo iframe. Browser find would also miss unmounted text, and a library would need owner approval and a startup measurement. Consider it only if the preferred fix misses the target on 900 KB sessions.

**Files likely to change**:

- `components/chat.tsx`
- `app/globals.css`
- `components/transcript-window-view.tsx`
- `components/session-reading-state.tsx`
- `components/session-turn-rail.tsx`
- `scripts/measure-session-performance.mjs`

**Tests to add or update**:

- A scroll benchmark with a 900 KB fixture, budgeted on first-wheel style recalculation, long tasks and wheel ack time.
- Browser regressions: reading-position restore, hash links, turn-rail jumps, Session find and browser find into offscreen rows, keyboard and touch scrolling, dock fold, streaming follow, and printing or export if they read the transcript.

## Risks & Considerations

- content-visibility placeholders can change scroll height and position as rows render. Restoration and jumps depend on those positions.
- `getBoundingClientRect` on skipped rows forces work and can return estimates, so step 2 is not safe without step 3.
- Tall content with internal state (demos, Mermaid, tables) needs checking at 320, 390 and 1440 px. Skipped sandboxed demo iframes must keep their simulation state.
- A headless VM cannot prove smooth output on a real monitor, so the final check needs the owner's hardware.

## Open Questions

- [NEEDS CLARIFICATION: which client and monitor refresh rate should be the acceptance target?]
- Resolved (owner, 2026-10-31): offscreen rows stay in the DOM and the browser skips rendering them. Rows are not unmounted.
