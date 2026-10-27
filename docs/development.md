# Development guide

LearnHarness is a Next.js web app with an Electron desktop shell. Lessons use probe, plan and teach phases. Practice runs as a separate session kind. Both persist native agent messages in chat records and use the same session client and server turn lifecycle.

Start with [the UI review guide](ui-review.md), [current interface rules](../DESIGN.md), [product scope](../PRODUCT.md), and [architecture](architecture.md). Earlier product decisions and implementation waves remain in [vision](vision.md) and [plan](plan.md); those historical documents can describe superseded implementations.

## Commands

```sh
npm install
npm run dev           # http://localhost:3000
npm run dev:review    # seed missing UI examples, then start the usual dev server
npm run seed:review   # seed examples without starting a server
npm run dev:fresh     # separate empty-user setup instance, default port 3005
npm run build         # build demo runtime and standalone Next production output
npm start             # serve the production build
npm test              # node:test via tsx, deterministic tests without model requests
npm run lint
npm run typecheck
npm run desktop:dev   # Next dev and Electron
npm run desktop:dist  # signed/notarized local macOS arm64 package
```

Next dev holds a project lock. Stop an existing server before starting another dev instance or a browser regression that starts its own server. Changing a script does not restart an already running process. `PORT` selects the dev port; normal development defaults to 3000.

`dev:fresh` uses disposable `.fresh-data/`, a separate auth file and `LH_IGNORE_ENV_KEYS=1`. It wipes its own data on launch unless passed `--keep`. It is separate from the persistent review examples and normal development data.

For platform packages and release checks, see [desktop releases](desktop-release.md). Hosting with Clerk and tenant storage is described in [hosting](hosting.md).

## Data and credentials

Normal development uses ignored `data/`. `LH_DATA_DIR` selects another data root. Chats are versioned JSON files under `chats/`; graph evidence is stored in JSONL ledgers under `graph/`; background jobs live under `jobs/`. Settings are non-secret JSON records. The desktop app selects its own writable data directory.

`npm run seed:review` adds only missing review chats. Existing examples, edits, unrelated data, settings and credentials remain intact. It does not seed graph data. See [the review guide](ui-review.md) for stable IDs and reset instructions.

Provider choice belongs in Settings, not environment defaults. The strong, cheap and vision model slots and per-session selections resolve through the existing settings/model services. There are no factory model choices. Configured provider API keys or supported subscription connections supply authentication. OpenRouter is one supported provider; it is not required for every request.

`.env.local` can supply provider credentials and machine-specific settings. Real environment credentials take precedence over the file-backed API-key store. `LH_AUTH_FILE` selects that store; otherwise web/dev uses the project auth file. `LH_IGNORE_ENV_KEYS=1` hides managed environment keys for empty-user testing.

Optional services include Google search (`GOOGLE_SEARCH_API_KEY` and `GOOGLE_CSE_ID`), Deepgram dictation (`DEEPGRAM_API_KEY`) and a system Chrome fallback (`CHROME_PATH`). Keep secrets in ignored local configuration, never in source or review fixtures.

### Subscription connections

Web/dev supports ChatGPT, GitHub Copilot and Grok through Settings / Providers. Credentials are stored beside the configured auth file as owner-only `chatgpt-credentials.json`, `github-copilot-credentials.json` and `xai-credentials.json`. The desktop development shell uses the dev server's connections; packaged Electron uses its main-process bridge. Use one server per credential directory because refresh serialization is process-local.

ChatGPT's local callback must finish on the server machine. Copilot and Grok use device codes. Hosted authentication and paste-back behavior differ; follow [hosting](hosting.md). Local developer mode shares server credentials with browsers using that server. It is not tenant-isolated hosting.

## Code layout

| Location | Responsibility |
| --- | --- |
| `app/` | Next pages and HTTP route handlers |
| `components/` | Session client, transcript, questions, composer, sidebar, settings, graph and demo presentation |
| `src/core/` | Native message contracts and folds, grading, plan/phase derivation, graph logic and storage ports |
| `src/agent/` | Agent construction, tools, provider/subscription adapters and background agent work |
| `src/server/` | Request services, turn lifecycle, event stream, settings/provider services and store composition |
| `src/store/` | File-backed chat, graph, job, auth and settings adapters |
| `src/demo-kit/` | Interactive demo runtime, built into ignored `public/demo-kit/` |
| `electron/` | Desktop windows, native services and packaged-server lifecycle |
| `scripts/` | Builds, data utilities, review seeding and browser regressions |
| `tests/` | Unit, server, rendering, interaction and golden-record tests |

The lint import boundaries keep components on the browser-safe core barrel and app routes on the core/server barrels. Core and agent modules do not import lower storage/server layers. Dependencies enter through ports and explicit service seams.

## Session and UI behavior

The persisted transcript is native `LhMessage[]`, including tool calls/results and custom markers. The browser's `useChatSession` and `SessionModel` consume native agent-event SSE from both POST and reattachment streams. They do not use the former Vercel `UIMessage` transport. Pending questions and practice problems derive from persisted calls and results.

The server owns running turns independently of a browser connection. Detaching a view does not abort a turn. The client reconnects to existing work; explicit stop actions own cancellation. Background tools acknowledge their jobs and deliver custom steer markers through the serialized wake path.

Practice uses chat records with `kind: "practice"`, `problem` and `conclude` tools, thinking traces and explicit next-problem input. The old separate `/practice` problem-set pipeline and `data/practice/` store are retired.

The interface uses shared graphite tokens, consistent session type icons with separate status indicators, 52px headers and an integrated composer. Model, reasoning and usage controls live behind anchored Options. Settings has searchable categories, grouped fields, live reading preview and immediate persistence. Dialogs own focus and normal Tab traversal; Escape closes the active menu layer first.

One live sandboxed iframe serves a demo's inline, workspace and focused presentations. The live theme bridge updates neutral colors without replacing the document. Parameters, history and camera survive presentation changes. Legacy arbitrary HTML expands as a whole; individual graph focus uses the demo kit. See [DESIGN.md](../DESIGN.md) for the full UI contract.

## Verification

```sh
npm test
npm run lint
npm run typecheck
npm run build
npx tsx --test tests/review-seed.test.ts
node scripts/smoke-demo-workspace.mjs
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/smoke-sidebar-ui.mjs
```

The browser scripts create isolated data and start their own dev servers. Stop normal dev first. `LH_UI_SCREENSHOT_DIR` saves optional screenshots. They intercept model submissions. Desktop window changes also require a live Electron/AeroSpace check; a browser screenshot cannot establish native tiling behavior.

Golden records under `tests/fixtures/golden-data/` are real application output and remain immutable outside deliberate format updates. The review generator derives separate synthetic/local records from them. Seed tests read through the production chat store and verify active states, idempotence and preservation of existing files.

The 2026-10-27 UI verification had four stale full-suite assertions that reproduced on unchanged HEAD; see [ui-review.md](ui-review.md). Record new failures separately from that baseline.

## Data utilities

Run these against the intended local data root. They can change graph data; they are not required to review the UI.

```sh
npx tsx --env-file=.env.local scripts/import-notes.ts <dir>
npx tsx --env-file=.env.local scripts/backfill-graph.ts
npx tsx --env-file=.env.local scripts/replay-layout.ts
```

Chat writes stamp the current record version. Legacy unstamped records read as v1; future-version records are refused. Graph evidence shares a format sidecar; positions remain rebuildable. Do not copy review data or credentials into hosted or packaged installations.
