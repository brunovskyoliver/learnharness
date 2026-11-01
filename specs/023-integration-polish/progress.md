# Feature 023: Integration polish
Stage: done, not merged or deployed
Updated: 2026-11-01

## Decisions

Owner-facing decisions are in spec.md, Clarifications, and docs/workspace-decisions.md. Technical ones:

- The held turn is read from the running turn's messages, so the `/chat/new?send=` path needs no extra plumbing. A test pins the pattern against `tutorMessage`.
- One changed region per side, by lines, rather than a merge library. It refuses when unsure.
- `clerkConfigured` got its own file, rather than a new tracing exclude. It removes the cause, and the excludes are documented as fragile.
- Plain CDP for Electron: Puppeteer failed attaching to its page ("Requesting main frame too early").

## Log

- The Library's line had the open page's row too, behind the phone layer, and it lacked the save-first path. It now leaves out the page open beside it.
- Focus fell to the body after closing a proposal dialog, on pages and on 022's diagram line. Both now return it to Review.
- Clerk's Next SDK doesn't read `CLERK_JWT_KEY` from the environment in this version, only the `jwtKey` option, so `proxy.ts` passes it when set.
- A signed-in request whose host differs from the server's name hung: Next proxied Clerk's rewrite to itself. The check uses `localhost` for both. See Risks.
- `BrowserWindow.show` segfaults Electron in `--headless`. `--ozone-platform=headless` segfaults too.

## Report

**Built**
- Held page edits: `library/page-proposals/`, routes, tool outcome, review with comparison, Accept, Reject, Edit first, refusal when the page moved on. See spec.md.
- PDF keyboard path: Select text, arrows, Shift, Enter, Escape, next page.
- Connective gaps fixed: session Notes on phones; Make flashcards in a page's Links; Create page from a diagram's dangling link; focus return on the proposal lines.
- Desktop: the standalone no longer carries `data/`.
- Flake fixed: see below.

**What still lands directly**
`page_revise` in an ordinary turn not started from a selection's Simpler, Rewrite or Expand, on a page with nothing waiting. Draft saved first; review bar and Undo after. Why, and the one-line change: docs/workspace-decisions.md, question 1.

**Final verification, on `3fdf240`** (the code; commits after it are this file only). Evidence: `~/agent-runs/2026-11-01-integration/final/`.

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx eslint .` | clean |
| `TMPDIR=~/lh-tmp CHROME_PATH=/snap/bin/chromium NODE_ENV=test npx tsx --test tests/*.test.ts tests/*.test.tsx`, twice | both 3871 tests, 3869 pass, 0 fail, 2 skipped |
| `npx next build` | pass, 4 tracing warnings, the same count as 022 |
| `node scripts/build-server.mjs`, with the real `data/` present | pass, no `data/` in the standalone |
| `check-workspace-ui`, `check-notes-ui`, `check-documents-ui`, `check-review-ui`, `check-diagrams-ui`, `check-session-state-ui`, `check-transcript-scroll-ui`, `check-turn-navigation-ui` | pass in the pass |
| `check-library-folders-ui` | **failed in the pass**, passed on a warm rerun, unmodified |
| `smoke-sidebar-ui` | **failed in the pass and 4 more times**, passed once its route was compiled, unmodified (8 PASS) |
| `check-library-ui` | **failed in the pass and one rerun, at two different lines**, then passed, unmodified (74 PASS) |
| `smoke-demo-workspace` | **fails**, predates this work |
| `check-hosted-tenants` | pass |
| `node scripts/smoke-server.mjs --electron`, `check-electron-shell` | pass |
| `git diff main -- tests/fixtures/golden-data` | empty |

The failures, without softening:
- `check-library-folders-ui` and `smoke-sidebar-ui`: my verification script deleted `.next/dev` between checks to save disk, so each started cold. Folders lost a click before hydration; sidebar's first navigation exceeded its fixed 5 s. A temporary copy with a longer navigation timeout passed, and then the unmodified script did. I'm attributing these to the cold cache, and no product code changed between failing and passing. Neither script waits properly on a cold start, and they weren't changed.
- `check-library-ui`: failed once at line 1579 (a `page_revise` row, 43 PASS) and once at line 1140 (an editor placeholder, 25 PASS), each an immediate `$eval`, then passed on the next run with no change. It looks like races in the script, since the place moved and each element is one the check then finds on passing runs. **Not root-caused.** Neither line's feature was changed for those reruns. Treat this check as passing 1 of 3 on this code.
- `smoke-demo-workspace`: stops at `.lesson-footer [data-testid="stats-model"]`, which needs configured models the script doesn't seed. specs/014-workspace-navigation/progress.md reports the same stop. It wasn't rerun on `main`, and its later steps haven't run since 014.

**Flake**
- On `main` (`31a3c73`) in a separate worktree, four full runs: 3422 tests each. `tests/chatgpt-auth.test.ts:619` failed in run 3, with the same assertion as on this branch. So it predates the workspace work.
- `tests/provider-runtime-payload.test.ts:15` failed in all four. That is the symlinked `node_modules` escaping the payload check, an artifact of the worktree, and it passes here. A first attempt also failed `tokens-headless`, from a missing `public/demo-kit`, gone once it was built.
- `tests/sampling-panels-headless.test.ts:73` failed once on `main` (run 4), "Requesting main frame too early!", while a typecheck also ran. A separate load flake, not fixed, and it didn't appear in the final runs.
- Cause: not shared state. Both sign-in tests waited a fixed number of `setImmediate` turns for real RS256 work on the thread pool. Alone under CPU load: 2 failed runs of 8, one of each file. Fix: wait by the clock, same condition, in `tests/chatgpt-auth.test.ts` and `tests/chatgpt-connection-ui.test.tsx`. Under the same load: 0 of 16. Worktree removed.

**Initial JS, gzipped, same script (`~/agent-runs/2026-10-31-workspace/measure-html.mjs`)**

| Route | Pre-014 | 022 | Now | Against pre-014 |
| --- | --- | --- | --- | --- |
| `/` | 279.4 KB | 289.0 KB | 289.2 KB | +3.5% |
| `/library` | 282.9 KB | 294.1 KB | 294.5 KB | +4.1% |
| `/chat/new` | 269.9 KB | 279.8 KB | 279.7 KB | +3.7% |

Under the 5% ceiling, with about 0.9% left on `/library`. Not the constitution's throttled benchmark, whose baseline is still an open TODO.

**Hosted: verified**, with `scripts/check-hosted-tenants.mjs`, on the standalone server, `LH_HOSTED=1`, real `proxy.ts`, `clerkMiddleware`, `withTenant`, a throwaway RSA key, fake Clerk keys and two made-up users, all outbound connections refused and none attempted:
- 109 route methods across 86 route files answer 401 for no token, a forged token and an expired one. A page with no session redirects (307).
- Tenant B's lists hold none of A's folders, trash, search hits, cards, proposals, items or sessions. A's search really found the text first.
- 58 requests by B against A's real ids, on the id-bearing Library, card and chat routes, with every method: no success, none of A's text, A's state unchanged.
- Only A can accept A's proposal. B's folder on disk holds none of A's words.
- Chromium through the proxy: A sees A's Library; B's `/library` and `/review`, and a no-session load, hold none of it.

**Hosted: not verified**: Clerk's real sign-in, session cookies and hand-off (the token goes in the `Authorization` header); the sign-in pages; Clerk's browser script (blocked; no page errors); Docker, Caddy, the seccomp profile; `/data` on the real volume; routes with ids outside those families, beyond the no-token sweep; proposals made by a real tool call in hosted mode (seeded as files). The live deployment wasn't touched.

**Electron: verified**, with Electron 44.9.3 on this Linux machine, `--headless --no-sandbox`:
- `xvfb-run` and Xvfb are missing, and GTK and Wayland libraries weren't on the library path. No sudo. GTK came from the installed `gnome-46-2404` snap and 42 KB of `libwayland` packages unpacked into a temp folder, since removed.
- The real `electron/main.cjs` opened a window on the shipped standalone, both with main starting the server and with `LH_DEV_URL`. Its only harness changes: `BrowserWindow.show` skipped, and a Resources folder named.
- Sandboxed preload (`window.lh`, no `require` or `process`). Private API header: window 200, outside 403. Tab strip renders, 32 px high at top 52. Palette opens and closes by keyboard. 2 drag bands computed as `drag`, 3 controls inside computed as `no-drag`.
- `smoke-server.mjs --electron`: boots in Electron's own Node.

**Electron: not verified**: no OS window was drawn, so nothing was seen: no screenshots, window controls, real dragging, resizing, tiling, updater or GTK menu. No `electron-builder` package on any OS. **The owner's Mac packaging, signing and notarization weren't run.** macOS traffic lights and Windows weren't run. The run used `--no-sandbox` for the host process.

**`data/` risk from 019: fixed.** Confirmed blocking: `.next/server/middleware.js.nft.json` named `../../data/chats/*`, and `.next/standalone/data` held 5.2 MB of real sessions. Cause: the proxy's import of `config.ts`. After the fix the trace has 95 files and no data, and `build-server.mjs` passes. The refusal stays. The real `data/` wasn't moved or changed.

**Data preservation**: `tests/data-preservation.test.ts` passes: a hand-built pre-011 catalog through every feature keeps ids, versions byte for byte, previous names, `@` references, upload bytes and catalog version 1.

**Reduced motion**: emulated with `emulateMediaFeatures` for the review dialog, phone notes and the PDF path. The dialog's computed animation is asserted. No equivalent run for 011-022's other surfaces.

**Skills**
- `web-design-guidelines`: the fetch tool returned a summary of the rule sections, not the verbatim rules, so I checked against those sections by hand. `impeccable`: context, audit playbook, detector with no findings on the new files. Screenshots read: review at 390, keyboard at 320, phone notes at 390.
- Fixed: a failed copy said nothing; no announcement after a decision; the focus and duplicate-row bugs above. Left as is: Title Case, since DESIGN.md wins; the PDF bubble covers much of a 320 px page, as it has since 020.
- `impeccable` and `web-design-guidelines` were not run over 011-018. `speckit-feature` and `shadcn` weren't run as skills: artifacts by hand under the no-questions rule, with existing primitives. `node_modules/next/dist/docs/` wasn't read; no new Next API.

**Tests changed on purpose**
- `tests/chatgpt-auth.test.ts`, `tests/chatgpt-connection-ui.test.tsx`: the wait only, same conditions and assertions.
- `tests/note-ai-flow.test.ts`: a new case, and an optional parameter on its helper.
- `scripts/check-notes-ui.mjs`, `scripts/check-documents-ui.mjs`: new sections.
No existing assertion was changed. Golden fixtures are unchanged.

**Left out**
- Held edits on Home; accepting one hunk of several; a list of rejected proposals.
- Cards in the palette and Links panel; a filtered card list from a page.
- An approval from outside while the same page or diagram is open with typing still shows the conflict line. Nothing is lost.
- A real model call: the held path runs through a scripted engine and the real store.
- In a browser: the transcript row's Review, and Create page from a diagram link. Unit or code level only.

**Risks**
- Hosted hang: a signed-in request whose host the server doesn't recognise as itself never answered. Seen with `127.0.0.1` against a server named `localhost`. Not seen in production, where this check can't reach. A monitor on hosted latency would catch it.
- Two browser checks are sensitive to a cold dev cache, and `check-library-ui` has an unexplained intermittent race. CI doesn't run them.
- `tests/sampling-panels-headless.test.ts` can flake under load.
- `next-env.d.ts` is rewritten by `next dev`; I restored it each time.
- `.next` is 1.6 GB, down from 4.9 GB after removing its dev cache.
- A next-server from an earlier session, PID 1472540, port 3133, still runs from a deleted standalone. Left alone, since this run didn't start it. PID 1264648 is the live deployment's container, untouched.
- **The full test suite writes fixture records into the repo's real `data/`.** Each run adds sessions titled "Fixture mixed queue", "Scratch mixed queue", "Toggle bridge test", "steer: …" and "getApiKey pin", plus their jobs: 121 chat files on 2026-11-01, and the pattern goes back to 2026-10-27, so it predates the workspace work. It adds to the folder and touches no other file I found. Which tests isn't pinned down, beyond that only 59 of 306 test files mention `LH_DATA_DIR`. Not fixed and nothing deleted, since `data/` was to be left alone. The owner should decide whether to clean it and make the suite isolate itself.
