# Mobile Markdown tables implementation plan

Status: approved by Oliver on 2026-10-28, including the review exception below.
Assessment: [assessment.md](assessment.md).

## Approved behavior

Oliver approved shrinking oversized mobile Markdown tables to fit, stopping at
13px and retaining horizontal swiping for tables still too wide at that size.

## Scope and implementation

1. Apply sizing in the existing `MarkdownTable` component in
   `components/md-blocks.tsx`, shared by transcript, lesson questions, and practice
   problems. Use the app's existing phone breakpoint, below 640px
   (`components/chat.tsx`, `PHONE_QUERY`).
2. Measure the full available width outside the content-hugging wrapper and the
   table's unscaled width. Shrink only when the table overflows. Compute the
   scale as `min(1, max(13 / readingFontSize, availableWidth / naturalWidth))`.
   Never enlarge a table, including when an existing reading preference is
   already below 13px. Keep math, spacing, and borders proportional, and ensure
   the scaled table occupies its scaled layout height.
3. Reuse the existing resize/overflow observation where practical. Respond to
   streaming content, loaded fonts, reading preferences, container resizing,
   and crossing the phone breakpoint. Measure independently of the previous
   scale to avoid cumulative shrinking or resize loops. Restore normal size
   when space permits or the phone breakpoint is crossed.
4. Preserve table semantics, text selection, Copy's full source, and its unscaled
   touch target. Keep the horizontal scroll container and accurate edge fades
   for remaining overflow. Make overflow keyboard-reachable with visible focus.
   Use existing shared styling and components; introduce no runtime dependency.
5. Add only the necessary sizing/layout CSS in `app/globals.css`, and record the
   approved mobile table rule in `DESIGN.md`.

## Verification

- Add a focused browser regression using isolated synthetic data and the actual
  renderer. Confirm the reproduced 320px failure before applying the fix.
- Check at 320px, 390px, 639px, 640px, and 1440px. Cover ordinary three-column
  tables, wide tables requiring fallback, long headers, inline math, larger
  reading settings, and narrow tables that already fit.
- Exercise content growth and container resizing; confirm restoration to normal
  size, correct layout height, no page overflow, and no resize-observer loops.
- Verify swipe/programmatic/keyboard access to remaining columns, hidden
  scrollbars, visible focus, and Copy preserving every column.
- Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and relevant
  browser regressions. Record pre-existing failures separately.
- Compare initial JavaScript, app readiness, and sidebar readiness before/after
  under matching desktop/mobile conditions against the constitution's 5% budget.
  Keep evidence under `~/agent-runs/2026-10-28-mobile-markdown-tables/`.
- Use shadcn guidance and review with Web Interface Guidelines. For the unavailable
  impeccable skill, request the exception below rather than claim it ran.

## Constitution check

| Principle | Plan result |
| --- | --- |
| I. Owner decides | Pass: sizing and final plan approved. |
| II. Teaching theory | Pass: presentation only; no answer or teaching changes. |
| III. Learner data | Pass: no persistence changes, composer remounts, or draft resets. |
| IV. Honest states | Pass: all cells remain reachable; fades reflect actual overflow. |
| V. Consent before cost | Pass: isolated fixtures; no model requests. |
| VI. Interface | Pass with approved review exception; preserve the 13px floor, focus, touch controls, and scrolling. |
| VII. Boundaries | Pass: shared client renderer only; no tenant or sandbox changes. |
| VIII. Performance | Pass by plan; reuse measurement, no new dependencies, verify the 5% budget. |

## Approved review exception

The constitution requires the impeccable skill for UI review. It is absent from
the supplied skill catalogs and searched local skill directories. Approved
replacement for this fix: manual visual/accessibility review against DESIGN.md
at 320px, 390px, and 1440px, plus the available Web Interface Guidelines skill.
Record this as an approved exception, not as an impeccable review.

## Deliverables

Implement the approved patch and browser regression, record verification and
deviations in `fix.md`, and run the Spec Kit bug-test workflow. Report source,
commit, push, and deployment status separately.
