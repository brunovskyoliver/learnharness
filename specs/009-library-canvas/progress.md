# Feature 009: Library and canvas pages
Stage: implement
Updated: 2026-10-30

## Decisions
- 2026-10-30 Canvas page = editable Markdown and math doc beside the chat; learner and agent edit; versions kept (owner).
- Questions are asked one per call, per the constitution, instead of the skill's single batch.

- 2026-10-30 Clarify: all seven recommendations accepted by the owner; recorded in spec.md.

- 2026-10-30 Editor: TipTap (owner). Agent-made pages survive session deletion and are unlinked; constitution III exception approved (owner).

- 2026-10-30 Gate 2: owner replied go. Wording, UI contract and defaults 4-15 in plan.md approved. Chromium installed on the VM with apt (snap, /snap/bin/chromium) at owner request; use it instead of the temporary @sparticuz/chromium in T002.

## Log
- 2026-10-30 audit: ~/agent-runs/2026-10-30-app-audit/audit.md
- 2026-10-30 specify: spec.md written on branch feat/009-library-canvas.

- 2026-10-30 plan and tasks: plan.md, research.md, data-model.md, contracts/, quickstart.md, tasks.md. Editor pending owner approval.

- 2026-10-30 analyze: 1 CRITICAL resolved by owner; 1 HIGH (no FR traceability) and 2 MEDIUM open; awaiting go.

- 2026-10-30 T001 baseline on 4a91642 (code identical to main): lint and typecheck pass. `npm test` without a browser: 2815 pass, 13 fail, 27 skipped. Existing failures: 12 in tests/plot-headless and tests/ml-sampling-headless, because the snap binary found at /usr/bin/chromium has a private /tmp and cannot open file:///tmp/lh-demo-*; and "one app-wide background preference" in tests/chatgpt-auth.test.ts, which passes on rerun (flaky, as in the audit).
- 2026-10-30 T002 owner change: snap Chromium 156.0.8078.47 through ~/agent-runs/2026-10-30-feature-009/chrome-no-sandbox.sh, no @sparticuz/chromium. It needs `TMPDIR` in the home folder as well as `CHROME_PATH`, because of the snap's private /tmp. With both, the 12 browser tests pass and the full suite is 2853 pass, 0 fail, 2 skipped (live network tests). Log: t002-full-test.log.
- 2026-10-30 T003 baseline from a production build of 4a91642 (main's code; the branch adds only specs), isolated data. Throttled benchmark, ten runs per device, medians: desktop startup 4884.7 ms, sidebar 4938 ms, FCP 980 ms; mobile startup 4864.5 ms, sidebar 5050.2 ms, FCP 978 ms; JS 615,373 encoded bytes on both. This resolves `TODO(PERF_BASELINE)` for this feature. scripts/measure-session-performance.mjs only runs three desktop trials per invocation, so the ten-run desktop and mobile numbers come from perf.mjs (008's harness, through `LH_BROWSER_URL`); the repo script ran four times (12 desktop runs) alongside it. Evidence: baseline-summary.json, baseline-perf.json, baseline-repo-script.jsonl.
- 2026-10-30 T004-T006: proxy body limit, PATHS.library, DESIGN.md section.

## Report
