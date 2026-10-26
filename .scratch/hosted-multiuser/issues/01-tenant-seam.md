# 01 — Tenant context seam

Status: **done** (2026-10-26)

## What changed
- `config.ts`: `runAsTenant(userId, fn)`, `currentTenant()`, `hostedMode()` on a globalThis-backed AsyncLocalStorage. Tenant ids must match `^[A-Za-z0-9_-]{1,64}$`.
- `PATHS` and `LEDGER_FILES` now use getters that resolve per call. Inside a tenant they point under `$LH_DATA_DIR/users/<userId>/`; outside one they give the old paths.
- The string constants became functions: `settingsFile()`, `authFile()`, `sourcesFile()`, `positionsFile()`, `renderSettingsFile()`, `graphFormatFile()`, `promptsOverrideDir()`. Call sites were updated in src and tests.
- `authFile()` inside a tenant (or in hosted mode) is `<tenant>/auth.json`, so subscription credential files (which sit beside it) become per tenant too, once ticket 5 drops the singleton owner.
- Captures at load time removed: `src/store/jobs.ts` (`jobsDir()`) and `providerEventsDir` (getter with a test override).
- With `LH_HOSTED=1` and no tenant, path reads throw. Store reads that swallow fs errors return empty results; writes throw.

## Verified
- `tests/tenant.test.ts`: per-tenant paths, unchanged paths outside a tenant, chat and key isolation across awaits/timers, rejected traversal ids, fail-closed hosted mode.
- `npm test` 2344/2344, `npm run typecheck` and `npm run lint` clean.

## Left
- The web subscription owner is still one singleton (ticket 5).
- Registries and the event bus are still shared (ticket 3).
