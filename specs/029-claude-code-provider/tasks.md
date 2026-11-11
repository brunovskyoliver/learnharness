---
description: "Tasks for feature 029, Claude Code provider (port from upstream)"
---

# Tasks: Claude Code provider (port from upstream)

**Input**: specs/029-claude-code-provider/ (plan.md, spec.md, research.md, data-model.md, contracts/cli.md, contracts/http.md, contracts/settings-ui.md, quickstart.md)

**Tests**: included. SC-002, SC-003 and SC-004 ask for tests, the constitution requires them, and upstream ships 14 suites that are part of the port.

**Upstream source**: always the final version, `git show upstream-tmp/main:<path>`. "Port" means copy that file, then apply only the adaptations named in the task. Touch-point hunks are re-applied by hand to this fork's current file (plan.md, "Fork touch points").

**UI tasks** (T037-T040, T043, T045, T061-T063, T077) are built with the `shadcn` skill (constitution VI) and checked in T069-T070.

**Owner answers**: gate 2 answered O1-O7 (plan.md "Owner answers (gate 2)", progress.md Decisions). Markers (O1)-(O7) cite the answer a task implements; nothing waits.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an unfinished task.
- **[Story]**: US1, US2, US2b, US3 from spec.md.

---

## Phase 1: Setup

- [X] T001 Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` and `.../02-route-segment-config/` (runtime, dynamic); run `npm test`, `npm run lint`, `npm run typecheck` at HEAD and record pre-existing failures under Log in specs/029-claude-code-provider/progress.md
- [X] T002 Add the runtime dependency: `npm install --save-exact @modelcontextprotocol/sdk@1.32.1` (package.json `dependencies`, package-lock.json); confirm `node_modules/@modelcontextprotocol/sdk/package.json` version 1.32.1 and that no other dependency changed
- [X] T003 Measure the startup baseline at HEAD `fe682a3f` before any source change: `npm run build`, `next start` with a fresh `LH_DATA_DIR`, `~/agent-runs/2026-11-07-unified-redesign/startup-js/startup-js.mjs` for `/`, `/chat/new`, `/library` at desktop and 390×844, plus server cold start (process start → first `/api/models` 200); save `startup-base.json`, `startup-base-390.json`, `server-cold-base.json` in `~/agent-runs/2026-11-11-claude-code/`
- [X] T004 [P] Port the fixtures `tests/fixtures/claude-code/fake-claude.mjs`, `text.jsonl`, `tool.jsonl`, `signed-out.jsonl` unchanged from upstream

---

## Phase 2: Foundational (blocks every story)

- [X] T005 [P] Create src/core/contracts/claude-code.ts: upstream file (`CLAUDE_CODE_PROVIDER`, `ClaudeCodeStatus`, `CLAUDE_CODE_MINIMUM_VERSION = "2.1.259"`) plus the hosted types of data-model.md: `ClaudeCodeAuthStatus` (`state: "signed-in" | "signed-out" | "unchecked"`, `method: "claude-subscription" | "console" | "other" | null`, `expiresAt: string | null`), `ClaudeCodeSignInMethod = "claudeai" | "console"`, `ClaudeCodePendingSignIn` (`{ method, url, expiresAt }`)
- [X] T006 [P] Create src/core/auth-env.ts: upstream file unchanged (`authEnvRecord`, `externalCliEnv`)
- [X] T007 Export from src/core/index.ts after the `cost-summary` line: `CLAUDE_CODE_PROVIDER`, `CLAUDE_CODE_MINIMUM_VERSION` and the four types of T005
- [X] T008 [P] In src/core/contracts/models.ts make `cost` `{ input; output; cacheRead; cacheWrite } | null`, `contextWindow: number | null`, `maxTokens: number | null` with upstream's doc comments; fix every type error this causes outside the files T024, T043-T045 change (expected: none)
- [X] T009 In src/core/native-messages.ts import `CLAUDE_CODE_PROVIDER`; extend the fork's `LhMessage` (line 97, keep the `references` user extension) with `cliContextWindow?: number`; add upstream's `cliContextWindowOf` (latest assistant only, null after a `compaction` marker, positive safe integer, provider `claude-code`); strip `cliContextWindow` with `id` in `toLlmMessages` (line 652)
- [X] T010 In src/core/settings.ts add `CLAUDE_CODE_UNAVAILABLE = "Claude Code is unavailable. Enable and set it up in Settings → Providers."` and `CLAUDE_CODE_SIGN_IN = "Sign in to Claude Code in Settings → Providers."`; `providerKeyMissing(provider, slots, error?)` uses `error ?? (provider === CLAUDE_CODE_PROVIDER ? CLAUDE_CODE_UNAVAILABLE : "No {label} key is set — add one in Settings → Keys")`; `isProviderKeyRefusal` also matches both sentences exactly; `UserSettings.claudeCode?: { enabled?: boolean }`; upstream's sanitizer block ("absent/invalid is off": only a boolean `enabled` survives, anything else becomes `{}`)
- [X] T011 In src/server/keys.ts replace the local `AuthBoot`, `BOOT_KEY` and `boot()` (lines 57-73) with `import { authEnvRecord as boot } from "../core/auth-env.ts"`; no other change (hosted logic untouched)
- [X] T012 [P] Port unchanged from upstream into src/agent/claude-code/: `constants.ts`, `provider.ts`, `binary.ts`, `launch.ts`, `cli-events.ts`, `transcript.ts`, `reuse-context.ts`, `context-window.ts`; port `installation.ts` with `readClaudeVersion` taking its env from `claudeCodeEnv("probe")` (T015) instead of `externalCliEnv()`
- [X] T013 Port src/agent/claude-code/tool-bridge.ts with the SDK loaded on demand (research R2): type-only top-level imports from `@modelcontextprotocol/sdk/*`; a memoized `loadMcpSdk()` doing `Promise.all([import("@modelcontextprotocol/sdk/server/index.js"), import("@modelcontextprotocol/sdk/server/streamableHttp.js"), import("@modelcontextprotocol/sdk/types.js")])` awaited at the top of `createToolBridge`; `createMcpServer`/`createHttpServer` receive the loaded values; behavior otherwise identical
- [X] T014 [P] Create tests/server-startup-graph.test.ts: esbuild-bundle `src/agent/models.ts` and `src/server/index.ts` (`platform: "node"`, `bundle: true`, `metafile: true`, `write: false`, `splitting: true`, `format: "esm"`, node_modules external except a resolve plugin that marks `@modelcontextprotocol/sdk` imports and records their `kind`); assert every SDK import edge is `dynamic-import`, never `import-statement`; add to tests/startup-module-graph.test.ts an assertion that no browser entry pulls `node_modules/@modelcontextprotocol/` or `src/agent/claude-code/`
- [X] T015 Create src/agent/claude-code/env.ts: `configureClaudeCodeEnv(source)` / `claudeCodeEnv(kind: "probe" | "model" | "auth")` / `notifyClaudeCodeNotSignedIn()` on a `Symbol.for("lh.claudeCodeEnv")` global (the `configureProviderEnv` pattern in src/agent/models.ts); default source = upstream local env: `{ ...externalCliEnv(), MCP_TOOL_TIMEOUT: "1800000", CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT: "1800000", CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1" }` (the three fixed values always override inherited ones); hosted branch comes in T051
- [X] T016 Port src/agent/claude-code/live-processes.ts with the map inside `tenantScoped("__lhClaudeCodeLiveProcesses", () => new Map())` from config.ts (research R5); exports and the `liveProcessIdleTimeoutMs` seam unchanged
- [X] T017 Port src/agent/claude-code/stream.ts: `toClaudeEnv()` returns `claudeCodeEnv("model")`; on `authentication_failed` also call `notifyClaudeCodeNotSignedIn()`; everything else upstream (args of contracts/cli.md §2, 30-min MCP timeout, bare-name skip, abort and cleanup, context probe)
- [X] T018 [P] In src/server/pricing.ts `catalogModel` (line 12) return undefined for ids whose provider prefix is `claude-code` (upstream 17c94be3), so Claude Code usage is unpriced, never $0
- [X] T019 [P] Port tests unchanged except imports: tests/claude-code-binary.test.ts, claude-code-installation.test.ts, claude-code-version-runner.test.ts, claude-code-provider.test.ts, claude-code-transcript.test.ts, claude-code-tool-bridge.test.ts, claude-code-context-window.test.ts (its `catalogLimits` import comes from components/model-picker.tsx, done in T044; mark that one case `todo` until T044 lands)
- [X] T020 Port tests/claude-code-stream.test.ts (final upstream incl. 512a59d0, 1a523dd5, c8af672c, 7ebaef7f, 6809a8e8): env assertions read `claudeCodeEnv("model")` semantics; keep "preserves existing CLI environment authentication" and the saved-key exclusion case (SC-002); add a case that two tenants' `runAsTenant` lookups never return each other's live process
- [X] T021 [P] Apply upstream's Claude Code assertions to tests/server-keys.test.ts (shared `authEnvRecord`, `externalCliEnv` drops fill-gapped names) and tests/pricing-native-parity.test.ts (claude-code ids unpriced)

**Checkpoint**: the adapter, bridge and env seam work in isolation; nothing registers the provider yet.

---

## Phase 3: User Story 1 - Learn with a Claude Code model (P1) 🎯 MVP

**Goal**: with the opt-in set (`PUT /api/settings/claudeCode {"enabled":true}`) and a signed-in local CLI, Claude Opus/Sonnet/Haiku run lessons, questions, practice and background jobs through LearnHarness's own loop and tools.

**Independent test**: the harness suite with the fake CLI (reply streams, question held and answered in the same process, fresh replay after expiry, abort cleans up, saved key absent), then quickstart §3 steps 4, 6 and 7 with the real CLI.

- [X] T022 [US1] Create src/server/claude-code-config.ts: upstream `claudeCodeEnabled()` / `claudeCodeAvailable()` (settings store + `getClaudeBinary()`; enabled + binary in both modes, this is what the catalog uses, O6); `claudeCodeAdmissible()` (= `claudeCodeAvailable()` for now; hosted sign-in check added in T054); `claudeCodeRefusalText()` (unavailable sentence for now; hosted sign-in sentence added in T057); `cliBackgroundAllowed(provider)` = `connectionBackgroundAllowed(provider) && (provider !== CLAUDE_CODE_PROVIDER || providerKeyPresent(provider))`; register the env source with `configureClaudeCodeEnv` at import (local = default)
- [X] T023 [US1] In src/server/settings-body.ts add upstream `parseClaudeCodeSettingsBody` (`{}` → off; non-boolean `enabled` → "enabled must be a boolean"; other keys ignored) and `claudeCode: parseClaudeCodeSettingsBody` in the fork's `SETTINGS_SECTIONS` (keep `notebook`); update tests/settings-body.test.ts with upstream's section-list assertion
- [X] T024 [US1] In src/server/keys.ts `providerKeyPresent` add `if (provider === CLAUDE_CODE_PROVIDER) return claudeCodeAdmissible();` before the subscription branch (locally opt-in + installation only, never authentication)
- [X] T025 [US1] Apply upstream hunks to src/server/model-catalog.ts: `connectionModel` undefined when Claude Code is unavailable; `catalogProviders` row `{ id: CLAUDE_CODE_PROVIDER, envVar: "", keyPresent: claudeCodeAvailable() }`; `toModelDto` null cost/contextWindow/maxTokens for Claude Code; `catalogContextLimits` skips it; keep the fork's ChatGPT, subscription and codex-verify lines; update tests/model-catalog.test.ts with upstream's Claude Code cases (absent while off, three models while on, nulls in DTOs, saved pins still validate)
- [X] T026 [US1] Register the provider in src/agent/models.ts `piModels()`: `collection.setProvider(createClaudeCodeProvider(streamClaudeCode))` after the builtin loop (line 65)
- [X] T027 [US1] (O3: provider condition only, no `sendToUserApplies`, no narration guard) In src/agent/teacher-agent.ts line 205 gate `send_to_user` on `opts.tools === undefined && (engine.model.provider === CLAUDE_CODE_PROVIDER || engine.model.id.toLowerCase().includes("claude"))`; add upstream's claude-code case to tests/send-to-user.test.ts (the tool is offered to `claude-code:sonnet`)
- [X] T028 [US1] In src/server/chat-handler.ts import `connectionBackgroundAllowed as subscriptionBackgroundAllowed` (line 10) and use `cliBackgroundAllowed` at lines 230, 233, 267, 643, 652; the refusal envelopes at lines 104, 129 and the admission at 237 pass `claudeCodeRefusalText()` when the provider is `claude-code`
- [X] T029 [P] [US1] Route src/server/jobs.ts (line 253) and src/server/session-titles.ts (line 72) through `cliBackgroundAllowed`; pass `claudeCodeRefusalText()` for `claude-code` in the refusals of src/server/notebook.ts (line 94), src/server/card-generation.ts (line 71) and src/server/library-references.ts
- [X] T030 [US1] Port tests/claude-code-opt-in.test.ts: `SETTINGS_FILE` → `settingsFile()`; keep parse/sanitize, default-off catalog, toggle preserving pins and unrelated sections, disabled probe refused, background job refused with "Enable and set it up in Settings" and not "add one in Settings → Keys"
- [X] T031 [US1] Port tests/claude-code-harness.test.ts (real chat handler + fake CLI): `SETTINGS_FILE` → `settingsFile()`; keep held question answered in the same process, fresh replay after `liveProcessIdleTimeoutMs`, abort removes temp dirs, `cliContextWindowOf` on the saved assistant record (confirm src/store/chats.ts keeps the field)
- [X] T032 [US1] Add tests/claude-code-admission.test.ts (SC-003): with the opt-in off and a fake `claude` on `PATH` that writes a marker file when executed, a chat turn, a background job, a session title, a notebook request, a card generation and a library-references request on `claude-code:sonnet` each refuse before write-ahead and the marker never appears
- [X] T033 [US1] Live local check with the real CLI (quickstart §3 steps 4, 6, 7, opt-in via `curl -X PUT /api/settings/claudeCode`): one lesson with a tool call and a learner question (SC-001), stop mid-turn, opt-in off refusal, saved key absent from `/proc/<pid>/environ`; note results in progress.md Log, evidence in `~/agent-runs/2026-11-11-claude-code/`

**Checkpoint (MVP)**: Claude Code works end to end locally; enabling still needs the API; usage shows tokens and no price.

---

## Phase 4: User Story 2 - Opt in and check installation (P2)

**Goal**: Settings → Providers → External CLI: toggle (off by default), installation status, Check again, setup guidance (upstream copy without "Verify AI claims…").

**Independent test**: toggle with and without a fake CLI on `PATH`; status text and model-picker contents follow (US2 acceptance 1-3).

- [X] T034 [US2] Create src/server/claude-code.ts from upstream (`claudeCodeInstallationStatus`, `claudeCodeInstallationResponse` with the same-origin rule of contracts/http.md); export `claudeCodeInstallationResponse` from src/server/index.ts after `sessionCost`
- [X] T035 [US2] Create app/api/claude-code/route.ts: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `export const GET = withTenant(claudeCodeInstallationResponse);` (tests/tenant-routes.test.ts must stay green)
- [X] T036 [P] [US2] Add `"claudeCode"` to `SettingsSection` in components/settings-signal.ts; in components/model-picker.tsx refetch the catalog on `section === "keys" || section === "claudeCode"` (line 47)
- [X] T037 [P] [US2] Add upstream's optional `actionVariant?: "outline" | "ghost"` to the fork's `ConnectionRow` in components/settings/connection-controls.tsx (default unchanged: outline for "Connect", ghost otherwise; keep the fork's classes)
- [X] T038 [US2] Create components/settings/claude-code-status.tsx from upstream with the shadcn skill: same state machine and fetches; paper classes per research R12 and contracts/settings-ui.md; no "Verify AI claims independently…" line; locked (faint) switch while loading or saving; `pointer-coarse:min-h-11` on Check again
- [X] T039 [US2] Add the "External CLI" group (`testid="group-external-cli"`) with `<ClaudeCodeInstallationStatus />` after Subscriptions in components/settings/keys-section.tsx
- [X] T040 [P] [US2] Add `{ section: "keys", row: "claude-code", label: "Claude Code", hint: "External CLI" }` to components/settings/settings-index.ts and the matching row anchor in claude-code-status.tsx so search scrolls and focuses the switch
- [X] T041 [US2] Port tests/claude-code-status-http.test.ts unchanged and tests/claude-code-status-ui.test.tsx with `useModelCatalog` from components/model-picker.tsx, DOM queries for the fork's markup, and the "Verify AI claims" assertion inverted (absent); update tests/chatgpt-connection-ui.test.tsx's fetch mock for `/api/claude-code` and `/api/settings` (upstream c5a756d7)
- [X] T042 [US2] Add tests/e2e/study/claude-code-settings.spec.ts (Playwright `study` project, intercepted `/api/claude-code` and `/api/settings/claudeCode`): default off with no Claude Code model in the picker; on → "Version 2.1.321 · meets minimum" and three models; not-found and update-required labels; Check again; off again hides the models; keyboard-only path; 320/390/1440 without overflow

**Checkpoint**: the owner can opt in and diagnose installation from Settings.

---

## Phase 5: User Story 3 - Honest usage and cost (P3)

**Goal**: tokens and CLI context window shown; cost unpriced and "CLI billing", never $0.

**Independent test**: fake-CLI turn, then the stats bar and model menu (US3 acceptance 1-2).

- [X] T043 [P] [US3] In components/settings/model-menu.tsx: `priceLabel` returns "Unpriced" for null cost; Claude Code rows show "CLI billing" (title "Billing is determined by your Claude Code configuration; LearnHarness does not estimate it.") in place of "{price} / 1M"; the context cell shows "—" for a null window
- [X] T044 [P] [US3] In components/model-picker.tsx `catalogLimits` (line 69) skip entries whose `contextWindow` is null (074ba7af); un-`todo` the case in tests/claude-code-context-window.test.ts
- [X] T045 [US3] In components/stats-bar.tsx (`StatsBarDetails`): `cliContextWindow` prop, exported `contextLimitForModel(model, limits, cliWindow)`, `limit` from it (line 92), "CLI" added to the cost label's providers when any turn's model starts with `claude-code:` (line 111), and the detail line "Window reported by Claude Code; may be lower for auto-compaction." when the selected model is Claude Code
- [X] T046 [US3] Pass `cliContextWindow={cliContextWindowOf(nativeMessages)}` to both `StatsBar` call sites in components/chat.tsx (lines 1878, 2668)
- [X] T047 [US3] Port tests/claude-code-usage.test.tsx and tests/claude-code-context-ui.test.tsx without the `InteractionLayersProvider` / `interaction-layer-render.tsx` wrappers (render `StatsBar` and `ModelMenuList` directly), with the fork's `ModelCatalogResponse` shape (role pins as in the fork)

**Checkpoint**: the local port is complete (US1-US3).

---

## Phase 6: User Story 2b - Hosted per-user sign-in, server (P2)

**Goal**: in hosted mode each tenant's CLI runs in its own 0700 folder with no operator credentials; sign-in, status and sign-out relay the unmodified CLI; signed-out tenants are refused before write-ahead.

**Independent test**: fake CLI mimicking `auth login/status/logout` and model runs for two tenants (US2b acceptance 1-3).

- [X] T048 [US2b] Spike outside the repo (`~/agent-runs/2026-11-11-claude-code/auth-spike/`, nothing committed) with the real 2.1.321 and a scratch `CLAUDE_CONFIG_DIR`: (a) `--console` prints the same "visit:" line; (b) output and exit code for a wrong code and for an empty line; (c) `BROWSER=/bin/true` suppresses the browser launch; (d) the raw `authMethod` and `loginExpiresAt` format read from the owner's existing local login with `claude auth status --json` (no new login; scratch dirs use fake codes only); the Console `authMethod` value stays unverified and maps to `other` until seen (follow-up in T076); (e) `auth logout` exit code when already signed out; record results and any change to research R9 under Decisions in progress.md
- [X] T049 [US2b] Add `get claudeCode() { return path.join(dataRoot(), "claude-code"); }` to `PATHS` in config.ts
- [X] T050 [P] [US2b] Create src/store/claude-code-home.ts: `ensureClaudeCodeHome(): string` = `mkdirSync(PATHS.claudeCode, { recursive: true, mode: 0o700 })`, then `chmodSync(…, 0o700)`; returns the path; never reads or writes inside it
- [X] T051 [US2b] Hosted env (research R6, contracts/cli.md §3): in src/server/claude-code-config.ts register a source that, when `hostedMode()`, builds the allowlist env (`PATH`, `LANG`, `LANGUAGE`, `LC_*`, `TZ`, `TMPDIR`, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `SSL_CERT_DIR`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` and lower-case proxy forms) plus `HOME` = `CLAUDE_CONFIG_DIR` = `ensureClaudeCodeHome()`, `DISABLE_AUTOUPDATER=1`, the three fixed values, and for kind `"auth"` `BROWSER=/bin/true`; local stays upstream's env
- [X] T052 [US2b] Create tests/claude-code-hosted-env.test.ts (`LH_HOSTED=1`, two `runAsTenant` ids, server env seeded with `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_USE_BEDROCK`, `AWS_ACCESS_KEY_ID`, `OPENROUTER_API_KEY`): none reaches `claudeCodeEnv` for any kind; `HOME`/`CLAUDE_CONFIG_DIR` differ per tenant and the folders are 0700; each folder lies under that tenant's data root, so removing the root removes the login (spec edge case); a call outside a tenant throws; a fake-CLI model turn spawns with that env (SC-002 hosted, FR-016)
- [X] T053 [US2b] Create src/server/claude-code-auth.ts, status part: `readClaudeCodeAuth()` runs `claude auth status --json` (contracts/cli.md §4, 5 s, never logs output), maps to `ClaudeCodeAuthStatus` (mapping from T048; unknown method → `other`; past `expiresAt` → signed out; failure → `unchecked`), writes the per-tenant cache `tenantScoped("__lhClaudeCodeAuth")`; `refreshClaudeCodeAuth({ maxAgeMs: 60_000 })`; `cachedClaudeCodeSignedIn()`; register `notifyClaudeCodeNotSignedIn` to set `signed-out`
- [X] T054 [US2b] (O6) In src/server/claude-code-config.ts: hosted `claudeCodeAdmissible()` additionally requires `cachedClaudeCodeSignedIn()`; `claudeCodeAvailable()` (catalog) stays enabled + binary, so signed-out users still see the models; `claudeCodeRefusalText()` returns `CLAUDE_CODE_SIGN_IN` when hosted, enabled, installed and not signed in; extend tests/model-catalog.test.ts: hosted, enabled, signed out → three Claude Code models listed
- [X] T055 [US2b] Sign-in relay in src/server/claude-code-auth.ts (research R9, data-model.md state machine): `startSignIn(method)` (replace any pending; spawn `auth login --claudeai|--console` without shell, cwd the tenant folder; first https URL after "visit:" within 15 s with host in {claude.com, claude.ai, console.anthropic.com, platform.claude.com}; 10-min expiry with a test seam); `submitSignInCode(code)` (1-512 chars, no control characters; write `code + "\n"`; wait ≤60 s; exit 0 → `readClaudeCodeAuth()`; else "Sign-in failed: {last non-empty output line with the code replaced by …}"; no URL in 15 s → "Sign-in could not be started."; nothing pending or expired → "This sign-in expired. Start again." (O1, exact strings)); `cancelSignIn()` (also called when the opt-in is saved as off, from src/server/settings-body.ts or the settings route, O5); `signOut()` (`auth logout`, then status); `pendingSignIn()`; registry `tenantScoped("__lhClaudeCodeLogins")`; kill every login child on process exit; no stdout, stdin, URL or code ever logged
- [X] T056 [P] [US2b] Create tests/fixtures/claude-code/fake-claude-auth.mjs: a `claude` stand-in for `auth status --json` (reads `$CLAUDE_CONFIG_DIR/fake-login.json`), `auth login --claudeai|--console` (prints the verified "visit:" line and prompt, reads one line, writes `fake-login.json` and exits 0 for code `good-code`, prints the T048 failure text and exits non-zero otherwise), `auth logout` (removes it), and `--version`
- [X] T057 [US2b] Create tests/claude-code-auth.test.ts with the fake: URL relayed only for allowed hosts; code reaches stdin; two starts keep one pending login; expiry after the seam's timeout; cancel kills the child; wrong code → failure message without the code; sign-out → signed out; status drops `configDirectory`/`projectsDirectory`; tenant A's actions never touch tenant B; captured `console.*` output contains no code and no fake token
- [X] T058 [US2b] (O1, O5) Create `claudeCodeAuthResponse(request)` in src/server/claude-code-auth.ts per contracts/http.md (hosted only, same-origin rule, actions start/code/cancel/sign-out; opt-in required for GET status, start and code; sign-out and cancel allowed while off; status codes and the owner-approved messages exactly as listed); export from src/server/index.ts; create app/api/claude-code/auth/route.ts with `GET`/`POST = withTenant(claudeCodeAuthResponse)`, `runtime = "nodejs"`, `dynamic = "force-dynamic"`; add tests/claude-code-auth-http.test.ts (404 locally, 403 cross-site/foreign Origin/missing header/POST without Origin, 403 GET status/start/code while disabled with no CLI spawned, sign-out allowed while disabled, saving the opt-in off cancels a pending sign-in, 409 "This sign-in expired. Start again.", 400 unknown action)
- [X] T059 [US2b] Hosted admission: in src/server/chat-handler.ts await `refreshClaudeCodeAuth()` before the admission check (line 237) when hosted, the provider is `claude-code` and the opt-in is on (no `auth status` while off, SC-003); create tests/claude-code-hosted-admission.test.ts: tenant B signed out → refused with "Sign in to Claude Code in Settings → Providers.", nothing persisted, no model process; tenant A signed in → turn runs with A's folder; a fake model run ending in `authentication_failed` flips A's cache to signed out; background jobs for a signed-out tenant refuse; with the opt-in off no `auth status` child is spawned
- [X] T060 [US2b] (O4) Log the number of live Claude Code processes per tenant (count only, no ids) when a hosted model process spawns, in src/agent/claude-code/stream.ts via the env seam; no cap (O4)

**Checkpoint**: hosted server side complete and tested with the fake CLI.

---

## Phase 7: User Story 2b - Hosted sign-in UI (P2)

**Goal**: Sign in / Sign out in Settings for the current user, per contracts/settings-ui.md.

**Independent test**: intercepted `/api/claude-code/auth` responses drive every state of the row and dialog.

- [X] T061 [US2b] (O1) Create components/settings/claude-code-sign-in.tsx with the shadcn skill: `ClaudeCodeSignIn` row (`ConnectionRow`, status words, Sign in outline / Sign out ghost via `actionVariant`), fetching `GET /api/claude-code/auth` with the `x-learnharness-claude-code: 1` header on mount, after sign-in and sign-out; copy exactly as plan.md O1
- [X] T062 [US2b] (O1) Add the sign-in dialog to the same file through the fork's lazy `ConnectionDialog` and `ConnectionFooter`: method radiogroup (step 1), Anthropic link + `.nb-set-input` code field + "Sign in" pill (step 2), busy state, failure line with Start again, expiry message, cancel on close (POST `cancel`), focus return to the opener, code cleared on close
- [X] T063 [US2b] (O2) In components/settings/claude-code-status.tsx render `ClaudeCodeSignIn` and the hosted guidance variant (plan.md O2 copy) when `useSettingsDialog().hosted` is true and the switch is on; local rendering unchanged
- [X] T064 [US2b] (O1, O2, O6) Add tests/claude-code-sign-in-ui.test.tsx (linkedom, mocked fetch): signed-out → Sign in; full flow to signed in; wrong code shows the server message; Escape cancels and returns focus; 409 shows "This sign-in expired. Start again."; after sign-in and sign-out a `"claudeCode"` settings signal fires; hosted guidance text per O2; the local (non-hosted) Settings never renders the row
- [X] T065 [US2b] (O1, O2) Extend tests/e2e/study/claude-code-settings.spec.ts with a hosted-flag run (intercepted auth endpoints): signed-out user sees the three Claude Code models in the picker and a send shows the sign-in refusal (O6); keyboard-only sign-in, Escape order (dialog before modal), 44px targets with coarse pointer emulation, 320/390/1440 without overflow, hidden scrollbars in the dialog
- [X] T077 [US2b] (O6) In components/settings/claude-code-sign-in.tsx call the settings signal with `"claudeCode"` after a successful sign-in and sign-out (the existing notify used by claude-code-status.tsx saves), then re-read `GET /api/claude-code/auth`; confirm components/model-picker.tsx refetches on it (T036)

**Checkpoint**: US2b complete.

---

## Phase 8: Image and documentation

- [ ] T066 [US2b] Dockerfile runtime stage: `RUN npm install -g @anthropic-ai/claude-code@2.1.321 && npm cache clean --force` before `USER node`; add `DISABLE_AUTOUPDATER=1` to the runtime `ENV`; comment why (FR-019). Do not build or deploy unless the owner asks
- [ ] T067 [P] Port docs/claude-code.md (final upstream, 61 lines): fix links to the fork's paths, drop nothing of the setup text; add a "Hosted site" section (per-user sign-in through Settings, per-user folder 0700 under the user's data root, no operator credentials, credentials in data backups, CLI pinned to 2.1.321 with the auto-updater off)
- [ ] T068 [P] Update docs/hosting.md: the image's Claude Code CLI, where per-user CLI logins live, that backups contain them, and that deleting a user's data root signs them out on this server

---

## Phase 9: Polish and gates

- [ ] T069 Check every changed UI file (claude-code-status.tsx, claude-code-sign-in.tsx, keys-section.tsx, model-menu.tsx, stats-bar.tsx, connection-controls.tsx) with the `impeccable` and `web-design-guidelines` skills; fix findings or record owner-facing ones in progress.md
- [ ] T070 Manual UI walk at 320, 390 and 1440 px, light and dark, reduced motion on and off (quickstart §6); screenshots to `~/agent-runs/2026-11-11-claude-code/ui/`
- [ ] T071 `npm test`: all ported and new suites pass, no new failures against T001's record (SC-004)
- [ ] T072 `npm run lint` (boundaries: src/agent never imports src/store or src/server; components import only `@/src/core`) and `npm run typecheck`
- [ ] T073 `npm run build`; confirm `.next/standalone/node_modules/@modelcontextprotocol/sdk/package.json` exists and `scripts/build-server.mjs` checks still pass
- [ ] T074 Re-measure startup as in T003 (desktop, 390, server cold start); each within +5% of the baseline (SC-005); save `startup-after*.json` and the comparison in `~/agent-runs/2026-11-11-claude-code/`
- [ ] T075 Secret hygiene: grep the test run's captured output, `next start` logs from quickstart §4 and the repo diff for codes, `sk-ant-`, `.credentials.json` contents, `configDirectory` and absolute tenant paths; none may appear
- [ ] T076 Write the Report in specs/029-claude-code-provider/progress.md: what changed, how it was verified (tests, live local turn on the owner's signed-in CLI, hosted checks with the fake CLI, UI checks, perf numbers), pre-existing vs new failures, and "left for owner": Docker build and deploy on request; the real hosted-site check of SC-001 and sign-in (needs a deploy, not requested); a real valid sign-in and the Console `authMethod` value, unless T048 could read them without a new login

---

## Dependencies

- Phase 1 → Phase 2 → Phase 3 (MVP). T002 before T013/T019; T003 before any source change.
- Phase 4 and Phase 5 depend on Phase 3 and are independent of each other (T044 also unblocks a T019 case).
- Phase 6 depends on Phase 3 (T022 config, T028 chat handler) and T034 (same-origin helper reused); T048 before T053-T057. Phase 7 depends on Phase 6 and Phase 4 (T037, T038). Phase 8 can start after Phase 6.
- Phase 9 after everything. O1-O7 are answered (gate 2); no task waits on the owner. T077 after T061.

Story order: US1 → (US2 ∥ US3) → US2b server → US2b UI.

## Parallel examples

- Phase 2: T005, T006, T008, T012, T014, T018 together (different files); then T009-T011, T013, T015-T017 in order; then T019-T021.
- US1: T029 beside T028 once T022 exists; T030 and T031 after T026.
- US2/US3: T036, T037, T040, T043, T044 together.
- US2b: T050 and T056 beside T049/T051; T067 and T068 any time after T066's design is settled.

## Implementation strategy

1. MVP: Phases 1-3; stop and run quickstart §3 with the real CLI (T033).
2. Local completion: Phases 4-5, then the local half of Phase 9 (T069-T074 on the local UI).
3. Hosted: Phases 6-7; Phase 8; full Phase 9.
4. Commit per phase on main only when the owner asks; no deploy.
