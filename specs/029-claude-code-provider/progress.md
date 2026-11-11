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
- 2026-11-11 plan: plan.md, research.md (R1-R14), data-model.md, contracts/{cli,http,settings-ui}.md, quickstart.md. Constitution Check I-VIII pass; open questions O1-O4 in plan.md. No agent-context script exists in .specify/scripts, so AGENTS.md/CLAUDE.md are unchanged.
- 2026-11-11 tasks: tasks.md, 76 tasks in 9 phases; MVP = Phases 1-3 (T001-T033).
- 2026-11-11 specify: spec.md written; 1 NEEDS CLARIFICATION (FR-012 hosted mode).

## Report
- 2026-11-11T07:40:03+00:00 clarify: gate 1 answered; hosted per-user CLI login added (FR-012–FR-019); spec updated
- 2026-11-11T07:58:51+00:00 plan+tasks: 76 tasks, 9 phases (MVP 1–3). analyze: 1 CRITICAL, 4 HIGH, 7 MEDIUM, 3 LOW
- 2026-11-11T08:04:19+00:00 gate 2 go; remediation applied, re-analyze 0 CRITICAL/0 HIGH/0 MEDIUM; 77 tasks
