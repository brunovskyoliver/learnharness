# Bug fix: Late token bridge replies

- Slug: token-bridge-recovery (from assessment)
- Fixed: 2026-10-29
- Assessment: ./assessment.md
- Status: applied

## Changes

src/demo-kit/runtime.ts retains pending bridge requests when the two-second standalone hint appears. A later valid matching parent reply re-enables editing and hides the hint. Source, nonce/request, schema and revision checks remain. No-response exports remain read-only. Existing UI strings, controls and styling are unchanged.

## Verification

All four tokens-headless tests pass in Chromium. The new reproduction waits for the read-only hint, delivers a matching reply at 2,300 ms and asserts editing resumes, the hint disappears and the returned token renders. The round-two race regression also edits at 1,900 ms and proves recovery resubmits preserved text whose debounce was canceled at 2,000 ms. Existing tests check standalone behavior, foreign/malformed/stale replies, token focus and 320/390/1440 layouts. Full gates and Sol re-review are recorded in test.md.

## UI review

Applied shadcn's reuse guidance to the existing control, with no new component. Impeccable audit and freshly fetched Web Interface Guidelines checked the changed async state behavior: existing polite live regions and form labels remain, keyboard focus and scrolling behavior are unchanged, no motion/dependency/layout change. No findings in the changed behavior.

## Deviations and follow-ups

None.
