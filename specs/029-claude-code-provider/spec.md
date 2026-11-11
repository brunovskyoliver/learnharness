# Feature Specification: Claude Code provider (port from upstream)

**Feature Branch**: `main` (no feature branch; owner works on main)

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Port upstream LearnHarness (github.com/amosblomqvist/learnharness) 'Claude Code' native provider into this fork, feature only — no other upstream changes. It lets the user select Claude Code models, which LearnHarness runs by spawning the locally installed, already-authenticated `claude` CLI (subscription login or CLI-configured API key; Claude Code owns auth and billing; LearnHarness-stored API keys are excluded from the CLI env). Source: upstream merge 8883fe1f plus later claude-code fixes (c0de3f96, 5093809e, c5a756d7, 17c94be3, 074ba7af, c9c8cead, 6196500e, 7bbeeb0d/87627bdc, 7ebaef7f, 6809a8e8, 87b04cc8/86185a40/3bf8f341)."

Owner decision before specify (2026-11-11): port the feature only, not a merge of upstream (upstream and this fork diverged 394/346 commits; a merge conflicts in 42–158 files).

## Clarifications

### Session 2026-11-11

- Q: Hosted mode? → A: Available on the hosted site, each user with their own Claude subscription (owner's answer "B but allow everyone to have separate sub"). Anthropic's terms (code.claude.com/docs/en/legal-and-compliance) require each user to sign in through the unmodified CLI's own flow, with no LearnHarness storage of tokens, so token paste (`setup-token`) is ruled out.
- Q: How do hosted users sign in? → A: CLI login, relayed: `claude auth login` per user in a private config folder; LearnHarness shows Anthropic's link and pipes the pasted code to the CLI.
- Q: Commercial Terms? → A: Owner accepts Anthropic's Commercial Terms for learn.brunovsky.online.
- Q: CLI version in the image? → A: Pinned in the Dockerfile, auto-updater off.
- Q: Where do per-user credentials live? → A: `<tenant data root>/claude-code/` (0700); included in data backups; removed with the user's data.
- Q: Sign-in controls locally? → A: Hosted only; local keeps upstream behavior.
- Q: Settings copy? → A: Upstream copy without the "Verify AI claims independently…" line.
- Gate 2 (2026-11-11, progress.md Decisions O1–O7): hosted sign-in copy and errors as in contracts; hosted Settings guidance per O2; Claude Code models get `send_to_user` (provider condition only); no per-tenant process cap, live CLI process count logged; while the opt-in is off no auth status or sign-in runs, sign-out stays allowed; signed-out hosted users still see Claude Code models and sending refuses with the sign-in sentence; `@modelcontextprotocol/sdk` 1.32.1 approved.
- Derived from the terms (no choice): sign-in offers both built-in CLI methods (subscription and Console/API); no operator credentials reach tenant CLI processes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Learn with a Claude Code model (Priority: P1)

The owner has Claude Code installed and signed in (Claude subscription or a CLI-configured API key) on the machine that runs LearnHarness. They enable Claude Code in Settings, pick Claude Opus, Sonnet or Haiku in the model picker, and run lessons, questions, practice and background jobs exactly as with any other model. The turn runs through their own Claude Code login; LearnHarness never asks for an Anthropic key.

**Why this priority**: This is the feature: using an existing Claude login instead of a pay-per-token API key.

**Independent Test**: With a synthetic CLI (test fixture) or the real CLI, enable the opt-in, select `Claude Sonnet`, send a message, and see a streamed reply, tool calls (questions, visuals, graph tools) and a finished turn.

**Acceptance Scenarios**:

1. **Given** the CLI is installed, meets the minimum version and Claude Code is enabled, **When** the owner selects a Claude Code model and sends a message, **Then** the reply streams, LearnHarness tools run through LearnHarness (not CLI built-in tools), and the turn finishes normally.
2. **Given** a Claude Code turn asks the learner a question, **When** the learner answers within 10 minutes, **Then** the same CLI process continues the turn; after longer idle or a restart, the next call starts a fresh process and replays the saved history.
3. **Given** a Claude Code turn is running, **When** the learner stops it, **Then** the CLI process ends and temporary files are removed.
4. **Given** LearnHarness has a saved Anthropic API key, **When** a Claude Code turn runs, **Then** that saved key is not passed to the CLI; the CLI's own login decides billing.

---

### User Story 2 - Opt in and check installation (Priority: P2)

In Settings → Providers the owner sees a Claude Code toggle, off by default. When on, Settings shows installation status (not found / version unchecked / update required / meets minimum), a "Check again" button and setup guidance. Turning it off hides Claude Code models from new requests without changing saved model choices or signing out the CLI.

**Why this priority**: Spawning a local program must be an explicit owner choice, and setup problems must be visible.

**Independent Test**: Toggle the setting with and without a fake CLI on the path and check the status text and model-picker contents.

**Acceptance Scenarios**:

1. **Given** a fresh install, **When** the owner opens Settings, **Then** Claude Code is off and no Claude Code models are offered.
2. **Given** the toggle is on and no CLI is found, **When** a turn would use a Claude Code model, **Then** it is refused with "Claude Code is unavailable. Enable and set it up in Settings → Providers." and nothing is sent.
3. **Given** an installed CLI older than 2.1.259, **When** the status is checked, **Then** Settings says an update is required and new turns refuse to start.

---

### User Story 2b - Sign in on the hosted site (Priority: P2)

A user of learn.brunovsky.online opens Settings → Providers → Claude Code, enables it, clicks **Sign in**, chooses Claude subscription or Anthropic Console, opens Anthropic's sign-in page, signs in there, copies the code Anthropic shows and pastes it into LearnHarness. Status turns to "Signed in". From then on their Claude Code turns use their own account. **Sign out** removes their login.

**Independent Test**: With a fake CLI that mimics `auth login/status/logout`, run the sign-in flow per tenant and check that each tenant's process gets its own config folder and that tokens never appear in responses or logs.

**Acceptance Scenarios**:

1. **Given** hosted mode and a signed-out user, **When** they sign in and paste a valid code, **Then** status shows signed in with method and their turns run under their login.
2. **Given** two users, **When** user A is signed in and user B is not, **Then** B's turns refuse with the sign-in message and never use A's or the operator's login.
3. **Given** a signed-in user, **When** they click Sign out, **Then** status shows signed out and their next turn refuses.

---

### User Story 3 - Honest usage and cost (Priority: P3)

Claude Code turns show token usage (including cache counts) and, when the CLI reports it, the effective context budget. Cost is shown as "CLI billing" or unpriced, never as $0.

**Why this priority**: Constitution IV; the owner must not think subscription use is free API use or vice versa.

**Independent Test**: Run a fake-CLI turn and check the stats bar and model menu.

**Acceptance Scenarios**:

1. **Given** a finished Claude Code turn, **When** the owner views usage, **Then** tokens are shown and cost reads unpriced, not $0.00.
2. **Given** the model menu, **When** it lists Claude Code models, **Then** the price column reads "CLI billing".

### Edge Cases

- CLI is signed out: the turn fails with a plain "not signed in" error, no retry loop.
- CLI emits a tool call with a bare (non-namespaced) tool name: the CLI rejects it and the turn recovers, as upstream 7bbeeb0d.
- The owner's own `~/.claude/CLAUDE.md`, output style and auto memory are kept out of LearnHarness turns.
- Teaching prose from Claude models is delivered through the learner-facing message path (send-to-user guard, upstream 87b04cc8/86185a40).
- Windows: `claude.exe` is preferred; `claude.cmd` alone does not qualify.
- Hosted mode (`LH_HOSTED=1`, the live learn.brunovsky.online deployment): per-user sign-in, see FR-012–FR-017.
- Two browser tabs start sign-in for the same user: the second replaces the first (one pending login per user).
- The pasted code is wrong or expired: the CLI's error is shown in plain words and the user can start again.
- A user's login expires: status shows signed out and turns refuse until they sign in again.
- Deleting a user's data removes their CLI folder and thus their Claude login on the server.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST offer a `claude-code` provider with models `opus`, `sonnet`, `haiku` (names Claude Opus/Sonnet/Haiku), run by spawning the installed `claude` CLI without a shell, in an empty temporary working directory.
- **FR-002**: The provider MUST be behind an app-wide opt-in setting, off by default; disabling it blocks new admissions but does not interrupt an admitted turn or rewrite saved model choices.
- **FR-003**: The system MUST locate the CLI on PATH and common install locations, check its version with `--version` only (5 s timeout), and refuse versions below 2.1.259 or unverifiable versions.
- **FR-004**: The CLI child environment MUST exclude credentials that LearnHarness's key store injected; credentials from the original launch environment and the CLI's native login remain.
- **FR-005**: LearnHarness MUST keep its own agent loop and tools: CLI built-in tools, hooks, slash commands, session persistence and permission prompts are disabled; LearnHarness tools are exposed through a token-protected loopback MCP bridge that only executes calls whose identity, name and arguments match the stream.
- **FR-006**: The child MUST run with `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` (environment and inline settings) and `outputStyle: default`.
- **FR-007**: Processes waiting on tool results (including learner questions) MAY be reused for the same owner/session with compatible configuration; idle processes expire after 10 minutes; the MCP timeout is 30 minutes. Otherwise a fresh process replays the saved transcript.
- **FR-008**: Abort MUST terminate the child, close the bridge and delete temporary directories.
- **FR-009**: Usage MUST report tokens from the CLI stream; cost is unpriced ("CLI billing"); the context budget comes from a best-effort CLI query or stays unknown.
- **FR-010**: Settings MUST show the toggle, installation status, "Check again" and setup guidance (upstream copy, without the "Verify AI claims independently…" line); the status endpoint accepts only same-origin requests with the LearnHarness header and only when enabled.
- **FR-011**: Port only Claude Code code and its required seams; no other upstream behavior changes. Adapt to this fork's current code where touch points differ.
- **FR-012**: In hosted mode (`LH_HOSTED=1`) Claude Code MUST be available per user, each user with their own Claude login: every CLI process for a tenant runs with that tenant's private CLI config folder (`CLAUDE_CONFIG_DIR`, and `HOME`) at `<tenant data root>/claude-code/` (mode 0700). A tenant's process never sees another tenant's folder or the operator's login.
- **FR-013**: The new runtime dependency `@modelcontextprotocol/sdk` 1.32.1 MUST load only when a Claude Code turn runs, not in the app startup graph (constitution VII/VIII).
- **FR-014**: In hosted mode, Settings → Claude Code MUST offer **Sign in** and **Sign out** for the current user. Sign in runs the unmodified CLI's own `claude auth login` in the user's folder, offering both CLI methods: Claude subscription (`--claudeai`) and Anthropic Console / API billing (`--console`). LearnHarness shows Anthropic's sign-in link (opens in a new tab) and a field where the user pastes the code Anthropic displays; the code is written to the CLI's stdin and never logged or persisted by LearnHarness. The CLI itself writes the credentials. Sign out runs `claude auth logout`.
- **FR-015**: In hosted mode, sign-in status MUST come from `claude auth status --json` in the user's folder (signed in / signed out, method, expiry), shown in Settings. LearnHarness never reads, copies or returns the credential file or token.
- **FR-016**: In hosted mode, the CLI child environment MUST contain no Anthropic credentials or routing from the server environment (e.g. `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_BASE_URL`, Bedrock/Vertex/Foundry switches), so usage is always billed to the signed-in user, never the operator.
- **FR-017**: A pending sign-in process MUST be per user, at most one at a time, and end after 10 minutes, on cancel, on success/failure, or when the user turns the opt-in off. Turns refuse with "Sign in to Claude Code in Settings → Providers." when the user is signed out; signed-out users still see Claude Code models in the picker (enabled + installed is enough for listing). While the opt-in is off, auth status and sign-in are refused; sign-out stays allowed.
- **FR-018**: Locally (not hosted), behavior is upstream's: the CLI uses the OS user's existing login; Settings shows installation status only, no sign-in controls.
- **FR-019**: The Docker image MUST install the unmodified Claude Code CLI at a pinned version (2.1.321), with the CLI's auto-updater disabled in the container. Deploying is not part of this feature.

### Key Entities

- **Claude Code setting**: `claudeCode.enabled` boolean in user settings.
- **Installation status**: state (not-found, version-unchecked, update-required, meets-minimum), version, minimum version.
- **Live CLI process**: a held child bound to tenant, owner/session, configuration and history, with idle expiry.
- **Hosted auth status**: per user, from `claude auth status --json`: signed-in / signed-out / unchecked, method, expiry; cached in memory per tenant.
- **Pending sign-in**: per user, at most one: method, Anthropic URL, expiry (10 min); the pasted code is never stored.
- **Tenant CLI folder**: `<tenant data root>/claude-code/` (0700), written only by the CLI; removed with the user's data root.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With Claude Code enabled and signed in, a lesson turn with at least one tool call and one learner question completes end to end on a Claude Code model.
- **SC-002**: No saved LearnHarness API key appears in the CLI child environment (verified by test).
- **SC-003**: With the opt-in off (default), no Claude Code model is offered and no CLI process is started, except `claude auth logout` when a hosted user signs out (gate 2, O5).
- **SC-004**: All ported upstream Claude Code tests pass, adapted to this fork, and the existing suite has no new failures.
- **SC-005**: App startup and initial JavaScript do not regress by more than 5%.

## Assumptions

- Locally, the owner signs in to Claude Code in a terminal, outside LearnHarness. On the hosted site each user signs in through Settings.
- The operator (Oliver) has accepted Anthropic's Commercial Terms for hosting Claude Code and does not pay for, resell or intermediate users' Claude usage.
- Upstream's behavior and copy are adopted as-is unless they conflict with this fork's DESIGN.md or constitution; the settings UI is restyled to the fork's paper system where needed.
- The Docker image change is in scope (FR-019); building and deploying it is not, and needs the owner's explicit request.
- Backups of `~/learnharness/data` (`data-before-*.tgz`) will contain users' Claude credentials written by the CLI; owner accepted (gate 1).
- The upstream `docs/claude-code.md` is ported as documentation.
