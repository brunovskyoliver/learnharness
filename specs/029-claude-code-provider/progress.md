# Feature 029: Claude Code provider (port from upstream)
Stage: implement
Updated: 2026-11-11

## Decisions
- 2026-11-11 Plan (technical, spec-constrained, research.md): final upstream files re-applied by hand (R1); MCP SDK loaded inside createToolBridge (R2); live processes, pending sign-ins and auth caches tenant-scoped (R5, R8, R9); hosted CLI env is an allowlist (R6); hosted admission uses a per-tenant auth-status cache refreshed on the async chat path (R8); login children get a no-op BROWSER (R10).
- 2026-11-11 Owner: port the Claude Code feature only (no upstream merge). Upstream fetched as refs/remotes/upstream-tmp/main.

- 2026-11-11 Gate 2 `go`: all recommendations accepted.
  - O1 hosted sign-in copy as proposed in plan.md O1, plus error strings "Paste the code from Anthropic's page.", "Sign-in failed: {CLI message}", "This sign-in expired. Start again." (the single 409/expiry message), "Sign-in could not be started.", "Sign-out could not be completed."; no confirmation on Sign out.
  - O2 hosted Settings keeps installation line + Check again; terminal paragraph replaced by "Sign in with your own Claude account. Your usage is billed to that account."; keeps "Claude Code controls billing. Requires v2.1.259+." without Setup link.
  - O3 port only the provider condition giving Claude Code models send_to_user; not 86185a40's practice restriction.
  - O4 no per-tenant process cap; log live CLI process count per tenant on spawn.
  - O5 (H1) toggle off: no auth status, no sign-in; sign-out stays allowed (amends SC-003: sign-out is the only CLI process allowed while off).
  - O6 (H3) signed-out hosted users see Claude Code models; selecting/sending refuses with "Sign in to Claude Code in Settings → Providers."
  - O7 (H4) new runtime dependency @modelcontextprotocol/sdk 1.32.1 approved (on-demand load, startup check stays).
  - Live local checks on the owner's signed-in CLI (T033 and phase 9) approved as part of `go`. Deploy NOT requested: stop at local build.

## Log
- 2026-11-11 T001 baseline at 0222e2f4 (docs-only after fe682a3f): `npm run typecheck` exit 0, `npm run lint` exit 0, `npm test` (TMPDIR=$HOME/tmp-lh) 4587 tests, 4560 pass, 0 fail, 27 skipped. No pre-existing failures. Next docs read: route.md (handlers take Request), route-segment-config (`runtime` 'nodejs' default; `dynamic` is removed only when cacheComponents is on, which this repo does not enable, so `export const dynamic = "force-dynamic"` stays valid as in app/api/settings/route.ts). Logs in ~/agent-runs/2026-11-11-claude-code/base-*.log.
- 2026-11-11 T003 baseline: `~/agent-runs/2026-11-07-unified-redesign/startup-js/startup-js.mjs` is not on this VM; used its copy from the notebook-mode run (same method: scripts after networkidle + 1.5 s, gzip -9), saved as ~/agent-runs/2026-11-11-claude-code/startup-js.mjs with optional viewport args, and server-cold.mjs (spawn `next start`, fresh LH_DATA_DIR, first 200 on /api/models, median of 5). Results: / 269,372, /chat/new 259,141, /library 278,292 bytes gzip (desktop and 390 identical); server cold start median 776 ms.
- 2026-11-11 plan: plan.md, research.md (R1-R14), data-model.md, contracts/{cli,http,settings-ui}.md, quickstart.md. Constitution Check I-VIII pass; open questions O1-O4 in plan.md. No agent-context script exists in .specify/scripts, so AGENTS.md/CLAUDE.md are unchanged.
- 2026-11-11 tasks: tasks.md, 76 tasks in 9 phases; MVP = Phases 1-3 (T001-T033).
- 2026-11-11 specify: spec.md written; 1 NEEDS CLARIFICATION (FR-012 hosted mode).
- 2026-11-11 phase 1 done (T001-T004): @modelcontextprotocol/sdk 1.32.1 installed exact (lockfile adds only the SDK and its transitive deps; 9 existing packages lose `dev: true`, no version changes); fixtures ported unchanged.
- 2026-11-11 phase 2 done (T005-T021). Deviations: (a) T008's nullable catalog fields caused type errors in components/model-picker.tsx, components/settings/model-menu.tsx and tests/model-catalog.test.ts (the task expected none); fixed with upstream's exact null handling: `catalogLimits` skips null windows (074ba7af, T044's code change), `priceLabel` returns "Unpriced" for null cost and the context cell shows "—" (T043's null cases; the "CLI billing" label is still T043's), model-catalog test asserts null-safely (T025 adds the Claude Code cases). (b) tests/claude-code-context-window.test.ts: `contextLimitForModel` (stats-bar, T045) and toModelDto's Claude Code nulls (T025) do not exist yet, so those assertions are `test.todo` placeholders to restore in T045/T025. (c) Added tests beyond the task text: a registered env source supplies the model env and hears authentication_failed (stream test), Claude Code ids price as null (pricing test), the shared boot record (server-keys), and a control case in server-startup-graph.test.ts proving the check sees tool-bridge's dynamic SDK edge (mutation-checked: a static SDK import fails it; a process-global live-process map fails the tenant test). env.ts exposes `configureClaudeCodeEnv({ env(kind), onNotSignedIn? })`; `CLAUDE_CODE_UNAVAILABLE`/`CLAUDE_CODE_SIGN_IN` are exported from core settings. Verification: typecheck 0 errors, lint clean, `npm test` (TMPDIR under $HOME) 4749 tests, 4720 pass, 0 fail, 27 skipped, 2 todo.

## Report
- 2026-11-11T07:40:03+00:00 clarify: gate 1 answered; hosted per-user CLI login added (FR-012–FR-019); spec updated
- 2026-11-11T07:58:51+00:00 plan+tasks: 76 tasks, 9 phases (MVP 1–3). analyze: 1 CRITICAL, 4 HIGH, 7 MEDIUM, 3 LOW
- 2026-11-11T08:04:19+00:00 gate 2 go; remediation applied, re-analyze 0 CRITICAL/0 HIGH/0 MEDIUM; 77 tasks
