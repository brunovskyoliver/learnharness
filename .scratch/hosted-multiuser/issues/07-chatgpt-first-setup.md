# 07 — ChatGPT-first setup and slot auto-fill

Status: **done** (2026-10-26)

## What changed
- `components/setup-dialog.tsx`: in hosted mode the first-run screen leads with the ChatGPT connection row. API keys and the other subscriptions (Copilot, Grok) sit below it under "Other providers". The local and desktop screen is unchanged.
- Auto-fill: `CHATGPT_SLOT_PINS` matches your desktop picks (your answer: "Match your desktop"):
  - strong: `gpt-6.1-sol` → `gpt-6-sol`, medium
  - cheap: `gpt-6-luna` → `gpt-5.6-luna`, xhigh
  - vision: `gpt-6-luna` → `gpt-5.6-luna`, xhigh

  When the pickers open in hosted mode, each empty slot takes the first pinned id that the user's live ChatGPT catalog offers (vision must take images). If the model doesn't support the pinned level, the slot uses the app's default. Slots the user already set are kept, and a slot with no match stays "needed". Nothing saves on its own; the user still clicks Save models.
- `hosted` reaches the dialog through the settings dialog context (`useSettingsDialog().hosted`), which the layout sets via `AppShell`.
- `SubscriptionConnections` takes `without="chatgpt"` so ChatGPT isn't listed twice.

## Verified
- `tests/hosted-setup.test.tsx`: autofill picks the first offered pin per slot at its level. An API-key provider's copy of the same id doesn't count. User pins are kept, and vision skips text-only models. The hosted screen leads with ChatGPT (shown once), with keys under Other providers; the local screen is unchanged.
- `npm test` 2372/2372, typecheck, lint and `next build` clean.

## Left / for review
- Copy is my draft: "Connect your ChatGPT subscription. Your plan covers the models, so no API key is needed. You’ll pick your models next." and "Or paste an API key, or connect another subscription."
- The pinned ids came from your desktop `settings.json` and pi-ai's catalog, not from a live hosted account. The fallbacks cover an account that lacks the first choice.
- No interaction test drives the full dialog in hosted mode (fetch → autofill effect); the pure function is covered.
