# 05 — Per-user subscriptions and ChatGPT paste-back

Status: **done** (2026-10-26)

## What changed
- `src/server/web-subscriptions.ts`: the web subscription owner is per tenant (`tenantScoped`), and its credentials live in that tenant's directory (`users/<id>/chatgpt-credentials.json`, `…/github-copilot-credentials.json`, `…/xai-credentials.json`). Owner packets are published inside the owner's tenant, so status pushes and the `subscriptions-changed` SSE event only reach that user. A single exit hook closes every owner; before, each owner registered its own.
- ChatGPT paste-back (`electron/chatgpt.cjs`, from earlier in this ticket): with `pasteCallback`, which the web owner turns on in hosted mode, login opens no loopback listener. The status carries `callbackPaste: true`, and the new `completeLogin(url)` checks the pasted `http://127.0.0.1:…/auth/callback?…` URL the same way the listener does: origin, path, no duplicate params, state. A bad paste fails with its own message and leaves the attempt open. A good one exchanges the code once.
- Plumbing: a `callback` op in `chatgpt-ipc.cjs` (URL capped at 4096 chars) and in the HTTP allowlist, an optional `callback()` on `ChatGPTControlBridge`, and an implementation in the web bridge client.
- `src/agent/chatgpt-bridge.ts`, `subscription-bridge.ts`: the bridge state (status, catalog, leases) is per tenant. Each tenant's bridge only takes packets published in its own tenant. Desktop IPC listeners attach only to the no-tenant bridge. Change listeners stay process-wide, because the wake pump's single watch in `jobs.ts` resolves the tenant when it fires. Outside hosted mode the first watcher still creates the bridge at load, as before.
- `components/settings/chatgpt-connection.tsx`: when a pending login has `callbackPaste`, the connect dialog shows a paste field and a "Finish sign-in" button in place of "Waiting for browser sign-in…". In paste mode the privacy notice says credentials sit on the LearnHarness server.
- Copilot and Grok already sign in with device codes in pi-ai (no loopback), so they work hosted as they are.

## Verified
- `tests/chatgpt-auth.test.ts`: in paste mode, a malformed URL or wrong state is rejected with no token request and the attempt stays pending. The real callback (with surrounding whitespace) connects the account, and a second paste is refused.
- `tests/chatgpt-connection-ui.test.tsx`: the paste box appears while pending, a bad paste shows the error and keeps the box, and a good paste closes the dialog.
- `tests/tenant-registries.test.ts`: each tenant gets its own owner, and a packet published in tenant A doesn't change tenant B's bridge status. The hosted-mode barrel import still writes nothing.
- `npm test` 2361/2361, typecheck, lint and `next build` clean.

## Left / for review
- UI copy is my draft: the paste hint ("After you approve in the sign-in tab, it ends on a page that cannot load (its address starts with http://127.0.0.1). Copy that whole address and paste it here."), the "Finish sign-in" button, and the bad-paste error. Change these if you want different wording.
- A live paste-back against real OpenAI is not tested yet. It needs a real ChatGPT account, so it's part of the ticket 8 hosted smoke.
