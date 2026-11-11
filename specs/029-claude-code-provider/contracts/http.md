# Contract: HTTP endpoints

All routes are `withTenant`-wrapped (hosted: 401 "Sign in required." without a Clerk user), `runtime = "nodejs"`, `dynamic = "force-dynamic"`. Every response carries `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. No CORS headers.

## Same-origin rule (both Claude Code routes)

`origin` = `subscriptionRequestOrigin(request)` (fork's `web-subscription-http.ts`). Refuse with 403 `{ "error": "Claude Code checks require a same-origin LearnHarness request." }` when: no origin can be derived; header `x-learnharness-claude-code` is not `"1"`; `sec-fetch-site` is `cross-site`; an `Origin` header is present and differs from `origin`. POST additionally requires `Origin` to be present and equal.

## GET /api/claude-code — installation status (upstream)

- 403 `{ "error": "Claude Code is disabled." }` when `claudeCode.enabled` is not true (no probe runs).
- 200 `ClaudeCodeStatus` (data-model.md). Runs only `--version`.

## PUT /api/settings/claudeCode — opt-in (existing settings route, new section)

- Body `{ "enabled": true | false }` or `{}`; 400 `{ "error": "enabled must be a boolean" }` / `"Invalid JSON body"`.
- 200 `{ "settings": UserSettings }` with `claudeCode.enabled` as saved. Other sections untouched.

## GET /api/claude-code/auth — hosted sign-in status (fork-only)

- Not hosted: 404 `{ "error": "Claude Code sign-in is only available on the hosted site." }`.
- 403 `{ "error": "Claude Code is disabled." }` when the opt-in is off; no CLI process runs (SC-003, O5).
- 200:

```json
{ "auth": { "state": "signed-in", "method": "claude-subscription", "expiresAt": "2026-12-12T08:00:00.000Z" },
  "pending": null }
```

`pending` is `{ "method": "claudeai" | "console", "url": "https://claude.com/cai/oauth/authorize?…", "expiresAt": "…" }` while a sign-in waits for its code. Status runs `claude auth status --json` (refreshes the tenant cache) only while the opt-in is on.

## POST /api/claude-code/auth — hosted actions (fork-only)

Body is one of:

| Body | Requires opt-in | Success | Errors |
|---|---|---|---|
| `{ "action": "start", "method": "claudeai" \| "console" }` | yes (403 "Claude Code is disabled.") | 200 `{ "pending": {…} }`; replaces an earlier pending sign-in | 409 `{ "error": "Claude Code is unavailable. Enable and set it up in Settings → Providers." }` when the CLI is not installed or below minimum; 502 `{ "error": "Sign-in could not be started." }` when no allowed URL appears in 15 s |
| `{ "action": "code", "code": "<1-512 chars, no control characters>" }` | yes (403 "Claude Code is disabled.") | 200 `{ "auth": {…}, "pending": null }` | 400 "Paste the code from Anthropic's page." (empty/invalid); 409 "This sign-in expired. Start again." (none pending or expired); 422 `{ "error": "Sign-in failed: <CLI line, code redacted>" }` (non-zero exit; pending ends) |
| `{ "action": "cancel" }` | no | 200 `{ "pending": null }` | — |
| `{ "action": "sign-out" }` | no (the only CLI process allowed while off, O5) | 200 `{ "auth": {…}, "pending": null }` | 502 "Sign-out could not be completed." when logout exits non-zero (status still returned in `auth`) |

Any other body: 400 "Unknown action.". Not hosted: 404 as above. All user-facing strings here are owner-approved (gate 2, O1). Saving the opt-in as off (`PUT /api/settings/claudeCode`) cancels the tenant's pending sign-in.

Guarantees (tested): no response, error or log line contains the submitted code, a token, `configDirectory`, `projectsDirectory` or an absolute path; requests from tenant A never touch tenant B's pending sign-in, cache or folder.

## Admission refusals (existing envelopes)

Chat, notebook, cards, jobs and library references refuse a Claude Code model with the existing provider-key envelope (`code: PROVIDER_KEY_MISSING_CODE`, `provider: "claude-code"`, `slots`) and `error`:

- "Claude Code is unavailable. Enable and set it up in Settings → Providers." (opt-in off, CLI not found; locally also any non-auth problem)
- "Sign in to Claude Code in Settings → Providers." (hosted, opt-in on, CLI installed, tenant signed out or expired; the models still appear in the catalog, O6)

Nothing is persisted on refusal.
