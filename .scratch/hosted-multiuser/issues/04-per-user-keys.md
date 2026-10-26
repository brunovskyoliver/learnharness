# 04 — Per-user API keys

Status: **done** (2026-10-26)

## What changed
- `src/server/keys.ts`: hosted mode implies `envKeysIgnored()`. At boot every managed provider and tool variable is deleted from `process.env`, so the operator's own keys never serve users. Nothing is ever reflected back into `process.env`, either at boot or on save/delete. `keyValue`, `keyStatuses` and `providerKeyPresent` read the current tenant's `auth.json`, which ticket 1 placed at `users/<id>/auth.json`.
- `src/agent/models.ts`: `configureProviderEnv`/`providerEnv` hook (on globalThis, so the agent layer still doesn't import the server). In hosted mode `piEngineForSpec` passes the tenant's saved vars as pi-ai's per-request `env`. pi-ai overlays that on its env lookup, so every API-key provider works, including multi-variable ones (Bedrock, Azure, Vertex). Desktop and dev keep the old reflection path.
- Tool keys (Tavily/Brave search, Deepgram STT) already went through `keyValue`, so they're per tenant with no change.

## Verified
- `tests/tenant-keys.test.ts`: operator env key dropped at boot; a saved key is visible only to its tenant and never reaches `process.env`; the engine passes the tenant's keys to pi-ai and another tenant gets none; delete doesn't touch `process.env`.
- `npm test` 2357/2357, typecheck and lint clean.

## Left
- Subscription credentials (ChatGPT/Copilot/Grok) → ticket 5.
