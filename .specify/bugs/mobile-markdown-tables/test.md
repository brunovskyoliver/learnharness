# Bug Verification: Mobile Markdown tables

- **Slug**: mobile-markdown-tables (from conversation context)
- **Tested**: 2026-10-28
- **Assessment**: [assessment.md](assessment.md)
- **Fix**: [fix.md](fix.md)
- **Result**: verified

## Summary

The original three-column table now fits a 320px viewport: it occupies about
256px, with 13.43px effective text. A wider table stops at 13px and remains
scrollable by touch, keyboard, and programmatic scrolling. Tables that fit and
desktop tables retain their reading size. Copy preserves all columns.

## Checks Performed

| Check | Command / Action | Result | Notes |
| --- | --- | --- | --- |
| Original failure | New browser regression against unchanged production build | Expected failure | 323px table in a 256px container at 320px viewport. |
| Fixed reproduction and regression | `LH_BROWSER_URL=http://127.0.0.1:9223 LH_UI_PRODUCTION=1 node scripts/smoke-md-tables-ui.mjs` | Pass | Actual app at 320, 390, 639, 640, and 1440px. |
| Unit/render/server suite | `npm test` | Pass | 2,557 tests, 536 suites, zero failures on final run. |
| Lint | `NODE_OPTIONS=--max-old-space-size=4096 npm run lint` | Pass | Final keyboard-only edit also passed `npx eslint components/md-blocks.tsx` with the same heap setting. |
| Types | `npm run typecheck` | Pass | Final source. |
| Production build | `npm run build` | Pass | Final source, run separately from the test suite. |
| Performance | `performance.mjs` in evidence directory | Pass | Ten cold trials per build/device, alternating build order; all changes within 5%. |
| UI review | Manual DESIGN.md review plus Web Interface Guidelines | Pass | Owner-approved substitute for unavailable impeccable skill; shadcn guidance used. |
| Patch hygiene | `git diff --check` | Pass | Generated `next-env.d.ts` changes reverted; no debug instrumentation remains. |

The browser regression also verifies large and small reading preferences,
inline math, long headers, content growth/shrinkage, available-width changes,
restoration after resizing, scaled layout height, hidden scrollbars, focus,
Copy's 44px touch target, and no resize feedback loop. In a lesson, ArrowRight
scrolls a focused table without changing confidence.

## Output Excerpts

```text
PASS wide-table floor, scrolling, keyboard focus, and hidden scrollbars
PASS reading preference, content growth/shrink, and container resize
PASS complete Copy source, touch target, lesson keyboard isolation, and no browser errors

tests 2557
suites 536
pass 2557
fail 0
```

## Performance Evidence

Identical isolated synthetic data, 80ms network latency, 1.6Mbps download,
4x CPU throttling, and cold browser contexts. Medians from ten trials per case:

| Metric | Desktop before / after | Mobile before / after |
| --- | --- | --- |
| Hydrated composer and graph-section readiness | 2156.00 / 2155.30ms | 2128.85 / 2131.05ms |
| Sidebar New menu opens | 2254.50 / 2247.35ms | 2355.10 / 2368.25ms |
| Initial JavaScript encoded bytes | 232118 / 232118 | 232118 / 232118 |

These are matched before/after measurements for this fix on this server, not a
claim to reproduce the historical Mac baseline. Raw samples, settings, commands,
and screenshots are in
`/home/brunovsky/agent-runs/2026-10-28-mobile-markdown-tables/`.

## Earlier Attempts and Existing Limitations

- The initial full suite had one authentication timing failure. Its isolated
  34-test file passed, and two subsequent full runs passed all 2,557 tests.
- Initial lint exhausted Node's default heap. The full run passed with 4096MB.
- Running tests and build concurrently exposed a tracing race: the build tried
  to copy a temporary test chat that had been deleted. The final sequential
  production build passed.
- The optional `scripts/build-server.mjs` curation command refused local
  standalone output because Next traced a `data/` directory. The unchanged
  baseline also contained that directory. No deployable standalone package is
  claimed; this unrelated packaging issue was not changed. The temporary build
  snapshots used for measurement were removed after verification.
- Browser checks used Chromium with mobile viewport/touch emulation. A physical
  iPhone/Safari session was not available.

## Recommendation and Delivery Status

The scoped UI fix is verified locally. Oliver reviewed the dev app and authorized
commit and push on 2026-10-28. The live server remains on the previous deployment.
