# Contract: the `claude` CLI as LearnHarness runs it

Upstream's contract (src/agent/claude-code/stream.ts, launch.ts, installation.ts at `upstream-tmp/main`) plus the hosted environment and the auth subcommands. Minimum version 2.1.259; the image pins 2.1.321.

## 1. Discovery and version

- Binary: first executable `claude` (POSIX) or `claude.exe` (Windows; `claude.cmd` never) on `PATH`, then `~/.local/bin`, `~/.claude/local`, the npm prefix bin, `/opt/homebrew/bin`, `/usr/local/bin`. Absolute, resolved against the server cwd. In hosted mode `PATH` and `os.homedir()` are the server's (the tenant `HOME` applies only to children).
- Version: `execFile(binary, ["--version"], { cwd: tmpdir(), env, timeout: 5000, killSignal: "SIGKILL", maxBuffer: 4096, windowsHide: true })`; stdout must match `^(\d+)\.(\d+)\.(\d+)(?: \(Claude Code\))?$`. Each fresh model process re-checks and refuses `update-required` and `version-unchecked` with upstream's `ClaudeLaunchError` messages.

## 2. Model process

argv (no shell, `stdio: "pipe"`, cwd = fresh `mkdtemp(tmpdir()/claude-code-cwd-)`):

```text
-p --input-format stream-json --output-format stream-json --verbose --include-partial-messages
--model <opus|sonnet|haiku> --effort <low|medium|high|xhigh|max>
--system-prompt-file <private>/system-prompt.md
--tools "" --strict-mcp-config --mcp-config <private>/mcp.json
--setting-sources user
--settings {"disableAllHooks":true,"outputStyle":"default","env":{"CLAUDE_CODE_DISABLE_CLAUDE_MDS":"1"}}
--disable-slash-commands --no-session-persistence --permission-prompts none
[--allowedTools mcp__learnharness__<tool>,…]
```

- `<private>` = `mkdtemp(tmpdir()/claude-code-private-)`, files mode 0600. Both temp dirs are removed on exit, failure, abort and idle expiry.
- `mcp.json`: one server `learnharness`, `type: "http"`, `url: http://127.0.0.1:<port>/mcp`, `Authorization: Bearer <32 random bytes, hex>`. The bridge accepts only that token, only calls carrying a unique `_meta["claudecode/toolUseId"]`, only declared tool names, and admits a call only when id, name and arguments equal the streamed intent.
- Effort: thinking level `minimal`/`low` → `low`, others same name; unset → `medium`. No thinking-off.
- stdin: optional control requests (`initialize`, then `get_context_usage` `detail: "summary"`), then one stream-JSON user line built from the replayed transcript (`[user]`, `[assistant]`, `[tool call …]`, `[tool result …]` labels, images kept).
- stdout: stream-JSON `stream_event` (message_start/delta/stop, content blocks: text, thinking, tool_use), `assistant` errors (`authentication_failed` → "not signed in"; hosted → also marks the tenant signed out), `result` errors, `user` tool results (a refusal of a pending harness call before MCP admission fails the turn), `control_response`.
- Bare tool names (no `mcp__learnharness__` prefix) that match a harness tool are skipped; the CLI rejects them and the model retries under the MCP name (7bbeeb0d). Any other non-MCP tool_use fails the turn.

## 3. Environment

Fixed in both modes: `MCP_TOOL_TIMEOUT=1800000`, `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=1800000`, `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` (override inherited values).

| Mode | Base | Added |
|---|---|---|
| Local / desktop | `externalCliEnv()`: `process.env` minus names the key store fill-gapped (`authEnvRecord().fillGap` not in `realEnv`). Launch-env credentials and the CLI's own login stay. | — |
| Hosted (`LH_HOSTED=1`) | Only `PATH`, `LANG`, `LANGUAGE`, `LC_*`, `TZ`, `TMPDIR`, `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `SSL_CERT_DIR`, `HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY` (and lower-case proxy forms) from `process.env` | `HOME` = `CLAUDE_CONFIG_DIR` = `<tenant root>/claude-code` (0700, created first), `DISABLE_AUTOUPDATER=1`; login children also `BROWSER` = a no-op |

Hosted guarantees (tested): no `ANTHROPIC_*`, `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_CODE_USE_BEDROCK`/`_VERTEX`/`_FOUNDRY`, `AWS_*`, `GOOGLE_*`, `CLOUD_ML_REGION` or any LearnHarness key reaches the child, whatever the server env holds; two tenants never share `HOME`/`CLAUDE_CONFIG_DIR`; spawning outside a tenant throws.

## 4. Hosted auth subcommands

All: no shell, hosted env (§3), cwd = the tenant CLI folder, stdout/stderr never logged.

| Command | Use | Output read | Timeout |
|---|---|---|---|
| `claude auth status --json` | status | JSON: `loggedIn` (bool), `authMethod` (string), `loginExpiresAt` (ISO string or null); exit 1 when signed out is normal | 5 s |
| `claude auth login --claudeai` / `--console` | sign-in | first https URL after "visit:" on stdout (allowed hosts only); then waits for one stdin line | URL 15 s; whole login 10 min |
| (stdin) `<code>\n` | finish sign-in | exit code; on failure the last non-empty output line, code redacted | 60 s |
| `claude auth logout` | sign-out | exit code | 10 s |

`--email` and `--sso` are not used.
