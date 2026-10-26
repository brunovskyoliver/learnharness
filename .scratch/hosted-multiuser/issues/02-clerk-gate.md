# 02 — Clerk gate

Status: **done in code; real sign-in not yet verified** (2026-10-26)

## What changed
- Added `@clerk/nextjs` 7.9.20.
- `proxy.ts`: when `LH_HOSTED=1`, runs `clerkMiddleware`. Pages redirect to sign-in, `/api/*` returns 401 without a session, and `/sign-in`/`/sign-up` are public. Hosted mode without Clerk keys returns 503 on everything, so Clerk's keyless mode never runs. The matcher now covers pages as well as `/api`; outside hosted mode pages pass through untouched and the desktop secret check on `/api` is unchanged.
- `src/server/tenant-access.ts`: `withTenant(handler)` for route handlers and `withTenantPage(page)` for pages. Both pass through outside hosted mode; in hosted mode they run inside `runAsTenant(clerkUserId)`, returning 401 or redirecting to `/sign-in` when no user is signed in.
- All 32 `app/api/**/route.ts` exports are wrapped, as are the 3 store-reading pages (`/`, `/chat/new`, `/chat/[id]`).
- `app/layout.tsx`: in hosted mode, wraps the app in `ClerkProvider` (colors from `components/clerk-appearance.ts`, matched to the dark palette); signed-out visitors get no app shell. `components/account-row.tsx` (Clerk `UserButton`) sits under Settings in the sidebar. It's passed in as a slot, so `sidebar.tsx` doesn't import Clerk.
- Added `app/sign-in`, `app/sign-up`; both 404 outside hosted mode.

## Verified
- `tests/tenant-routes.test.ts`: every route export wrapped, every store-reading page wrapped, pass-through vs 401, 503 without keys.
- `tests/desktop-api.test.ts` updated: pages now match the proxy and pass straight through outside hosted mode.
- `npm test` 2348/2348, typecheck, lint and `next build` clean.
- `next start` smoke: local mode `/` 200, `/api/chats` 200, `/sign-in` 404. Hosted mode without keys: `/` and `/api/chats` 503.

## Left
- No real Clerk round trip yet. It needs a Clerk application (publishable and secret keys). I'll verify sign-in, sign-out and tenant routing during ticket 8.
- Sign-up policy (allowlist or invite-only) is set in the Clerk dashboard.
- Build caveat: the static `/settings` redirect and `/_not-found` are prerendered at build, but they render no Clerk UI and the proxy still gates them.
