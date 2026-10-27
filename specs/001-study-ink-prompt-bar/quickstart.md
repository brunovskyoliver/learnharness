# Quickstart: validate feature 001

1. `npm ci` then `npm run dev:review`; open http://localhost:3000.
2. Knowledge check thread: collapse/expand the bar by scrolling; confirm turn strip, body, answer well, toolbar, "Submit answer" (contract: contracts/prompt-bar.md).
3. Active practice thread: confirm "Skip" opens the dismiss confirmation; cancel keeps the problem.
4. Practice history thread: "Next problem" button shape; Enter-on-empty hint.
5. With no provider key: toolbar shows "Add a provider key"; nothing floats over the transcript.
6. Resize to 320, 390, 1440 px; no control covers transcript text; scrollbars hidden.
7. `npm test && npm run lint && npm run typecheck && npm run build`.
8. Screenshots: `node scripts/smoke-dock-ui.mjs` where Chrome is available.
