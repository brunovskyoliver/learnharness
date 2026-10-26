# 03 — Scope shared registries and the event bus

Status: **done** (2026-10-26)

## What changed
- `config.ts` `tenantScoped(slot, init)`: one registry instance per tenant. Outside a tenant it uses the same globalThis slot as before, so local behavior and the tests that inspect those slots are unchanged. In hosted mode it throws when no tenant is set.
- Scoped by it: turn runs and failures, turn liveness, dismissal park, compaction in-flight, wake pipeline state, job aborts, extraction runs and the audit lock, and the background LLM permit pool (now one pool per tenant).
- Fixed module-load captures that would have bypassed or broken the scoping:
  - `turn-liveness.ts` held `registry()` in a module const.
  - The extraction pipeline (built at module load) held `runs().running`/`inFlight`.
  - `jobs.ts` stored process-wide wiring (`turnRunner`, `respawn`, the subscription-change watch) in what is now tenant state. That wiring moved to its own global slots.
  - `src/store/graph.ts` ran a legacy-ledger purge at load. It's now skipped in hosted mode, since new tenants never had those files.
- `events-stream.ts`: each SSE window remembers its tenant and drops events emitted from another tenant's context (`emit` is synchronous, so the emitter's tenant is current inside the listener).

## Verified
- `tests/tenant-registries.test.ts`: turns invisible across tenants, no cross-tenant job abort, separate permit pools, SSE isolation, and the full server barrel imports under `LH_HOSTED=1` without writing anything. That last test is what caught the three load-time captures above.
- `npm test` 2353/2353, typecheck and lint clean.

## Left
- Per-tenant registry instances are never evicted (marked `ponytail:` in `config.ts`).
- Keys (`keys.ts` boot record and the `process.env` reflection) → ticket 4. Subscription owner and bridges → ticket 5.
