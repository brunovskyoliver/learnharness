# 08 — Deployment

Status: **done** (2026-10-26)

## What changed
- `Dockerfile`: multi-stage on `node:26-bookworm-slim`. The build stage runs `npm ci` (no Electron binary), `next build` and the server bundle. The runtime stage has Debian's Chromium and fonts, runs as `node`, and sets `LH_HOSTED=1`, `LH_DATA_DIR=/data` and `CHROME_PATH`. Image is about 1.6 GB, mostly Chromium.
- `compose.yaml` + `deploy/Caddyfile`: the app plus Caddy for TLS on `{$LH_DOMAIN}`, with one data volume (`lh-data`). `.env.hosted.example` lists the three values to fill in, and `.env.hosted` is git-ignored.
- Chrome sandbox (your answer: "Sandbox on in hosted"): `chromeArgs()` in `src/agent/subagents/headless.ts` drops `--no-sandbox` when hosted. `deploy/chrome-seccomp.json` is Docker's default profile (moby/profiles) plus `clone`/`unshare`/`setns`, applied to the app container only.
- `proxy.ts`: Clerk reads the publishable key at request time, because Next inlines `NEXT_PUBLIC_*` at build time and the image is built without keys. The secret key isn't passed in code: doing so makes Clerk demand `CLERK_ENCRYPTION_KEY`, and it reads `CLERK_SECRET_KEY` from the env anyway.
- Two bugs found in the live Clerk test, both fixed:
  1. **First page after sign-in crashed** ("This page couldn't load"; dev showed `useServerEvent requires <ServerEventsProvider>`). Clerk soft-navigates from `/sign-in` to `/`, and Next kept the root layout it had rendered while signed out, which has no app providers. Fix: route groups. `app/(app)/` holds the app layout, home, chat and settings; `app/(auth)/` holds sign-in and sign-up under its own small root layout. Next turns a jump between root layouts into a full page load. Fonts moved to `app/fonts.ts` so both layouts share them. The app layout lost its signed-out branch, since signed-out visitors can't reach it.
  2. **Redirects went to Clerk's hosted Account Portal** (`*.accounts.dev`), not our `/sign-in`. `CLERK_URLS` (`components/clerk-appearance.ts`) now goes to the proxy and both providers.
- `docs/hosting.md`: Clerk setup (including restricting sign-ups), env vars, DNS, `docker compose up -d --build`, the first-run flow with ChatGPT paste-back, the sandbox note with the Ubuntu AppArmor caveat, backups and upgrades, and limits (10 MB uploads, one replica only).

## Verified
- Container, no keys: every route returns 503 and `/data` stays empty. With the real Clerk dev keys: `/` 307 → our `/sign-in`, `/sign-in` 200, `/api/chats` 401. Checked again after the route-group change, on the rebuilt image.
- Two Clerk test users signed in through sign-in tokens. User A uploaded a file. User B's `GET /api/files` was empty, and `/data/users/` held one folder per user.
- Sign-in lands on a working home page on the first load, and sign-out lands on our `/sign-in`. Both checked in hosted `next dev` after the fix; before the fix the crash reproduced in both the container and dev.
- Chromium without `--no-sandbox` works under the seccomp profile and fails under Docker's default one, so the profile is required.
- New tests: `chromeArgs` hosted vs desktop (`tests/browser-service.test.ts`), and the sign-in pages sit under a separate root layout (`tests/tenant-routes.test.ts`).
- `npm test` 2374/2374, typecheck, lint and `next build` clean (the same known "dynamic filesystem access" warnings). Desktop prod build: `/` 200, `/sign-in` 404, unknown paths 404.

## Left
- Not tested on a real Ubuntu host or with a public domain and Let's Encrypt; OrbStack only. The AppArmor userns caveat is written from the docs, not from a run.
- The Clerk app uses development keys. For real use, create a production instance in Clerk and set its DNS records (see docs/hosting.md).
- Both test users were deleted. The sign-in ticket URLs for them appeared in the preview tool's output; they were single-use, expired after 5 minutes, and the users no longer exist.
- Electron desktop build not re-run after moving routes into route groups. Next resolves the groups itself and nothing in `electron/` or `scripts/` references app paths, but run a desktop build before the next release.

## Deployed (2026-10-26)
- Live at https://learn.brunovsky.online.
- App: AI VM (`brunovsky@172.29.5.181`, Tailscale `100.89.138.0`), `~/learnharness/` (`compose.yaml` app-only, `chrome-seccomp.json`, `.env` mode 600 with the Clerk keys). It listens on `100.89.138.0:3010`; overtree has :3000.
- TLS: the home Caddy (`ssh caddy`, Alpine, `/etc/caddy/Caddyfile`) has a `learn.brunovsky.online` block next to overtree's, pointing at `100.89.138.0:3010`. Backup: `Caddyfile.bak-20261026-learn`. Reload: `sudo rc-service caddy reload`.
- Clerk: still the dev instance (`pk_test`). Allowlist on with only obrunovsky7@gmail.com (your answer: "Allowlist"). Add people in Clerk → Configure → Restrictions.
- Chromium keeps its sandbox on this Ubuntu 24.04 host despite `apparmor_restrict_unprivileged_userns=1`; checked with a headless run inside the container.
- Redeploy (the VM has about 3 GB free, so build on the Mac):
  ```sh
  docker build --platform linux/amd64 -t learnharness:amd64 .
  docker save learnharness:amd64 | gzip -1 | ssh brunovsky@172.29.5.181 'gunzip | docker load'
  ssh brunovsky@172.29.5.181 'cd ~/learnharness && docker compose up -d && docker image prune -f'
  ```
