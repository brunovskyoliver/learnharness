# Quickstart: validating feature 029 (Claude Code provider)

Validation guide only. Interfaces: [contracts/cli.md](contracts/cli.md), [contracts/http.md](contracts/http.md), [contracts/settings-ui.md](contracts/settings-ui.md); state: [data-model.md](data-model.md); reasoning: [research.md](research.md). Evidence goes to `~/agent-runs/2026-11-11-claude-code/`.

## Prerequisites

- `npm ci` after the dependency task (`@modelcontextprotocol/sdk` 1.32.1 present in node_modules).
- `claude --version` ≥ 2.1.259 for the live checks (2.1.321 on this VM). Unit and harness tests need no CLI: they spawn `tests/fixtures/claude-code/fake-claude.mjs` and `fake-claude-auth.mjs`.
- Isolated data for anything manual: `LH_DATA_DIR=$(mktemp -d)`. Never point hosted checks at `~/learnharness/data`.
- Snap Chromium needs `TMPDIR` under `$HOME` for Playwright (playwright.config.ts handles it).

## 1. Unit and harness suites (no model requests)

```bash
npx tsx --test tests/claude-code-*.test.ts tests/claude-code-*.test.tsx tests/send-to-user.test.ts tests/model-catalog.test.ts tests/pricing-native-parity.test.ts tests/server-keys.test.ts tests/settings-body.test.ts tests/tenant-routes.test.ts tests/server-startup-graph.test.ts tests/startup-module-graph.test.ts
```

Expected: the 14 ported upstream suites pass (stream adapter, bridge admission, bare-name recovery, reuse within 10 min and fresh replay after, abort cleanup, `CLAUDE_CODE_DISABLE_CLAUDE_MDS` in env and inline settings, MCP timeouts 1800000, saved keys absent from the child env, opt-in default off, refusal wording, "CLI billing", unpriced cost, CLI context window); the hosted suites pass (allowlist env, per-tenant `HOME`/`CLAUDE_CONFIG_DIR` 0700, sign-in relay, one pending login per tenant, no code or token in any response or captured log, signed-out tenant refused before write-ahead); `@modelcontextprotocol/sdk` is reachable only through a dynamic import.

## 2. Gates

```bash
npm test && npm run lint && npm run typecheck && npm run build
```

Expected: no new failures against the pre-feature run recorded in progress.md (pre-existing failures listed separately). After `npm run build`, `.next/standalone/node_modules/@modelcontextprotocol/sdk/package.json` exists (tracing kept the lazy import).

## 3. Local end to end (real CLI, owner's own login)

1. `claude auth status` in a terminal shows signed in (subscription or API key).
2. `LH_DATA_DIR=$(mktemp -d) npm run dev`, open Settings → Providers. "External CLI" shows Claude Code off; the model picker lists no Claude Code models.
3. Switch it on: status reads "Version 2.1.321 · meets minimum"; no "Verify AI claims" line; Check again re-probes.
4. Set the strong slot to Claude Sonnet, start a lesson: the reply streams, a question tool asks you something, answer within 10 minutes (same `claude` process: `pgrep -fa "claude -p"` shows one PID throughout), the turn finishes. Stop a running turn: the process ends and `/tmp/claude-code-*` folders are gone.
5. Model menu shows "CLI billing" and "—"; the stats bar shows tokens, a context window reported by Claude Code, and no $ amount.
6. Switch Claude Code off: the next message refuses with "Claude Code is unavailable. Enable and set it up in Settings → Providers."; saved model choices are unchanged.
7. With a saved Anthropic key in Settings → Keys, run a turn and check `/proc/<pid>/environ` of the child (`tr '\0' '\n'`): no `ANTHROPIC_API_KEY` unless it was in the launch environment.

## 4. Hosted (fake and real CLI)

Automated (section 1) covers two tenants with the fake CLI. Manual, with real Clerk keys in a scratch data dir and `LH_HOSTED=1`:

1. User A: Settings → Providers → Claude Code on → Sign in → Claude subscription → Open sign-in page → sign in at Anthropic → paste the code → status "Signed in · Claude subscription". `ls -ld $LH_DATA_DIR/users/<A>/claude-code` shows `drwx------`.
2. User A runs a lesson turn on Claude Sonnet; the child's environ shows `HOME` and `CLAUDE_CONFIG_DIR` under user A's folder and no `ANTHROPIC_*` even when the server was started with `ANTHROPIC_API_KEY` set.
3. User B (signed out, opt-in on) sends a message: refused with "Sign in to Claude Code in Settings → Providers."; nothing saved in B's chat; no `claude -p` process started.
4. Paste a wrong code: the dialog shows "Sign-in failed: …" in plain words; Start again works. Open two tabs and start sign-in in both: the first tab's code is refused ("This sign-in expired. Start again.").
5. User A signs out: status "Signed out"; A's next turn refuses with the sign-in sentence.
6. Server logs (`docker logs` or the dev terminal) contain no code, no token, no `configDirectory`.

## 5. Docker image (build only on the owner's request)

`docker build .` succeeds; in the image `claude --version` prints `2.1.321 (Claude Code)` and `printenv DISABLE_AUTOUPDATER` prints `1`. Deploying is out of scope.

## 6. UI review (320, 390, 1440 px; light and dark)

Settings → Providers → External CLI and the sign-in dialog: keyboard only (Tab, arrows in the method choice, Enter submits, Escape closes the dialog before the modal, focus returns to Sign in), 44px targets on touch, no visible scrollbars, faint locked switch while loading. Run the `impeccable` and `web-design-guidelines` skills on the changed components and record findings in progress.md.

## 7. Performance

Startup JS for `/`, `/chat/new`, `/library` (desktop and 390px, `~/agent-runs/2026-11-07-unified-redesign/startup-js/startup-js.mjs`) within +5% of the `fe682a3f` baseline; server cold start (`next start`, first `/api/models` response) within +5%.
