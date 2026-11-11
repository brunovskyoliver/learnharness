# Research: Claude Code provider (feature 029)

Sources read: `git show upstream-tmp/main:` for every file under `src/agent/claude-code/`, `src/core/contracts/claude-code.ts`, `src/core/auth-env.ts`, `src/server/claude-code{,-config}.ts`, `app/api/claude-code/route.ts`, `components/settings/claude-code-status.tsx`, `docs/claude-code.md`, the 14 `tests/claude-code-*` suites and fixtures; `git diff eeaa1475 8883fe1f` for the touch points; `git show` of c0de3f96, 5093809e, c5a756d7, 17c94be3, 074ba7af, c9c8cead, 6196500e, 7bbeeb0d/87627bdc/512a59d0, 1a523dd5, c8af672c, 7ebaef7f, 6809a8e8, 87b04cc8, 86185a40/3bf8f341, f69fa354, 60db22a4, 792671eb, af80d602, f68bae23; this fork's `config.ts`, `src/server/{keys,chat-handler,model-catalog,pricing,settings-body,tenant-access,web-subscriptions,web-subscription-http}.ts`, `src/agent/{models,teacher-agent}.ts`, `src/agent/tools/send-to-user.ts`, `src/agent/mcp/client.ts`, `components/settings/{keys-section,model-menu,connection-controls,connection-dialog,subscription-connections,settings-index}.tsx|ts`, `components/{stats-bar,model-picker,settings-signal}.ts(x)`, `tests/{startup-module-graph,tenant-routes}.test.ts`, `eslint.config.*`, `Dockerfile`, `scripts/build-server.mjs`, `DESIGN.md` (Settings, Dialogs), `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`.

Facts verified on this VM (2026-11-11):

- `claude --version` → `2.1.321 (Claude Code)`, installed by the native installer (`~/.local/share/claude/versions/2.1.321`). `npm view @anthropic-ai/claude-code@2.1.321` exists: `bin: { claude: "bin/claude.exe" }`, a postinstall and per-platform optional packages (linux-x64, linux-arm64, musl variants).
- `CLAUDE_CONFIG_DIR=<empty dir> claude auth status --json` prints `{"loggedIn":false,"authMethod":"none","apiProvider":"firstParty","analyticsDisabled":false,"projectsDirectory":"<dir>/projects","configDirectory":"<dir>","loginExpiresAt":null}`, exits 1, in about 120 ms, and creates `.claude.json`, `.claude.json.lock/` and `backups/` in the folder (mode 0600/0700 for the file and folder).
- `claude auth login --claudeai|--console` (also `--email`, `--sso`) with piped stdin prints "If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?…redirect_uri=https://platform.claude.com/oauth/code/callback…", then "Paste code here if prompted >" and reads one stdin line. Credentials land in `$CLAUDE_CONFIG_DIR/.credentials.json`. `claude auth logout` takes no options.
- `@modelcontextprotocol/sdk` is not in node_modules. `@earendil-works/pi-mcp` 1.4.0 depends only on `cross-spawn` and is a client.
- pi-ai 1.4.0 exports `./utils/*` and `./api/*`, so upstream's `utils/transcript`, `utils/json-parse` and `api/anthropic-messages` imports resolve.
- The fork already has `src/agent/tools/send-to-user.ts` (87b04cc8) gated on `model.id.includes("claude")`; Claude Code ids are `opus`/`sonnet`/`haiku`, so without upstream's provider condition they would never get the tool.
- `tests/tenant-routes.test.ts` fails for any `export async function GET` in `app/**/route.ts`.

## R1. Port shape: final upstream files, re-applied hunks

- **Decision**: Copy the final `upstream-tmp/main` versions of the 15 Claude Code source files, the doc, the 14 test suites and the 4 fixtures. Re-apply the touch-point hunks by hand to the fork's current files (plan.md table). Do not cherry-pick or merge.
- **Rationale**: owner decision before specify (feature only); 8883fe1f's touch-point hunks are small (≤35 lines per file) but the files diverged by hundreds of commits.
- **Alternatives**: cherry-pick the 15 commits (conflicts in most touch points, drags unrelated changes such as the narration guard; rejected).

## R2. MCP SDK on demand

- **Decision**: `tool-bridge.ts` keeps type-only imports from the SDK at the top and loads values inside `createToolBridge` through one memoized `loadMcpSdk()` (`Promise.all` of `server/index.js`, `server/streamableHttp.js`, `types.js`); `createMcpServer` and `createHttpServer` receive the loaded classes. `stream.ts`, `models.ts` and the server barrel import nothing from the SDK. Tests that use the SDK client (`claude-code-tool-bridge.test.ts`, `fake-claude.mjs`) import it statically, which is fine for tests.
- **Rationale**: FR-013 and constitution VIII. Upstream imports the SDK statically in `tool-bridge.ts`, and `models.ts` → `stream.ts` → `tool-bridge.ts`, so every server route that builds an engine would load it. `createToolBridge` is already async, so the change is local and keeps upstream's tests valid.
- **Alternatives**: lazy-import `stream.ts` from `models.ts` with a forwarding stream function (more code, needs an event-stream relay; rejected); `pi-mcp` (client only, no server; rejected).
- **Verification**: a new `tests/server-startup-graph.test.ts` bundles `src/agent/models.ts` and `src/server/index.ts` with esbuild (`platform: "node"`, packages external except the SDK path marker) and asserts `@modelcontextprotocol/sdk` appears only behind `dynamic-import` edges; the existing browser test gains `components/settings/claude-code-status.tsx` reachability checks (no SDK, no `src/agent`).

## R3. Opt-in, availability and refusals

- **Decision**: Upstream semantics: `claudeCode.enabled === true` in the settings record; available = enabled and a discoverable binary; admission only, running turns continue when switched off; saved model pins untouched. In hosted mode the settings record is the tenant's (`settingsFile()` is tenant-rooted), so the opt-in is per user. Refusals use `providerKeyMissing(provider, slots, claudeCodeRefusalText())`: "Claude Code is unavailable. Enable and set it up in Settings → Providers." or, hosted, enabled and installed but signed out, "Sign in to Claude Code in Settings → Providers.". `isProviderKeyRefusal` recognizes both, so the UI treats them as setup refusals, not scary errors.
- **Rationale**: FR-002, FR-017, constitution IV; one envelope code (`PROVIDER_KEY_MISSING_CODE`) keeps the fork's existing refusal UI.
- **Alternatives**: a new refusal code (needs UI changes across composer, notebook and jobs; rejected).

## R4. Admission seams in the fork

- **Decision**: `providerKeyPresent("claude-code")` → `claudeCodeAvailable()` (listing) and `claudeCodeAdmissible()` (sends; hosted also requires sign-in, per O6) cover every fork caller (chat handler, notebook, cards, library references, the job runner's `providerKeyMissing` callback). Background starts (`connectionBackgroundAllowed`) go through a wrapper that also requires `providerKeyPresent` for Claude Code, used in chat-handler (upstream) and in the fork-only callers `jobs.ts` and `session-titles.ts`.
- **Rationale**: the fork has more background admission points than upstream (session titles, notebook, cards); without the wrapper a title job could start a CLI while the opt-in is off (SC-003).

## R5. Live processes per tenant

- **Decision**: `live-processes.ts` stores its `Map<LiveProcess, Timeout>` in `tenantScoped("__lhClaudeCodeLiveProcesses", () => new Map())` (agent code may import `config.ts`, as `src/agent/mcp/client.ts` does). Lookups need a matching tenant, owner symbol, session id and tool-call ids. Idle timers run in the tenant's async context (AsyncLocalStorage follows timers).
- **Rationale**: constitution VII ("every in-memory registry is tenant-scoped"). Upstream's process-global map would let one tenant's lookup find, and on a mismatch kill, another tenant's held process if ids ever collided.

## R6. CLI environment (local and hosted)

- **Decision**: new `src/agent/claude-code/env.ts` with `configureClaudeCodeEnv(source)` / `claudeCodeEnv(kind)` (the `configureProviderEnv` pattern; server registers the source in `claude-code-config.ts`). Local (`!hostedMode()`): upstream exactly, `externalCliEnv()` plus `MCP_TOOL_TIMEOUT` and `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` = 1800000 and `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`. Hosted: an allowlist built from `process.env` — `PATH`, `LANG`, `LANGUAGE`, `LC_*`, `TZ`, `TMPDIR`, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `SSL_CERT_DIR`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` (and lower-case forms) — then `HOME` and `CLAUDE_CONFIG_DIR` = `ensureClaudeCodeHome()`, `DISABLE_AUTOUPDATER=1`, the two MCP timeouts and `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`. The same env serves `--version`, `auth *` and model processes. A hosted call outside a tenant throws (`PATHS.claudeCode` fails closed).
- **Rationale**: FR-012, FR-016 name a denylist "e.g." of variables; an allowlist is the fail-closed form of the same rule and also drops Bedrock/Vertex/Foundry switches, `AWS_*`, `GOOGLE_*`, `ANTHROPIC_*`, `CLAUDE_CODE_*` tokens and any future routing variable. Reuse configuration includes the env (upstream), so a process can never be reused across tenants or after the env changes.
- **Alternatives**: denylist (`ANTHROPIC_*`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_USE_*`, …; misses new variables; rejected).

## R7. Instruction isolation

- **Decision**: upstream 7ebaef7f + 6809a8e8 as-is: `--setting-sources user`, inline `--settings {"disableAllHooks":true,"outputStyle":"default","env":{"CLAUDE_CODE_DISABLE_CLAUDE_MDS":"1"}}`, the env switch, `--tools ""`, `--strict-mcp-config`, `--disable-slash-commands`, `--no-session-persistence`, `--permission-prompts none`. Hosted "user" settings are the tenant's own folder.

## R8. Hosted signed-in state at admission

- **Decision**: per-tenant cache (`tenantScoped("__lhClaudeCodeAuth")`) of `{ loggedIn, method, expiresAt, checkedAt }`, written by every `claude auth status --json` run (Settings GET, after sign-in and sign-out) and by the stream's `authentication_failed` (`onNotSignedIn` seam → `loggedIn: false`). The async chat admission (`handleChatRequest`, before the check at chat-handler.ts:237) calls `refreshClaudeCodeAuth()` when the provider is Claude Code and the cache is missing or older than 60 s. Sync admissions (jobs, titles, notebook, cards) read the cache; a missing cache counts as signed out. An expired `loginExpiresAt` counts as signed out. Local mode never checks authentication (upstream rule).
- **Rationale**: FR-017 asks turns to refuse when signed out, which must happen before write-ahead (constitution III). `auth status` costs about 120 ms, acceptable once per minute per tenant on the async path; the fork's sync callers cannot await.
- **Alternatives**: stat `.credentials.json` (FR-015: LearnHarness never reads the credential file; a stat also misses expiry; rejected); run `auth status` synchronously (blocks the event loop for every tenant; rejected).

## R9. Hosted sign-in relay

- **Decision**: `src/server/claude-code-auth.ts`. Start: kill any pending login for this tenant, spawn `claude auth login --claudeai|--console` (no shell, the hosted env plus `BROWSER` set to a no-op, cwd the tenant's CLI folder, stdio pipe), read stdout until a line matches `/visit:\s*(https:\/\/\S+)/`, accept the URL only if its host is `claude.com`, `claude.ai`, `console.anthropic.com` or `platform.claude.com` and the scheme is https; otherwise kill and answer "Sign-in could not be started". Timeout for the URL: 15 s. Pending login expires 10 min after start (kill). Code: a single line, 1-512 characters, no control characters; written as `code + "\n"` to stdin; wait up to 60 s for exit; exit 0 → run `auth status`, return it; non-zero → the last non-empty output line, with the submitted code replaced by "…", shown as the failure; the pending login ends either way. Cancel: kill. Sign out: `claude auth logout`, then status. Every child is killed on server exit.
- **Rationale**: FR-014, FR-017; the verified CLI behavior above. Nothing of stdin, stdout or the URL is logged; errors log only the exit code.
- **To verify (T048 spike, outside the repo)**: what 2.1.321 prints for a wrong or expired code and its exit code; whether `--console` prints the same "visit:" line; whether `BROWSER` suppresses the launch on Linux. Results go under Decisions in progress.md; if the URL line differs, the parser takes the first https URL on stdout with an allowed host.

## R10. No server-side browser

- **Decision**: login children get `BROWSER` pointing at a no-op (`/bin/true` on POSIX). The container has no `xdg-open`, so this matters for hosted testing on a dev machine.

## R11. Secrets handling

- **Decision**: codes travel only in the POST body and the CLI's stdin; tokens only between the CLI and its folder. LearnHarness never reads `.credentials.json`, never returns `configDirectory`/`projectsDirectory` (status responses carry only `loggedIn`, `method`, `expiresAt`), never logs request bodies, CLI stdout or the URL. Upstream's stderr logging on close stays for model processes (it can contain CLI diagnostics, upstream docs say so) and is disabled for login/status/logout children.

## R12. Settings UI in the fork's paper system

- **Decision**: port `ClaudeCodeInstallationStatus` with the fork's classes: row label `nb-set-row-label`, hint text 12.5 faint (the fork's `SettingsRow` hint class), errors `text-error`/`--text-red` as the fork's settings failures do, Check again an outline `Button size="xs"` with `pointer-coarse:min-h-11`; drop the "Verify AI claims…" paragraph. Hosted: `ClaudeCodeSignIn` uses `ConnectionRow` (Sign in outline / Sign out ghost via `actionVariant`) and the lazy `ConnectionDialog` with `ConnectionFooter`, a method choice (two radio-style option rows) and the code field `.nb-set-input` (`autoComplete="off"`, `type="text"`, `spellCheck={false}`). Copy: owner answers O1/O2 (plan.md, gate 2).
- **Rationale**: constitution VI (existing components only), DESIGN.md Settings and Dialogs.

## R13. Docker image

- **Decision**: runtime stage, after the apt layer and before `USER node`: `RUN npm install -g @anthropic-ai/claude-code@2.1.321 && npm cache clean --force`; add `DISABLE_AUTOUPDATER=1` to the runtime `ENV`. The binary lands at `/usr/local/bin/claude`, which `binary.ts` already searches. Building and deploying stay out of scope (FR-019).
- **Alternatives**: the native installer script piped from the network (unpinned unless given a version, needs curl; rejected).

## R14. Tests and verification

- **Decision**: port the 14 upstream suites with these adaptations: `SETTINGS_FILE` → `settingsFile()`; `useModelCatalog` from `components/model-picker.tsx`; drop the `InteractionLayersProvider` wrapper and `interaction-layer-render.tsx` (render with `renderToStaticMarkup`/`createRoot` directly); DOM queries follow the fork's settings markup; remove the assertion for the "Verify AI claims" line and assert its absence; the status-HTTP tests call the handler function (unchanged) and a new test checks the route export is `withTenant`-wrapped (covered by tenant-routes). New suites: `claude-code-hosted-env.test.ts` (allowlist, no operator credentials, per-tenant `HOME`/`CLAUDE_CONFIG_DIR`, 0700, outside-tenant throws, live-process registry per tenant), `claude-code-auth.test.ts` (fake CLI `fake-claude-auth.mjs` mimicking `auth login/status/logout`: URL relay, host allowlist, code to stdin, one pending per tenant, 10-min expiry with a test seam, cancel, wrong code, sign-out, no code or token in responses or captured `console.*`), `claude-code-auth-http.test.ts` (same-origin rules, hosted-only, enabled rule), `claude-code-hosted-admission.test.ts` (signed-out tenant refuses with the sign-in sentence and starts no model process; tenant A signed in, tenant B refused), `server-startup-graph.test.ts` (R2). Browser: `tests/e2e/study/claude-code-settings.spec.ts` with intercepted `/api/claude-code*` responses.
- **Rationale**: SC-002, SC-003, SC-004; constitution "tests run without model requests".
