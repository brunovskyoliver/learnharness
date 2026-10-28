# Bug Fix: Mobile Markdown tables

- **Slug**: mobile-markdown-tables (reused from conversation context)
- **Fixed**: 2026-10-28
- **Assessment**: [assessment.md](assessment.md)
- **Plan**: [plan.md](plan.md)
- **Status**: applied
- **Stage**: verified locally; see [test.md](test.md)

## Summary

Oversized Markdown tables below 640px shrink proportionally to their available
width, with a 13px effective text-size floor. Wider tables remain scrollable.
Copy stays outside the scaled table and has a visible 44px touch target.

## Changes

| File | Change | Notes |
| --- | --- | --- |
| `components/md-blocks.tsx` | Modified | Shared table sizing, resize observation, accessible overflow region, native scroll-key isolation. |
| `app/globals.css` | Modified | Phone-only layout zoom, visible focus boundary, touch-sized Copy action. |
| `DESIGN.md` | Modified | Records the approved mobile table rule. |
| `scripts/smoke-md-tables-ui.mjs` | Added | Browser regression with synthetic practice and lesson fixtures. |

The existing ResizeObserver also observes the outer available-width container.
Measurement uses unscaled table width and the full container width rather than
the already-shrunken wrapper. Updates are coalesced into animation frames and
only write a scale when it changes. CSS zoom reduces layout height as well as
visual size, while preserving native table semantics and text selection.

Native scroll-key events are stopped at the focused overflow region before the
lesson's document-level shortcuts can consume them. This was verified with an
active lesson: ArrowRight scrolls the table and leaves confidence unchanged.
Modified shortcuts and events originating inside descendant controls retain
their existing behavior.

## Tests Added

`scripts/smoke-md-tables-ui.mjs` exercises the actual renderer in isolated data:

- 320, 390, 639, 640, and 1440px viewports.
- Three-column math table fitting and wide-table 13px floor.
- Native touch swipes, keyboard scrolling, programmatic scrolling, edge fades,
  hidden scrollbars, and visible focus.
- Reading-size changes, small pre-existing reading preferences, content growth
  and shrinkage, container resizing, desktop restoration, and stable sizing.
- Full Copy source, unscaled touch target, and no browser errors.
- Lesson scroll keys do not change answer confidence.

The new regression failed against the unchanged production build at the original
320px symptom before the implementation. The fixed development and production
versions passed the sizing checks. Final exact-source results are in `test.md`.

## Decisions and Deviations

- Oliver approved the plan and manual DESIGN.md/Web Interface Guidelines review
  substitute for the unavailable impeccable skill on 2026-10-28.
- No scope expansion outside the planned files. The Copy target was previously
  24px; it was enlarged on coarse pointers to meet the planned 44px check.
- A React bubbling handler did not protect table keys from the lesson's native
  document handler. The final code uses an element-level native listener and
  removes it during cleanup. The lesson browser regression verifies the result.
- No new runtime dependency, provider request, storage change, or composer remount.

## Review

Used the existing Markdown renderer and Copy control with shadcn guidance.
Manual review covered the 320, 390, and 1440px screenshots against DESIGN.md.
Web Interface Guidelines review covered semantics, focus, overflow, long content,
touch targets, reduced motion, and layout measurement outside React render.
No remaining findings in the changed UI.

References consulted:

- [CSS zoom](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/zoom)
- [shadcn Button](https://ui.shadcn.com/docs/components/radix/button)
- [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)

## Status

Implementation and verification complete. Oliver reviewed the dev app and
authorized commit and push on 2026-10-28. Production deployment remains unchanged.
Evidence lives under
`/home/brunovsky/agent-runs/2026-10-28-mobile-markdown-tables/`.
