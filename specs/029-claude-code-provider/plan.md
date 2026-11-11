# Implementation Plan: Claude Code provider (port from upstream)

**Branch**: `main` (owner works on main; `setup-plan.sh` reports `029-claude-code-provider`, no branch was created) | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/029-claude-code-provider/spec.md` (gate 1 answered 2026-11-11, Clarifications)

## Summary

Port upstream LearnHarness's native "Claude Code" provider (final versions at `upstream-tmp/main`, feature brought in by merge 8883fe1f plus the listed fixes) into this fork, feature only. LearnHarness spawns the installed `claude` CLI without a shell, keeps its own agent loop and tools, and exposes those tools to the CLI through a token-protected loopback MCP bridge; the CLI owns authentication and billing. The opt-in is off by default, Settings → Providers → External CLI shows installation status, and usage shows tokens with "CLI billing" instead of a price.

On top of upstream, hosted mode (`LH_HOSTED=1`) gets per-user Claude Code: every tenant CLI process runs with `HOME` and `CLAUDE_CONFIG_DIR` at `<tenant data root>/claude-code/` (0700) and an allowlisted environment with no operator Anthropic credentials or routing; Settings relays the unmodified `claude auth login --claudeai|--console` flow (Anthropic's link out, the pasted code piped to the CLI's stdin, never logged or stored); status comes from `claude auth status --json`; sign-out runs `claude auth logout`. The Docker image installs `@anthropic-ai/claude-code@2.1.321` with the auto-updater off.

Two deliberate deviations from upstream code: the MCP SDK is imported inside `createToolBridge` (dynamic import, so it never enters the server's or browser's startup graph, FR-013), and the live-process registry is tenant-scoped (constitution VII). Everything else is upstream's final code, adapted to this fork's diverged touch points (table below).

## Technical Context

**Language/Version**: TypeScript 5, Node 26 (Docker image `node:26-bookworm-slim`), React 19.2, Next.js 16.3 App Router (route handlers per `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`; every route export goes through `withTenant`, tests/tenant-routes.test.ts)

**Primary Dependencies**: `@earendil-works/pi-ai` / `pi-agent-core` 1.4.0 (same as upstream; `utils/transcript`, `utils/json-parse`, `api/anthropic-messages` subpaths exist), new `@modelcontextprotocol/sdk` 1.32.1 (exact pin, as upstream; new runtime dependency approved by the owner at gate 2, O7; not present in node_modules today: `@earendil-works/pi-mcp` is a standalone client with only `cross-spawn` as a dependency and no server, so it cannot replace the SDK's `Server` + `StreamableHTTPServerTransport`). External: the `claude` CLI ≥ 2.1.259 (2.1.321 installed on this VM and pinned in the image).

**Storage**: `claudeCode.enabled` in the settings record (`settings.json`, per tenant in hosted mode because `settingsFile()` is tenant-rooted). Hosted CLI config folder `<data root>/users/<id>/claude-code/` written only by the CLI itself; LearnHarness creates the folder (store adapter) and deletes nothing in it except through `claude auth logout`. No new LearnHarness record format. Assistant records gain the optional app-only `cliContextWindow` number.

**Testing**: `npm test` (`tsx --test tests/*.test.ts tests/*.test.tsx`, fresh `LH_DATA_DIR`), `npm run lint`, `npm run typecheck`, `npm run build`, `tests/startup-module-graph.test.ts` (browser graph) plus a new server-graph check, Playwright for the Settings UI (`tests/e2e/study`), the startup-js benchmark. Upstream tests run against synthetic CLIs (`tests/fixtures/claude-code/fake-claude.mjs`, a real child process speaking stream-JSON and calling the bridge with the SDK client). No model requests.

**Target Platform**: Linux server (hosted Docker), local dev (Linux/macOS), Electron desktop (local behavior; Windows requires `claude.exe`).

**Project Type**: web app (Next.js) with an Electron shell and hosted multi-tenant mode.

**Performance Goals**: SC-005: initial JS on `/`, `/chat/new`, `/library` and app startup within +5% of the HEAD baseline (`fe682a3f`); the MCP SDK appears in no static import graph (browser or server); the Settings status component adds no chunk to startup routes.

**Constraints**: no shell spawn; 5 s `--version` probe; 10 min live-process idle expiry; 30 min MCP timeout; one pending sign-in per tenant, 10 min; codes and tokens never logged, persisted or returned; hosted CLI env is an allowlist; hidden scrollbars and DESIGN.md for every new surface.

**Scale/Scope**: 15 upstream source files, 14 upstream test files + 4 fixtures, 1 doc; about 20 fork touch points; hosted additions: 1 env seam, 1 auth module, 1 route, 1 store adapter, 1 UI component pair, Dockerfile.

## Constitution Check

*Gate before Phase 0; re-checked after Phase 1.*

| Principle | Status | Notes |
|---|---|---|
| I Owner decides | Pass | Gate 1 answered (spec Clarifications); gate 2 answered O1-O7 (progress.md Decisions, "Owner answers (gate 2)" below). Technical choices that the spec constrains are research R1-R14, logged under Decisions in progress.md at implementation. All user-facing copy in contracts is owner-approved. |
| II Teaching theory first | Pass | No change to lessons, checks, grading or the graph. Claude Code models get `send_to_user` like other Claude models (teacher-agent gate), so teaching prose reaches the transcript; question tools still go through LearnHarness's own tools, never CLI built-ins; answers are never sent to the client early (the bridge only relays LearnHarness tool results). |
| III Learner data is never lost | Pass | Admission refusals (opt-in off, CLI missing, signed out) happen before write-ahead, so nothing is persisted. The persisted transcript stays authoritative: a dead or expired CLI process means a fresh process with full replay. `cliContextWindow` is additive and stripped before the wire (`toLlmMessages`). Deleting a tenant's data root removes its CLI folder. |
| IV Honest states | Pass | Distinct refusals: "Claude Code is unavailable. Enable and set it up in Settings → Providers." and, hosted, "Sign in to Claude Code in Settings → Providers."; installation states not-found / version-unchecked / update-required / meets-minimum; cost unpriced and "CLI billing", never $0; context denominator only from a CLI report, otherwise usage-only; signed-in status from the CLI, never inferred from a file. |
| V Consent before cost | Pass | Opt-in is off by default; no CLI process starts while off (SC-003). No automatic sending; sign-in only on an explicit click; a failed turn is not replayed. BYOK: LearnHarness-stored keys are excluded from the CLI env (SC-002); hosted tenants never use the operator's credentials (FR-016). Codes and tokens are never logged, printed or returned. |
| VI Interface follows DESIGN.md | Pass | Settings rows reuse `SettingsGroup`, `Toggle`, `ConnectionRow`, `ConnectionDialog` (lifted dialog, focus trap, Escape innermost) and `.nb-set-input`; upstream's `text-xs text-muted-foreground` classes are restyled to the fork's paper tokens (hint 12.5 faint, `nb-set-row-label`). Unavailable rows are faint with locked controls. UI tasks are built with the `shadcn` skill and checked with `impeccable` and `web-design-guidelines` at 320/390/1440 (T065, T069-T070). |
| VII Boundaries, tenancy, sandboxing | Pass | Temp files: `stream.ts` keeps upstream's `mkdtemp(os.tmpdir())` cwd and private dirs (0700 dirs, 0600 files, removed on exit/abort/expiry), as `src/agent/subagents/{headless,runner}.ts` already do. They are per-process scratch, not tenant data: random names, never looked up by path, so no tenant can address another's; moving them under the tenant CLI folder would put LearnHarness writes and stale scratch into the CLI-owned, backed-up folder. Justification recorded here instead. `src/core` additions are pure (`contracts/claude-code.ts`, `auth-env.ts`). Agent code never imports server/store: the hosted env and folder come through a server-registered seam (`configureClaudeCodeEnv`, like `configureProviderEnv`); folder creation lives in `src/store/claude-code-home.ts`. Live processes, pending sign-ins and auth-status caches are `tenantScoped`; hosted calls without a tenant throw. The new route is `withTenant`-wrapped. The CLI runs with `--tools ""`, so it has no file access of its own; LearnHarness tools keep their confinement. Not an OS sandbox: tenants share one OS user (see Risks). |
| VIII Performance | Pass, measured | New runtime dependency `@modelcontextprotocol/sdk` 1.32.1 approved by the owner (gate 2, O7), with its startup cost measured (T003/T074). The SDK loads inside `createToolBridge` (first Claude Code turn only). Baseline at `fe682a3f` (T003) and after (T074); a server-graph test asserts no static path from `src/agent/models.ts` or `src/server/index.ts` to `@modelcontextprotocol/sdk` (T014). The Settings component is inside the already-lazy settings dialog. |

Post-design re-check: unchanged, all pass. No Complexity Tracking entries.

## Fork touch points (concrete changes)

Upstream final hunks for these files are the 8883fe1f merge diff (vs eeaa1475) plus 17c94be3, 074ba7af, c9c8cead, c5a756d7, 5093809e, c0de3f96. The fork diverged; each row says what to do in the fork's current file.

| File | Change in this fork |
|---|---|
| `package.json`, `package-lock.json` | Add `"@modelcontextprotocol/sdk": "1.32.1"` to dependencies (exact, upstream pin) via `npm install --save-exact`. No other dependency changes. |
| `config.ts` | Add `get claudeCode() { return path.join(dataRoot(), "claude-code"); }` to `PATHS` (hosted CLI home; local never uses it). |
| `src/core/contracts/claude-code.ts` (new) | Upstream file as-is; add hosted-only types `ClaudeCodeAuthStatus`, `ClaudeCodeSignInMethod`, `ClaudeCodePendingSignIn` (data-model.md). |
| `src/core/auth-env.ts` (new) | Upstream file as-is (`authEnvRecord`, `externalCliEnv`). |
| `src/core/index.ts` | After the `cost-summary` export (line 75) add `export { CLAUDE_CODE_PROVIDER, CLAUDE_CODE_MINIMUM_VERSION, type ClaudeCodeStatus, type ClaudeCodeAuthStatus, type ClaudeCodeSignInMethod, type ClaudeCodePendingSignIn } from "./contracts/claude-code.ts";`. `cliContextWindowOf` needs no barrel change (line 61 already re-exports `native-messages.ts`). |
| `src/core/contracts/models.ts` | `cost` becomes `{…} \| null`, `contextWindow` and `maxTokens` `number \| null`, with upstream's doc comments. |
| `src/core/native-messages.ts` | Import `CLAUDE_CODE_PROVIDER`. The fork's `LhMessage` (line 97) keeps its `references` user-message extension and gains `cliContextWindow?: number` in the trailing intersection; add upstream's `cliContextWindowOf`; in `toLlmMessages` (line 652) strip `cliContextWindow` alongside `id`. |
| `src/core/settings.ts` | Import `CLAUDE_CODE_PROVIDER`; add `CLAUDE_CODE_UNAVAILABLE` and the hosted `CLAUDE_CODE_SIGN_IN = "Sign in to Claude Code in Settings → Providers."`; `providerKeyMissing(provider, slots, error?)` uses `error ?? (claude-code ? UNAVAILABLE : "No … key is set …")`; `isProviderKeyRefusal` also matches both Claude Code sentences; `UserSettings.claudeCode?: { enabled?: boolean }` and upstream's sanitizer block next to the fork's other sections. |
| `src/server/keys.ts` | Replace the local `AuthBoot`/`BOOT_KEY`/`boot()` (lines 57-73) with `import { authEnvRecord as boot } from "../core/auth-env.ts";` (same `Symbol.for("lh.authBoot")`, so state is shared). In `providerKeyPresent` add, before the subscription branch, `if (provider === CLAUDE_CODE_PROVIDER) return claudeCodeAdmissible();` (locally identical to `claudeCodeAvailable()`). Keep the fork's hosted logic untouched (hosted never fill-gaps, so `externalCliEnv` is a no-op there; hosted uses the allowlist env instead). |
| `src/server/claude-code-config.ts` (new) | Upstream `claudeCodeEnabled`/`claudeCodeAvailable()` (enabled + binary, in both modes; the catalog uses it, so signed-out hosted users still see the models, O6); new `claudeCodeAdmissible()` = available and, when hosted, a cached signed-in status (R8), used by `providerKeyPresent`; `claudeCodeRefusalText()` returns the sign-in sentence when hosted, enabled, installed and signed out, else the unavailable sentence; registers `configureClaudeCodeEnv` (R6). |
| `src/server/claude-code.ts` (new) | Upstream file; route handlers stay pure functions taking `Request`. |
| `src/server/claude-code-auth.ts` (new, fork-only) | Hosted sign-in relay, status, sign-out (contracts/http.md, R9-R11). |
| `src/store/claude-code-home.ts` (new, fork-only) | `ensureClaudeCodeHome()`: `mkdirSync(PATHS.claudeCode, { recursive: true, mode: 0o700 })` + `chmodSync(…, 0o700)`; returns the path. The only LearnHarness write in that folder. |
| `src/server/index.ts` | After `sessionCost` (line 49) export `claudeCodeInstallationResponse` and the hosted `claudeCodeAuthResponse`. |
| `app/api/claude-code/route.ts` (new) | `export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const GET = withTenant(claudeCodeInstallationResponse);` (upstream used a bare `export async function GET`, which the fork's tenant-routes test rejects). |
| `app/api/claude-code/auth/route.ts` (new, fork-only) | `GET`/`POST = withTenant(claudeCodeAuthResponse)`. |
| `src/server/settings-body.ts` | Add upstream `parseClaudeCodeSettingsBody` and `claudeCode: parseClaudeCodeSettingsBody` to the fork's `SETTINGS_SECTIONS` (which has `notebook` and no `dictation`; keep both as they are). |
| `src/server/chat-handler.ts` | Rename the import at line 10 to `connectionBackgroundAllowed as subscriptionBackgroundAllowed` and add upstream's local `connectionBackgroundAllowed(provider)` wrapper (Claude Code also needs `providerKeyPresent`), used by the fork's call sites at lines 230, 233, 267, 643, 652. Before the admission check at line 237, when hosted, the provider is `claude-code` and the opt-in is on, `await refreshClaudeCodeAuth()` (R8). The refusal envelopes at lines 104, 129 and 237 pass `claudeCodeRefusalText()` for Claude Code. |
| `src/server/jobs.ts`, `src/server/session-titles.ts` | They call `connectionBackgroundAllowed` from subscription-connections directly (fork-only callers). Route them through the same wrapper (export it from `claude-code-config.ts` as `cliBackgroundAllowed` or move the wrapper there) so a disabled or signed-out Claude Code never starts background work. |
| `src/server/notebook.ts`, `card-generation.ts`, `library-references.ts` (all three) | Fork-only callers of `providerKeyPresent`/`providerKeyMissing`: no logic change (the new `providerKeyPresent` branch covers them); pass `claudeCodeRefusalText()` where they build a refusal for `claude-code`. |
| `src/server/model-catalog.ts` | Upstream hunks: `connectionModel` returns undefined for Claude Code when unavailable; `catalogProviders` adds `{ id: CLAUDE_CODE_PROVIDER, envVar: "", keyPresent: claudeCodeAvailable() }` beside chatgpt (line 144); `toModelDto` nulls cost/contextWindow/maxTokens for Claude Code (lines 165-172); `catalogContextLimits` skips Claude Code (line 187). The fork's extra lines 192-193 (ChatGPT, native subscriptions, codex-verify limits) stay. |
| `src/server/pricing.ts` | `catalogModel` (line 12) also returns undefined for the `claude-code` prefix (upstream 17c94be3); line 28's tier check is unaffected. |
| `src/agent/models.ts` | Import `createClaudeCodeProvider` and `streamClaudeCode`; in `piModels()` (line 65) after the builtin loop add `collection.setProvider(createClaudeCodeProvider(streamClaudeCode));`. Keep the fork's codex-verify import. The SDK is not reached statically (tool-bridge change). |
| `src/agent/teacher-agent.ts` | Line 205: `opts.tools === undefined && (engine.model.provider === CLAUDE_CODE_PROVIDER \|\| engine.model.id.toLowerCase().includes("claude"))` (the 8883fe1f hunk). The narration guard and upstream's `sendToUserApplies` kind restriction (86185a40) are not ported (owner, O3). `sessionId: opts.chatId` is already passed (needed for live-process reuse). |
| `src/agent/claude-code/*` (new) | Upstream final files. Changes: `tool-bridge.ts` loads the SDK with `await import()` inside `createToolBridge` (R2); `live-processes.ts` keeps its Map inside `tenantScoped("__lhClaudeCodeLiveProcesses", …)` (R5); `stream.ts` `toClaudeEnv()` and `installation.ts` `readClaudeVersion` take the env from the new `claudeCodeEnv()` seam in `src/agent/claude-code/env.ts` (R6); `stream.ts` maps `authentication_failed` through the seam's `onNotSignedIn` so hosted caches flip to signed out. |
| `components/settings-signal.ts` | Add `"claudeCode"` to `SettingsSection` (line 23). |
| `components/model-picker.tsx` | `catalogLimits` (line 69) skips null windows (074ba7af); the catalog refresh at line 47 also refetches on `section === "claudeCode"` (c9c8cead's change to upstream's `components/model-catalog.ts`, which lives here in the fork). |
| `components/settings/model-menu.tsx` | Import `CLAUDE_CODE_PROVIDER`. `priceLabel` returns "Unpriced" for null cost. In the fork's row (lines 144-149): for Claude Code show "CLI billing" (title "Billing is determined by your Claude Code configuration; LearnHarness does not estimate it.") in place of `priceLabel(m.cost) / 1M`; context cell shows "—" when `contextWindow === null`. Same for `ProviderMenuList` if it renders prices. |
| `components/stats-bar.tsx` | In the fork's `StatsBarDetails`: add `cliContextWindow` prop and upstream's exported `contextLimitForModel`; `limit` (line 92) uses it; `costLabel` (line 111) adds "CLI" to providers when any turn is Claude Code; in the expanded detail add "Window reported by Claude Code; may be lower for auto-compaction." when the selected model is Claude Code. The fork has no per-turn price list, so upstream's per-turn "CLI" cell has no target. |
| `components/chat.tsx` | Pass `cliContextWindow={cliContextWindowOf(nativeMessages)}` to both `StatsBar` call sites (lines 1878, 2668). `new-session.tsx` and `home.tsx` need nothing (no turns). |
| `components/settings/connection-controls.tsx` | Add upstream's optional `actionVariant` to the fork's `ConnectionRow` (keep the fork's `nb-set-row-label`, `ml-auto`, `pointer-coarse:min-h-11`, `text-faint hover:text-ink`). |
| `components/settings/keys-section.tsx` | After the Subscriptions group (line 441) add `<SettingsGroup label="External CLI" testid="group-external-cli"><ClaudeCodeInstallationStatus /></SettingsGroup>`. |
| `components/settings/claude-code-status.tsx` (new) | Upstream component, restyled to paper classes, the "Verify AI claims independently…" line removed (Clarifications); hosted mode adds `ClaudeCodeSignIn` (contracts/settings-ui.md). |
| `components/settings/claude-code-sign-in.tsx` (new, fork-only) | Hosted sign-in row and dialog, loaded through the fork's lazy `ConnectionDialog`; after sign-in and sign-out it notifies `"claudeCode"` on the settings signal so the model picker and status refresh. |
| `components/settings/settings-index.ts` | Add `{ section: "keys", row: "claude-code", label: "Claude Code", hint: "External CLI" }` so Settings search finds it. |
| `Dockerfile` | Runtime stage: `RUN npm install -g @anthropic-ai/claude-code@2.1.321 && npm cache clean --force` (before `USER node`), `ENV DISABLE_AUTOUPDATER=1`. |
| `docs/claude-code.md` (new), `docs/hosting.md` | Upstream final doc (61 lines, links adjusted to fork paths) plus a "Hosted" section; hosting.md gets the CLI, credentials-in-backups and sign-in notes. |
| Tests changed by upstream | `tests/model-catalog.test.ts`, `tests/pricing-native-parity.test.ts`, `tests/server-keys.test.ts`, `tests/settings-body.test.ts`, `tests/send-to-user.test.ts`, `tests/chatgpt-connection-ui.test.tsx`: apply upstream's Claude Code assertions to the fork's versions. |
| Not ported | `src/server/custom-providers.ts` (f69fa354): the fork has no custom providers. `src/agent/narration-guard.ts` (e6cbc3eb, 86185a40): Anthropic-API thinking-signature guard, not Claude Code (O3). `components/interaction-layers.tsx` (upstream-only test wrapper): the ported UI tests render without it. |

## Owner answers (gate 2)

Answered 2026-11-11 (progress.md Decisions); all recommendations accepted. Task markers (O1)-(O7) now point to these answers and block nothing.

- **O1. Hosted sign-in copy.** Row: label "Claude account"; status "Signed in · Claude subscription" / "Signed in · Anthropic Console" / "Signed out" / "Checking…" / "Sign-in status could not be checked"; actions "Sign in" (outline) / "Sign out" (ghost); expiry, when the CLI reports one: "until 12 Dec". Dialog title "Sign in to Claude Code"; step 1 "Claude subscription" (hint "Pro or Max plan") and "Anthropic Console" (hint "API usage billing"), Continue; step 2 "Open Anthropic's sign-in page, sign in, then paste the code it shows.", link "Open sign-in page ↗", field "Code", Cancel and the pill "Sign in". Errors: "Paste the code from Anthropic's page.", "Sign-in failed: {CLI message}", "This sign-in expired. Start again." (the single message for 409: none pending or expired), "Sign-in could not be started.", "Sign-out could not be completed.". Sign out has no confirmation.
- **O2. Hosted guidance.** Keep the toggle, installation line and Check again; replace the terminal paragraph with "Sign in with your own Claude account. Your usage is billed to that account."; keep "Claude Code controls billing. Requires v2.1.259+." without the Setup link.
- **O3. Teaching prose.** Port only the provider condition in teacher-agent (Claude Code models get `send_to_user` wherever other Claude models do, practice included); not the narration guard or `sendToUserApplies`.
- **O4. Process limits.** No cap; log the count of live CLI processes per tenant on spawn (T060).
- **O5. Opt-in off (hosted).** No auth status and no sign-in while off; sign-out stays allowed; turning the opt-in off cancels a pending sign-in. SC-003 amended accordingly.
- **O6. Signed-out hosted users.** They see Claude Code models (catalog = enabled + installed); sending refuses with "Sign in to Claude Code in Settings → Providers.".
- **O7. Dependency.** `@modelcontextprotocol/sdk` 1.32.1 approved as a runtime dependency (on-demand load; the startup check stays).

## Risks

- **Shared OS user (hosted)**: tenant CLI folders are isolated by environment and 0700 folders, not by OS user. The CLI runs with `--tools ""`, `--strict-mcp-config` and no shell, so the model cannot read other folders, but a CLI or plugin bug could. Recorded, not solved here.
- **Login relay depends on CLI output**: the sign-in URL is parsed from stdout ("If the browser didn't open, visit: …", verified with 2.1.321). A future CLI could change it; the image pins 2.1.321 and the parser fails closed with "Sign-in could not be started" (R9). How the CLI reports a wrong code is not verified yet (T048 spike).
- **Server-side browser launch**: `claude auth login` tries to open a browser on the server. In the container there is none; on a dev VM it would open one. Login children get `BROWSER=true`-style no-op (R10, verified in the spike).
- **Fork divergence**: `components/stats-bar.tsx` (StatsBarDetails, no per-turn price list), `components/settings/model-menu.tsx` (new row layout with "/ 1M"), `connection-controls.tsx` (paper classes), `chat-handler.ts` (extra fork callers, notebook mode), and settings sections (`notebook`, no `dictation`) differ substantially; upstream hunks are re-applied by hand, not cherry-picked. Upstream tests that render Settings or the stats bar need their DOM queries adjusted.
- **Upstream tests assume upstream helpers**: `SETTINGS_FILE` (fork: `settingsFile()`), `components/model-catalog.ts` `useModelCatalog` (fork: `components/model-picker.tsx`), `InteractionLayersProvider` and `tests/interaction-layer-render.tsx` (absent; render plainly). Everything else they import exists in the fork.
- **Standalone tracing**: the SDK is reached only through a dynamic import; Next's file tracing must still include it in `.next/standalone`. T073 checks the built standalone contains `node_modules/@modelcontextprotocol/sdk`.
- **Status cache staleness (hosted)**: admissions (not the catalog) read a cached signed-in status (R8); after a restart sync callers refuse until the first refresh (chat turn or Settings). A login revoked elsewhere is caught by the CLI's own `authentication_failed`, which flips the cache and fails the turn with the sign-in sentence.
- **Backups**: `data-before-*.tgz` will contain users' CLI credentials (accepted at gate 1).

## Project Structure

### Documentation (this feature)

```text
specs/029-claude-code-provider/
├── spec.md
├── plan.md                 # this file
├── research.md             # R1-R14
├── data-model.md           # setting, statuses, live process, pending sign-in, env
├── quickstart.md
├── contracts/
│   ├── cli.md              # argv, env (local and hosted), stdin/stdout, auth subcommands
│   ├── http.md             # /api/claude-code, /api/claude-code/auth, /api/settings/claudeCode
│   └── settings-ui.md      # External CLI group, hosted sign-in row and dialog
├── checklists/requirements.md
├── progress.md
└── tasks.md
```

### Source Code (repository root)

```text
config.ts                               # PATHS.claudeCode
app/api/claude-code/route.ts            # installation status (withTenant)
app/api/claude-code/auth/route.ts       # hosted sign-in relay (withTenant)
src/core/
├── contracts/claude-code.ts            # provider id, minimum, status + hosted auth types
├── auth-env.ts                         # key-store provenance, externalCliEnv
├── contracts/models.ts, native-messages.ts, settings.ts, index.ts
src/agent/
├── claude-code/{binary,cli-events,constants,context-window,installation,launch,live-processes,provider,reuse-context,stream,tool-bridge,transcript}.ts
├── claude-code/env.ts                  # fork-only env seam (local upstream env, hosted allowlist)
├── models.ts, teacher-agent.ts
src/server/
├── claude-code.ts, claude-code-config.ts
├── claude-code-auth.ts                 # fork-only hosted login relay
├── keys.ts, chat-handler.ts, jobs.ts, session-titles.ts, model-catalog.ts, pricing.ts, settings-body.ts, index.ts
src/store/claude-code-home.ts           # fork-only: create the tenant CLI folder 0700
components/
├── settings/claude-code-status.tsx, claude-code-sign-in.tsx
├── settings/{keys-section,model-menu,connection-controls,settings-index}.tsx|ts
├── settings-signal.ts, model-picker.tsx, stats-bar.tsx, chat.tsx
tests/
├── claude-code-*.test.ts(x)            # 14 upstream suites, adapted
├── claude-code-hosted-*.test.ts        # env isolation, tenant folders, auth relay, routes
├── server-startup-graph.test.ts        # SDK not in the static server graph
├── fixtures/claude-code/{fake-claude.mjs,text.jsonl,tool.jsonl,signed-out.jsonl,fake-claude-auth.mjs}
└── e2e/study/claude-code-settings.spec.ts
Dockerfile, docs/claude-code.md, docs/hosting.md
```

**Structure Decision**: upstream's layout (agent adapter under `src/agent/claude-code/`, pure contracts in `src/core`, admission and HTTP in `src/server`), with the fork-only hosted pieces beside them and the one filesystem write in a store adapter.

## Complexity Tracking

None.
