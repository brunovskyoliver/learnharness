# Quickstart: validating feature 028 (motion)

Validation guide only; the catalogue is [contracts/motion-contract.md](contracts/motion-contract.md), the flags are in [data-model.md](data-model.md), the reasoning in [research.md](research.md).

## Prerequisites

- System Chromium (`CHROME_PATH` or `/usr/bin/chromium-browser`); snap Chromium needs `TMPDIR` under `$HOME` (playwright.config.ts handles it).
- Isolated data: Playwright starts its own `next dev` on 127.0.0.1:3124 with a fresh data dir and the faux Notebook model. `npm run dev:review` gives persistent example threads for manual review.
- Evidence goes to `~/agent-runs/2026-11-09-motion/`.

## 1. Unit checks

```bash
npm test -- --test-name-pattern "motion"   # or: npx tsx --test tests/motion-guards.test.ts tests/motion-tokens.test.ts
```

Expected: every token in contract §1 with its value; spring fallbacks present; reduced-motion block covers every arrival selector; no `animate-in`/`zoom-`/`slide-in-from-` class left in components/ui; `signatureDecision` and the inline script agree; stagger caps hold for desktop and phone.

## 2. Browser regressions

```bash
npx playwright test tests/e2e/study/motion.spec.ts tests/e2e/study/mode-switch.spec.ts tests/e2e/notebook/smoke.spec.ts
```

Expected (research R14): with JavaScript off the page is in its final state; signature plays in a fresh context and not after reload; reduced motion shows only opacity animations ≤150ms; Mod+K at 50ms opens the palette; a click 50ms into a route transition lands; typing during a mode switch lands; Escape twice closes two layers; layer exits are opacity-only and ≤160ms; CLS 0 per trigger; with `startViewTransition` removed every transition ends finished with no console error; chrome pixels still during route and mode changes; ten rapid route clicks end on the last route; the demo iframe never reloads.

## 3. Manual walk (1440, 390, 320 px; light, dark; reduced motion on and off)

1. New tab → `/`: ring draws, dot splats, "Waiting for you" and rows ink in; all text solid by 600ms (DevTools Performance, screenshots on). Reload: no signature, short ink-in.
2. Mod+Shift+O both ways: ☰ and wordmark do not move; old page lifts, new one unfolds; caret placeable at once.
3. Home → lesson → Library → Review → Settings, then Back/Forward: ≤300ms each; back/forward plain ink-in; scroll restored.
4. Open/close sidebar, palette, a menu, a tooltip, settings, export: focus moves at open and returns at close; Escape closes innermost first.
5. Customize → Appearance: the new theme soaks from the chosen card; a demo on the page keeps its state.
6. Library: expand a folder, upload a file; Review: reveal and rate; a demo arriving; a correct graded answer.
7. Print a lesson: no partial states.
8. Electron (`npm run desktop:dev` or the packaged app): cold start plays the signature once per window.

## 4. Startup budget

```bash
npm run build && npx next start -p 3200 &   # fresh LH_DATA_DIR
node ~/agent-runs/2026-11-07-unified-redesign/startup-js/startup-js.mjs http://127.0.0.1:3200 after-028 > ~/agent-runs/2026-11-09-motion/startup-after.json
```

Run the 390×844 copy too. Compare with `startup-base*.json` (HEAD `b0cdb1e`): each route ≤ +5% gzip.

## 5. LCP and long tasks (informative, SC-007)

Throttled mobile profile (4× CPU, Fast 3G) on `/` and `/library`: LCP before/after within one frame of the baseline plus the heading's first-frame fade; no long task over 50ms from motion code.

## 6. Owner recording (SC-008)

Side-by-side recordings of all 30 rows (light and dark, one with reduced motion) in `~/agent-runs/2026-11-09-motion/recordings/`.
