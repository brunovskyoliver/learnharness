# Feature 024: Instant loads
Stage: implement
Updated: 2026-11-09

## Decisions
- Scope (owner, 2026-11-09): all four — PDF ranges + caching, cached plot libraries, lighter plotly build, trim page-load JS.
- Out of scope: subscriptions request loop (separate bug), big-chat HTML size, Caddy config, /api/events header delay.

- Clarify (owner "ok", 2026-11-09): PDF private + revalidate every open; light plotly (3D + contour/heatmap/scatter) with full build fallback per plot, plotly.js build-time dep approved; math/code messages wait for renderer; no plot prefetch.
- Gate 2 (owner "go", 2026-11-09): implement everything; medium findings fixed in spec (mid-read file replace = known limit; hand-written demos keep full plotly).
- Commits: one per phase on main, only feature files (app/globals.css waiting-row fix stays uncommitted, not part of 024). No push/deploy.

## Log
- 2026-11-09 measure: baseline profiled on a throwaway copy of learnharness:amd64 (numbers in spec.md Baseline).
- 2026-11-09 specify: spec.md written; checklist passes except the open clarifications.

- 2026-11-09 clarify: 4 answers encoded in spec.md.
- 2026-11-09 plan: plan.md, research.md (R1–R7), contracts/ (content ranges, demo-lib bridge), data-model.md, quickstart.md; perf driver copied to ~/agent-runs/2026-11-09-instant-loads/perf.
- 2026-11-09 tasks: 31 tasks in 6 phases; MVP = phases 1–2.
- 2026-11-09 analyze: 0 critical, 0 high, 2 medium, 2 low.

## Report
