# Feature 023: Integration polish
Stage: done, not merged or deployed
Updated: 2026-11-01 (follow-up at the end)

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
- A signed-in request whose host differs from the server's name hung: Next proxied Clerk's rewrite to itself. The check uses `localhost` for both. Corrected below: the Host header plays no part.
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
- Hosted hang, two browser checks' cold cache and `check-library-ui`'s race: resolved, see Follow-up.
- `tests/sampling-panels-headless.test.ts` can flake under load.
- `next-env.d.ts` is rewritten by `next dev` and `next build`; I restored it each time.
- `.next` is 1.6 GB, down from 4.9 GB after removing its dev cache.
- A next-server from an earlier session, PID 1472540, port 3133, still runs from a deleted standalone. Left alone, since this run didn't start it. PID 1264648 is the live deployment's container, untouched.
- **The full test suite writes fixture records into the repo's real `data/`.** Each run adds sessions titled "Fixture mixed queue", "Scratch mixed queue", "Toggle bridge test", "steer: …" and "getApiKey pin", plus their jobs: 121 chat files on 2026-11-01, and the pattern goes back to 2026-10-27, so it predates the workspace work. It adds to the folder and touches no other file I found. Which tests isn't pinned down, beyond that only 59 of 306 test files mention `LH_DATA_DIR`. Not fixed and nothing deleted, since `data/` was to be left alone. The owner should decide whether to clean it and make the suite isolate itself.


## Addendum after the report
- Every `page_revise` is now held, not only selection-triggered ones (`turnHolds: () => true`), to meet the goal's wording. `tests/page-proposals.test.ts` changed deliberately. This supersedes the report's "what still lands directly" section.
- `npm test` now uses a temporary `LH_DATA_DIR`, so the suite no longer writes the real `data/`. Fixture sessions already written there were left alone.

## Follow-up: open items closed

Evidence: `~/agent-runs/2026-11-01-followup/`. Decisions taken with no questions asked, under the owner's instruction:

- **Filter menus**: the Library's Sort, Type and Folder choices became menus, because a native `<select>`'s open list can't meet "raised-2, 10px, no border". DESIGN.md names a select for the editor's text style and the callout's type, so those stay native.
- **Hosted refusal**: a 503 for `HOSTNAME` of `127.x` or `::1`, rather than a change to Next or Clerk. It reads the variable, so `next dev --hostname 127.0.0.1` isn't covered.
- **Headings**: `.lh-prose` h1 and h2 moved to the type scale (30, 22 at 17 px; were 31.875, 25), in lessons as well as pages, since they share the class. h3 is now the reading size (was 20). One line in `app/globals.css` to reverse.
- **A held row opens by default**, or Review would sit behind its chevron.
- **`practice/20-library.md` not changed**: it's owner-approved and pinned verbatim to a contract ("`page_create` and `page_revise` write pages"). The tool's description and result say it's held. Worth rewording when the owner next reads it.

### `check-library-ui`: one product bug, four script races

Reproduced on unchanged code: passes 1 of 3 (74 PASS once; failed at 1140 with 26 PASS, and at 1367 with 33 PASS). Failures moved around, so each got its own evidence, from an instrumented copy under load.

| Failure | Kind | Evidence | Fix |
| --- | --- | --- | --- |
| 1140, placeholder missing; 1367, change bar never shows | Script | The pane restores the last open page by design, after hydration. Captured: the editor held `Tools 390`'s text at the 320 step. The script's loop stopped on "a pane exists", so it checked the wrong page | Opens by name and waits for that name |
| 1579, row missing; click at 1590 "not clickable"; `[data-chat-id]` missing; "Node is detached" | Script | Per-frame timeline: under `next dev` rows sit in hidden `S:0`, then a client render replaces them (2 roots, 1 visible, then 1). In production that happened on the cold first load of 6. No hydration error, no blank frame caught, no console output | Waits until React owns visible rows. I didn't catch the "missing" variant in a timeline, only its siblings on the same step |
| Settings dialog never opens | Script | A click before hydration, under load | Waits until React owns the control |
| `checkPageAndDemo`, restored page gone | **Product** | A child's effect runs before the provider's, so on a client render the question's demo saw no page, opened, and closed the page for good. Breaks DESIGN.md's "doesn't replace an open page". `tests/question-demo-auto-open.test.tsx` failed before the fix (`actual: ['demo_1']`) | `restored` on the pane, and the automatic open waits for it |

Result: **5 consecutive passes, 74 PASS each**, full flow, under 2 CPU burners (05:26-05:48).

### `smoke-demo-workspace`
On `main` (`31a3c73`): fails. Symlinked `node_modules` failed Turbopack ("Symlink ... points out of the filesystem root"), so the worktree used a hard-linked copy instead. Unmodified it failed 3 of 3 warm runs at line 45, clicking while the demo glided. With that step skipped it stalled at `stats-model`, so the stall predates this work. Cause: no model slots, so the composer shows "Set up your models". Fix: the golden settings' slots, a fake key, a wait for the demo to settle, and a guard that refuses and lists any model provider. **All later steps then passed, with no product change.** Worktree removed.

### Cold cache
From an empty `.next/dev`: `smoke-sidebar-ui` failed at line 64, navigation timeout of 5000 ms, confirming the cause. `check-library-folders-ui` passed unfixed cold twice, once under load, so its failure didn't reproduce; the earlier log shows the same step, line 45, waiting after a click. Fix: navigation budget of 180 s and waits for React to own the element. Assertions unchanged. Both pass cold.

### Hosted hang: real, wider than reported, not reachable on the image
- Cause: `next/dist/server/web/next-url.js` renames `127.x` and `[::1]` to `localhost` in the middleware's URL. Clerk's `decorateRequest` turns every pass-through into a rewrite to that URL. `resolve-routes.js` compares its origin against `http://{bound hostname}:{port}`, sees a difference and proxies, to itself.
- **The earlier description was wrong.** The Host header plays no part: matrix in `hosted/matrix-head*.txt`. `HOSTNAME=localhost`, `0.0.0.0` and a real address answered 200 for every Host, and `127.0.0.1`, `::1` looped for every Host: about 300 self-requests in 6 s. With `x-forwarded-proto: https` it failed fast with a 500 instead. `127.0.0.2` returned 500 for every case. It isn't only signed-in requests: the public `/sign-in` too, with `CLERK_JWT_KEY` unset.
- Predates the work: on `main` with hosted `next dev --hostname 127.0.0.1`, `/sign-in` gave a 500 after 30 s, and 200 with `0.0.0.0`. The `CLERK_JWT_KEY` change plays no part.
- Production: `Dockerfile` sets `HOSTNAME=0.0.0.0`; `compose.yaml` doesn't override it unless `.env.hosted` does; `deploy/Caddyfile` is a plain `reverse_proxy app:3000`. So it can't happen on the documented setup, unless someone sets `HOSTNAME` to a loopback address. Read from the repo only: the live system's own compose file and environment weren't opened.
- Fix: hosted mode answers 503 with the reason. `check-hosted-tenants` now sends Caddy's headers, and covers `0.0.0.0` and the refusal. Separately fixed a race there: no-session could read an empty document mid-redirect.

### UI review, features 011-018

**Skills, exactly**: `web-design-guidelines` loaded. Its WebFetch returned a summary, so I took the verbatim rules with `curl` from the same URL (191 lines) and checked against those. `impeccable` loaded: `context`, the audit playbook, craft floor, and `detect` over these files. `shadcn` loaded: its guidance only, with no registry fetch or CLI use, and it would have me use `Select`, which isn't installed; radix `DropdownMenu` was already in use for these menus and adds no dependency.

**Method**: an audit script drove each surface at 320, 390 and 1440, and with `emulateMediaFeatures` reduced motion at 390 and 1440, measuring overflow, scrollbars, targets, names, sizes, shadows and running motion. Two rounds. Screenshots read: Library rows, More menu, page with bubble and Links panel, palette, sidebar tree, right pane, passage dialog, ordinary-turn row.

| Finding | Source | Outcome |
| --- | --- | --- |
| Native `<select>` for Sort, Type, Folder: open list breaks the menu rules | DESIGN | **Fixed**, menus; keyboard, panel and focus return asserted in `check-documents-ui` |
| ~all `transition-*` still ran under reduced motion (sidebar, rows, tabs, pills, controls) | DESIGN, both skills | **Fixed**, one global rule. Second round: no transition or animation running |
| Focus fell to `<body>` after a dialog opened from a row's menu | Constitution VI | **Fixed**, back to the row's ⋯ |
| Line dividers in the toolbar and bubble | DESIGN, no structural lines | **Fixed**, spacing |
| Headings off the scale in pages and lessons, 31.875 and 25 | DESIGN | **Fixed**, see Decisions |
| Empty-state text at 16 px | DESIGN | **Fixed**, 15 |
| Coarse targets under 44: view pill, selection checkbox, phone header icons (40), dialog ×, sidebar Home, coverage ring, copy | Constitution VI | **Fixed** |
| Coverage ring had no name | Guidelines | **Fixed** |
| Search fields measured 22 px high | Audit | No change: the 44 px label is the target |
| Chat title in the top bar, 26 px high on phones; `prompt-setup` at 14 px; `--text-sm` 13.005 | Audit | Left: outside 011-018, or within rounding |
| Text style and callout type are native selects | DESIGN | No change: DESIGN.md names a select. Their open list is the system's |
| Title Case; "…" placeholder patterns | Guidelines | No change: DESIGN.md wins |
| `autoFocus` in the passage dialog raises a phone's keyboard | Guidelines | Left: it's the dialog's one field |
| No skip link; filter state isn't in the URL | Guidelines | Left: filters persist per browser by design. Skip link is an owner call |
| `layout-transition` at `globals.css:42`, the sidebar's width | Detector | Left: predates these features, and off under reduced motion |
| Wiki links, callouts, Links panel, passage dialog, tabs, palette, sidebar tree | Screenshots and measures | No finding |

### Held edits surface
Previously a proposal's Review sat inside a collapsed row, so a tutor edit from an ordinary turn could go unnoticed in the chat. Fixed. `checkOrdinaryTurnProposal` in `check-notes-ui`, at 1440, 390 and 320: an `outcome: "proposed"` row shows Review with no click, it opens the review, the Library lists it and the page shows its line. Row seeded from the tool's real result shape; the proposal is from the real store. **A live update from a real tool call during a turn isn't browser-tested**; `announce` emits `library-changed`, which the line listens for.

### Two checks that passed by doing nothing
`check-session-state-ui.mjs` and `check-turn-navigation-ui.mjs` only export functions for `smoke-dock-ui.mjs`. Run directly, they exited 0 in 0 s with empty logs, so **the earlier "pass" for both in this file's Final verification, and in my first pass here, meant nothing**. Both now run their part of the dock smoke when run directly (`LH_UI_STATE_ONLY`, new `LH_UI_TURN_NAV_ONLY`).

Running them for real found a **product bug**, on `main` since `0328bf6`: a rail jump in a long session stopped partway. Positions 24609, 20289, 16213, 13169, then 13918 and still, against a target near 587. Offscreen rows taking their real height made the browser's scroll anchoring move the scroller, which the animation treats as someone else's scroll, and cancels. A jump now turns off `overflow-anchor` while it runs; the target is measured each frame. Gestures still cancel it. `check-turn-navigation-ui` covers it.

The whole `smoke-dock-ui` (not on the requested list) still fails at line 359, "lesson wheel input scrolls natively". It also needs a key in the environment since `setup-cta` changed. Not investigated, not fixed.

Later races, found by the final passes and fixed in the scripts: `check-notes-ui`, a phone's pane toggle clicked before hydration, 1 failure in 4 runs; `check-workspace-ui`, a composer handle detached by a client render, 1 of 4; `check-review-ui`, a rating key in the same frame as the answer, 2 of about 5, then 8 of 8 passed. For that last one the screen state was captured, the answer still showing and no rating; the stale handler is from reading the code, not shown directly. A person can't press a key that fast, so the product wasn't changed.

### Final verification, on `6a2dd7c` (commits after it are this file only)

Evidence: `~/agent-runs/2026-11-01-followup/final/`. All commands were run in one sequential pass, none failing.

| Command | Result |
| --- | --- |
| `npx tsc --noEmit`, `npx eslint .` | clean, no output |
| `npm test` | 3875 tests, 3873 pass, 0 fail, 2 skipped |
| `npx next build`, `build-server.mjs`, `smoke-server.mjs` | pass, 4 tracing warnings as before; no `data/` in the standalone |
| `check-library-folders-ui`, `check-workspace-ui`, `check-notes-ui`, `check-documents-ui`, `check-diagrams-ui` (57 PASS), `check-review-ui`, `smoke-sidebar-ui` (8), `smoke-demo-workspace`, `check-transcript-scroll-ui` | pass |
| `check-library-ui` | pass, 74 PASS |
| `check-session-state-ui` (7 PASS), `check-turn-navigation-ui` (6 PASS) | pass, now really running |
| `check-hosted-tenants` | pass |
| `smoke-server --electron`, `check-electron-shell` | pass, with GTK from the `gnome-46-2404` snap and `libwayland` unpacked to a temp folder, since removed. Without them Electron can't load `libgtk-3` here |

Earlier passes on earlier commits had the failures above, in `final-earlier/` and `final-2/`. `git diff main -- tests/fixtures/golden-data` is empty. No file in `data/` changed in this run.

### Still unverified
- A real tool call in a live turn surfacing its row and line: seeded from the tool's result shape, and from the real store.
- The whole `smoke-dock-ui`: fails at line 359, unexplained, not on the list.
- Production `HOSTNAME` on the live system: repo files only.
- Everything under "Hosted: not verified" and "Electron: not verified" above.
- Intermittent races may remain in scripts other than those fixed. Each pass here had at most a new one or two until the last.
- `practice/20-library.md` still says page tools "write pages". Also the bar and "Updated by the agent" paths in `DESIGN.md` describe code kept for older versions and outside updates.

## Independent re-check on e9dc835
- `npm test`: 3875 tests, 3872 pass, 1 fail, 2 skipped. The failure, `tests/browser-service-readiness.test.ts` "readiness left an HTTP connection open", is a timing flake in a test from 3d70e0d that this work doesn't touch: 5 of 5 passes alone.
- `scripts/smoke-dock-ui.mjs`, run whole: 2 of 2 failures at line 134, no `setup-cta` element. An earlier run failed at line 359. Not investigated; not known whether it predates this work.

## Second re-check: `smoke-dock-ui`
- Line 134 (`setup-cta`): the script seeded no key, so the app rightly showed the zero-keys button. Fixed with a fake key, as the other checks use.
- Line 359 (wheel): the lesson scrolled the full 120px, but the cursor sat over a demo iframe, whose document took the event. Script artifact. It now aims at a lesson paragraph; the assertion is unchanged.
- Product bug fixed in `components/chat.tsx`: "Scroll to latest" stopped about 10,000px short in a long session (trace: scrollTop stuck at 27438 with a 10754px gap). Scroll anchoring cancels the motion, the same cause as the rail jump. The motion now disables anchoring.
- `tests/browser-service-readiness.test.ts`: the idle wait is 5s, not 1s, and returns as soon as sockets close. It failed under load only.
- **Open, not root-caused:** `check-streaming-ui.mjs:102`, completion alignment. The whole script passed 1 of 2 final runs (29 PASS, exit 0); the other failed with the answer at -186 instead of 16. Disabling anchoring there did not help and was reverted. A probe showed two elements with the same `data-answer-part-id` (`stream_reading_1-t0`), 509px apart. It is not established whether that duplicate happens in real turns or comes from the script's faked record and stream, nor whether it causes the misalignment. Not tested on `main`.

## Root cause: completion alignment (replaces the open finding above)
Two product bugs, each shown by trace:
- **Alignment skipped after opening a session.** With the page at the very bottom (gap 1, no scroll button), use-stick-to-bottom still reported `escapedFromLock` and not at bottom, and a turn's start resized the composer (gap 43). `TurnReadingPosition` read that as "the learner scrolled away", so it stood down and the view followed to the bottom. It now also needs a real distance of 70px or more, the library's own meaning of "at the bottom". Check at line 102 failed 5 of 6 before, passed 8 of 8 after.
- **Duplicate message.** `adoptRecord` kept a live tail message that the record also held, rendering it twice with one id. The record's copy now yields to the live one (`tests/session-core.test.ts`). `check-streaming-ui` clicked a Scroll to latest button that only existed because of the duplicate's extra height, so that click is now conditional; the bottom assertion stays.
