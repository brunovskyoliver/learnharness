# Hosted multi-user LearnHarness: plan

Status: **draft, waiting for approval**. Nothing is implemented yet.

## Decisions so far (owner, 2026-10-26)

- **Tenancy:** one multi-tenant server process, not a container per user.
- **Auth:** Clerk. A Clerk `userId` is the tenant id.
- **Compute:** each user connects their own subscription. ChatGPT is the suggested first choice; Copilot/Grok and per-user API keys stay available as fallbacks. No operator-paid keys.
- **ChatGPT sign-in on a remote server:** paste the redirect URL back into the app.
- **Agent file tools:** jailed to a per-user upload folder.
- **First run:** setup opens on "Connect ChatGPT". After a successful connect, EMPTY model slots get filled with ChatGPT models.
- **Desktop and plain `npm run dev` behave exactly as today.** Hosted mode turns on with `LH_HOSTED=1`. Without it there is one implicit tenant whose paths are the current ones, byte for byte.

## What the code looks like today (why this is work)

- All data paths come from module-level constants in `config.ts` (`PATHS`, `LEDGER_FILES`, `SETTINGS_FILE`, `AUTH_FILE`, ...). 17 files use them. Most read them at call time; `src/store/jobs.ts` captures `JOBS_DIR` at load.
- API keys are copied into `process.env` (`src/server/keys.ts`), and pi-ai reads them from there. A shared process would share keys.
- Process-wide registries on `globalThis`: event bus, turn runs, turn liveness, job wake, compaction, dismissal park, sub-agent aborts, extraction runs, the background LLM semaphore, the web subscription owner, and the cached pi `Models` collection.
- `src/agent/tools/fs-shared.ts` resolves agent paths against `os.homedir()`, and absolute paths go through unchanged. `POST /api/graph/import` reads server paths too.
- ChatGPT OAuth (`electron/chatgpt.cjs`) listens on `127.0.0.1:<random port>`, so only a browser on the server's machine can finish it.

Helpful facts:
- Node `AsyncLocalStorage` follows promises and timers, so background work started inside a request inherits that request's tenant. The only long-lived loops are the SSE heartbeat and the desktop IPC bridges. Job recovery is lazy and runs inside `/api/jobs` requests.
- pi-ai 1.4.0 accepts `apiKey` and a provider-scoped `env` on every request (`ProviderRequestOptions`), so keys can go per call.

## Tickets

1. **Tenant context seam.** Add `src/server/tenant.ts` with an ALS store `{ userId, dataRoot, authFile }`. The `config.ts` path exports become call-time getters that read the current tenant and fall back to today's paths. Fix the load-time `JOBS_DIR`. User data lives at `$LH_DATA_DIR/users/<userId>/`. When hosted, code that needs a tenant and has none throws instead of falling back. Check: two tenants write chats, graph and settings; neither can read the other's.
2. **Clerk gate.** With `LH_HOSTED=1`, `proxy.ts` runs Clerk middleware: pages go to sign-in, `/api/*` gets 401 without a session. Every API route handler is wrapped with `withTenant(handler)`, which runs it in the signed-in user's tenant. A test fails if any `app/api/**/route.ts` export skips the wrapper. The desktop secret check is unchanged. Who may sign up is set in the Clerk dashboard (allowlist or invite-only), not in code.
3. **Scope shared registries.** Bus events carry the `userId` of the emitting context, and `/api/events` only forwards its own user's events. Registries keyed by chatId get keyed by `userId:chatId`. The LLM semaphore becomes one pool per tenant so one user can't starve the others. The `Models` collection stays shared because it has no keys in it.
4. **Per-user keys.** In hosted mode the auth store reads the tenant's `auth.json` and nothing is written to `process.env`. `piEngineForSpec` passes `apiKey`/`env` per request. Tool keys (web search, Deepgram) come from the same per-user store.
5. **Per-user subscriptions and ChatGPT paste-back.** The single web subscription owner becomes `Map<userId, owner>`, with the directory set to the tenant's auth dir and idle owners evicted. ChatGPT login gets a paste-back mode: no listener; after sign-in the user pastes the `http://127.0.0.1:…/auth/callback?…` URL, and the server checks origin, path, state, duplicate params and PKCE the same way the listener does today, then exchanges the code. Copilot/Grok already use device codes.
6. **File jail and uploads.** Agent fs tools and `pdf_read` resolve inside `<tenant>/files/`. Checks run on `realpath`, so `..`, absolute paths and symlinks can't escape. Add an upload route with a size cap and a small upload UI. Notes import reads only from that folder.
7. **ChatGPT-first setup.** Hosted SetupDialog leads with Connect ChatGPT; API keys move under "Other providers". After a connect, empty strong/cheap/vision slots are filled from a pinned list. **Open:** exact model ids. I'll pull the live list from a connected account and ask you before pinning.
8. **Deployment.** Dockerfile built on the existing standalone output, with Chromium for the headless tools. A compose file with a data volume and Caddy for TLS. `docs/hosting.md` covers env vars (`LH_HOSTED`, `LH_DATA_DIR`, Clerk keys), backups (one volume) and upgrades.

Order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Tickets 1–3 are the isolation core and should land together before any public exposure.

## Not planned (add when needed)

- Migrating an existing single-user `data/` into `users/<id>/`. That's a `mv` for one person.
- Admin UI, quotas beyond the upload cap, usage dashboards.
- Horizontal scaling. Everything assumes one process: sync file writes and in-process locks. Fine for tens of users; past that, ticket 1's seam is where a database would go in.

## Risks to know about

- **OpenAI terms.** Each user must sign in with their own ChatGPT account. Sharing one subscription across users would break the terms. Even per-user third-party use of a subscription is a gray area, and OpenAI can change or block it.
- **AGPL-3.0.** Serving this to other people over a network means offering them your modified source. A link to your public fork satisfies that.
- **One bug can leak data across tenants.** Tickets 1–3 come with cross-tenant tests, and hosted mode fails closed when no tenant is set.
