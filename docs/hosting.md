# Hosting LearnHarness for several people

One Docker host runs the app and Caddy. Clerk handles sign-in. Each person gets their own chats, graph, settings, keys, subscriptions and upload folder under `/data/users/<clerk user id>/`. The desktop app is unaffected: everything here only applies when `LH_HOSTED=1`.

## What you need

- A Linux box with Docker and the compose plugin, ports 80 and 443 open.
- A hostname (for example `learn.example.com`) with an A/AAAA record pointing at the box.
- A Clerk account (free tier is fine to start).

## 1. Create the Clerk application

1. In [dashboard.clerk.com](https://dashboard.clerk.com), create an application and pick the sign-in methods you want (email code, Google, GitHub…).
2. Under **Configure → Restrictions**, decide who may sign up. For a private instance, turn on the allowlist or invitation-only mode; otherwise anyone who finds the URL can make an account and spend their own ChatGPT plan on your server.
3. Copy the **publishable key** (`pk_…`) and **secret key** (`sk_…`) from **API keys**.

Development keys (`pk_test_…`) work for trying it out, but Clerk rate-limits them and shows a banner. For real use, create a production instance, add your domain in Clerk, and set the DNS records it asks for; that gives you `pk_live_…` keys.

## 2. Configure

```sh
git clone <this repo> learnharness && cd learnharness
cp .env.hosted.example .env.hosted
$EDITOR .env.hosted
```

| Variable | What it is |
|---|---|
| `LH_DOMAIN` | Public hostname. Caddy gets a Let's Encrypt certificate for it. |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key. Read at request time, so the image doesn't need rebuilding when it changes. |
| `CLERK_SECRET_KEY` | Clerk secret key. |

The image sets the rest itself: `LH_HOSTED=1`, `LH_DATA_DIR=/data`, `CHROME_PATH=/usr/bin/chromium`, `PORT=3000`. Without both Clerk keys the app fails closed: every request gets a 503 and nothing is written to `/data`.

`.env.hosted` is git-ignored. Keep it readable only by you (`chmod 600 .env.hosted`).

## 3. Start

```sh
docker compose up -d --build
docker compose logs -f app
```

Open `https://<LH_DOMAIN>`. You land on the sign-in page; after signing in you get the normal app with your account in the sidebar under Settings.

## What each person does on first run

1. **Connect ChatGPT** (the first thing the setup screen offers). A ChatGPT Plus/Pro plan covers the models, so no API key is needed.
   Sign-in works by paste-back, because the server can't receive OpenAI's redirect: approve in the OpenAI tab, which then ends on a page that can't load (its address starts with `http://127.0.0.1`). Copy that whole address and paste it into the box in the app.
2. The model slots fill themselves from the ChatGPT catalog (strong, cheap and vision). Click **Save models**.
3. Optional: API keys or other subscriptions under **Other providers**.
4. Files for the agent to read go in **Settings → Files** (10 MB per upload). In hosted mode the agent's file tools can only see that folder.

## Chrome sandbox

Demos and PDF rendering run headless Chromium inside the container. On desktop it runs with `--no-sandbox`; in hosted mode it keeps Chrome's own sandbox on, because the pages it renders come from the model. That sandbox needs to create Linux namespaces, which Docker's default seccomp profile blocks. `deploy/chrome-seccomp.json` is Docker's default profile with `clone`, `unshare` and `setns` allowed, and `compose.yaml` applies it to the app container only. The container still runs as the unprivileged `node` user with no added capabilities.

If demos fail with a "No usable sandbox" error, the host is refusing unprivileged user namespaces. Ubuntu 23.10 and later do this through AppArmor (`sysctl kernel.apparmor_restrict_unprivileged_userns` prints `1`). Either set it to `0` or give the container an AppArmor profile that allows `userns`. This was tested on OrbStack, not on Ubuntu.

## Data, backups and upgrades

All state lives in the `lh-data` volume (`/data` in the container):

```
/data/users/<user id>/   chats, graph, settings, keys, subscriptions, files/
```

Back up by stopping the app and archiving the volume:

```sh
docker compose stop app
docker run --rm -v learnharness_lh-data:/data -v "$PWD":/backup busybox \
  tar czf /backup/lh-data-$(date +%F).tgz -C /data .
docker compose start app
```

(The volume name is `<project folder>_lh-data`; `docker volume ls` shows it.) Restore by extracting the archive into an empty volume the same way.

Upgrade:

```sh
git pull
docker compose up -d --build
```

Caddy's certificates live in the `caddy-data` volume; keep it so you don't hit Let's Encrypt rate limits on rebuilds.

## Limits to know

- **Uploads:** 10 MB per request. Next's proxy buffers request bodies up to `experimental.proxyClientMaxBodySize` (10 MB by default) and cuts off anything larger, so raise that and `UPLOAD_MAX_BYTES` in `src/server/files.ts` together.
- **One process.** Per-user state is kept in memory inside one Node process. Don't scale the app service to more than one replica.
- **Removing a person:** delete them in Clerk, then remove `/data/users/<their id>/`.
