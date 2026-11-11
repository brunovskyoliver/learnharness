# Data model: Claude Code provider (feature 029)

One new settings key and one optional field on assistant records. Everything else is in memory or owned by the CLI. No migration: absent values mean off / unknown.

## Claude Code setting (persisted, settings record)

| Field | Where | Type | Default | Validation |
|---|---|---|---|---|
| `claudeCode.enabled` | `settings.json` (`settingsFile()`: the tenant's root in hosted mode, so per user there) | boolean | absent = off | PUT body `{ enabled?: boolean }`; `{}` resets to off; any non-boolean `enabled` is 400 "enabled must be a boolean"; on read, anything but a boolean `enabled` sanitizes to `{}` (off). Unknown keys in the body are ignored. |

Switching it off never rewrites `models.*` pins and never interrupts an admitted turn.

## Installation status (computed, never stored)

`ClaudeCodeStatus` (src/core/contracts/claude-code.ts, upstream):

| Field | Type | Values |
|---|---|---|
| `state` | enum | `not-found`, `version-unchecked`, `update-required`, `meets-minimum` |
| `version` | string \| null | `^\d+\.\d+\.\d+$` parsed from `--version` (`2.1.321 (Claude Code)`), else null |
| `minimumVersion` | string | `CLAUDE_CODE_MINIMUM_VERSION` = `"2.1.259"` |

Never an absolute path, never raw stdout/stderr.

## Hosted auth status (computed, cached per tenant in memory)

`ClaudeCodeAuthStatus` (new, src/core/contracts/claude-code.ts):

| Field | Type | Source | Notes |
|---|---|---|---|
| `state` | `"signed-in" \| "signed-out" \| "unchecked"` | `claude auth status --json` `loggedIn` | `unchecked` when the command fails, times out (5 s) or prints invalid JSON |
| `method` | `"claude-subscription" \| "console" \| "other" \| null` | `authMethod` | mapping from the CLI's raw values is confirmed in the T048 spike; anything unknown → `other`; null when signed out |
| `expiresAt` | string (ISO) \| null | `loginExpiresAt` | past → treated as signed out |

Dropped from the CLI output: `apiProvider`, `analyticsDisabled`, `projectsDirectory`, `configDirectory`, anything else.

Server cache entry: `{ status: ClaudeCodeAuthStatus, checkedAt: number }` in `tenantScoped("__lhClaudeCodeAuth")`. Fresh for 60 s on the async admission path; sync admissions accept any cached `signed-in` whose `expiresAt` is not past; missing entry = signed out for sync callers. Used only for admission (`claudeCodeAdmissible()`); the model catalog never reads it, so signed-out users still see the models (O6). Not refreshed while the opt-in is off (O5). Written by status runs, sign-in success, sign-out, and the stream's `authentication_failed`.

## Pending sign-in (in memory, per tenant)

`tenantScoped("__lhClaudeCodeLogins")` holds at most one:

| Field | Type | Notes |
|---|---|---|
| `method` | `"claudeai" \| "console"` | the CLI flag |
| `url` | string | https, host ∈ {claude.com, claude.ai, console.anthropic.com, platform.claude.com} |
| `startedAt`, `expiresAt` | number | expiresAt = startedAt + 10 min |
| `child` | ChildProcess | never serialized |

Client view `ClaudeCodePendingSignIn`: `{ method, url, expiresAt }` (ISO).

State transitions:

```text
none ──start(method)──▶ starting ──URL parsed──▶ awaiting-code ──code──▶ submitting ──exit 0──▶ none (status refreshed: signed-in)
  ▲                       │ no URL in 15 s / bad host                │                └─exit≠0──▶ none (failure message returned)
  │                       ▼                                          ▼
  └──────────────── none (error) ◀── cancel / 10 min / server exit / a second start (replaces) / opt-in turned off ──┘
```

The code is never stored: it exists in the request body and is written once to the child's stdin.

## Tenant CLI folder (hosted, on disk, owned by the CLI)

| Path | Mode | Created by | Contents |
|---|---|---|---|
| `<LH_DATA_DIR>/users/<id>/claude-code/` (`PATHS.claudeCode`) | 0700 | `ensureClaudeCodeHome()` (src/store/claude-code-home.ts) before any hosted CLI spawn | CLI-written: `.claude.json`, `.credentials.json`, `backups/`, `settings.json` if the CLI writes one; LearnHarness never reads or writes files inside |

Removed when the tenant's data root is removed (it lives under it; T052 asserts this); included in data backups (owner accepted). Model-process temp dirs are not here: they stay in `os.tmpdir()` (plan.md VII).

## Live CLI process (in memory, per tenant)

Upstream `LiveProcess` `{ owner: symbol, sessionId, toolCallIds, kill() }` plus its idle timer, in `tenantScoped("__lhClaudeCodeLiveProcesses")`. Reuse requires the same owner, session id, tool-call ids, configuration (model, effort, system prompt, tools, env) and model-visible history. Idle expiry 10 min (`LIVE_PROCESS_IDLE_TIMEOUT_MS`), MCP timeout 30 min.

## Assistant record field (persisted, chat records)

| Field | On | Type | Notes |
|---|---|---|---|
| `cliContextWindow` | assistant `LhMessage` from provider `claude-code` | positive safe integer, optional | CLI-reported effective budget (`get_context_usage` summary `maxTokens`); app-only, stripped by `toLlmMessages`; `cliContextWindowOf` reads only the latest assistant message and returns null after a compaction marker |

## Catalog entry change

`ModelCatalogEntry.cost` becomes nullable, `contextWindow` and `maxTokens` `number | null`. Only Claude Code entries are null today; the menu shows "CLI billing" and "—".

## CLI child environment

See contracts/cli.md: local is upstream's (launch env minus key-store injections, plus three fixed variables); hosted is an allowlist plus `HOME`, `CLAUDE_CONFIG_DIR`, `DISABLE_AUTOUPDATER=1` and the three fixed variables.
