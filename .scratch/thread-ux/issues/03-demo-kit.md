# Demo kit: spec-driven demos with Vega-Lite, Plotly and React Flow

Requested 2026-10-27. Oliver chose option 1 from the library review: in-app spec tools, MCP-shaped so they can later be wrapped as an MCP Apps server.

## Decisions (Oliver, 2026-10-27)

- Renderers: Vega-Lite, Plotly (3D and contours) and React Flow.
- Logic: JS expressions for derived values plus an optional small `step` function for Step/Run processes. Runs inside the existing sandboxed iframe.
- The builder uses the kit first and falls back to custom HTML when the kit can't express the brief.
- The builder reviews a headless screenshot before delivering. The demo builder moves to the vision model slot.

## Plan

1. Spec (`src/core/demo-kit.ts`, TypeBox schema): `params` (slider, select, toggle), `state` init expressions, optional `step`, `stopWhen`, `run`, `derived`, and `panels`: `chart` (Vega-Lite spec plus named datasets from expressions), `plot3d` (Plotly traces expression plus layout), `flow` (nodes and edges expressions, automatic layered layout), `readouts`, `table`, `note`. Expressions see `p`, `s`, `d`, `range()` and `Math`. `kitDemoHtml(spec)` produces the stored HTML, which embeds the spec and loads `/demo-kit/runtime.js`, so storage, the panel, inversion and downloads keep working unchanged.
2. Runtime (`src/demo-kit/`, built by `scripts/build-demo-kit.mjs` with esbuild into git-ignored `public/demo-kit/`): a small core, with Vega, Plotly and React Flow loaded only when a panel needs them. Themed from the injected `--lh-*` variables. Exposes `window.__lhKit` with a self-test (steps, parameter extremes) for the headless check.
3. Build wiring: `dev`, `build`, `desktop:dist` and the Dockerfile run the kit build before Next.
4. Builder: `write_kit_demo({ spec })` validates the schema and compiles every expression; `run_demo` runs the kit self-test and returns a screenshot image; the prompt documents the spec and the fallback; default role slot `vision`.
5. Headless: rewrite `/demo-kit/` script URLs to the local `public/demo-kit/` files, run the self-test, take the screenshot.
6. Tests: schema, HTML escaping, layout, expression compile errors. Browser check: a kit demo per panel type rendered in the lesson and the panel, at 24px.

## Status

Implementation: complete and verified locally. Deployed 2026-10-27 (see below).

## What changed

- Spec and validation: `src/core/demo-kit.ts` (TypeBox schema, `validateDemoKitSpec` compiles every expression without running it, `kitDemoHtml`, `kitSpecOf`), `src/core/demo-kit-layout.ts` (layered layout for flow panels).
- Runtime: `src/demo-kit/runtime.ts` (controls, state, Step/Run/Reset, derived values, panels, `window.__lhKit.selfTest()`), `vega-entry.ts`, `flow-entry.tsx`. `scripts/build-demo-kit.mjs` builds classic IIFE scripts into git-ignored `public/demo-kit/`: runtime.js 13 KB, vega.js 781 KB, flow.js 375 KB + flow.css, plotly.js 4.8 MB (copied). Each library loads only when a panel needs it. Charts follow the app theme; 3D scenes get no margins; numbers use a trimmed format; React Flow keeps wheel scrolling for the lesson and never zooms text below 90%.
- Build wiring: `dev`, `build`, `desktop:dev`, `desktop:dist` scripts and the Dockerfile run the kit build first. New dependencies: `vega`, `vega-lite`, `plotly.js-dist-min`; `esbuild` pinned as a dev dependency (it was already installed via tsx).
- Headless: `/demo-kit/` URLs point at the built folder (repo or standalone), the kit self-test runs 30 steps and sweeps every control, failures surface as page errors, `screenshot: true` returns a full-page PNG at 900px.
- Builder: `write_kit_demo({ spec })` with validation; `run_demo` returns the screenshot as an image and the self-test summary; the prompt documents the spec with a worked example, the HTML fallback, and loading the bundled libraries instead of CDNs. Demo builder now uses the vision slot (`ROLE_SLOT`).
- Teacher prompt lists what the kit can draw. Downloads include the theme and absolute script and font URLs.

## Verification

- `npm test` with isolated data: 2445/2445 (new `tests/demo-kit.test.ts`, 10 tests; slot-tier test updated for the vision role). Typecheck, lint, `git diff --check`, and `npm run build` (kit + Next production build) pass.
- Real headless Chrome via `getHeadless().runDemo`: three sample specs (gradient descent with Vega-Lite and readouts; loss surface and contours with Plotly; backprop graph with React Flow) validate, pass, run 30 self-test steps each with no errors. Screenshots in `~/agent-runs/2026-10-27-learning-workflow-audit/kit/`.
- In the app (data copy plus a sample session built with `buildSubagentSteer`, scripts in the same folder): all three render in the transcript with the app font (LH Sans loaded inside the sandbox); Vega SVGs, two Plotly plots and six React Flow nodes drawn; the bold title "Gradient descent on one weight" opens the panel, choosing 0.75 and Run advances the steps; every `/demo-kit/` and font request 200; no page errors. Your real session logs no console errors.

## Remaining

- No demo has been built by the model with the new prompt yet; that needs a model run on the server.
- Not tested: Electron packaged app (public/demo-kit is copied by build-server.mjs, and headless resolves it from cwd), hosted mode behind Clerk (.js and .css are outside the proxy matcher).
- Plotly is 4.8 MB uncompressed for demos that use it; a partial Plotly bundle could cut that later.
- MCP Apps wrapping (option 2) not started; tool names and JSON schemas are kept MCP-shaped.
- GitHub push and merge into local `main` not done.

## Deployment, 2026-10-27

Oliver asked to commit and deploy tickets 02 and 03 together.

- Implementation: commit `287e52b0f01b6ab827af2fb108ad4272578f4804` on local branch `thread-ux-demo-kit` (local `main` unchanged at `bdcbd1b`). Transferred by temporary git bundle; VM `~/learnharness/src` and `~/learnharness.git` main fast-forwarded from `b3a2836`. GitHub not pushed, no PR or merge.
- Build on the VM: `learnharness:demo-kit-20261027-287e52b`, also `learnharness:amd64`, `sha256:52ca840e8411db8386afe2c81aa434b4543538fb0606a7dac1cd04d453449b21`. Kit build, Next build and server payload steps passed; image contains `public/demo-kit/` and the Source Sans 3 font.
- Smoke in the image's Chromium: a kit demo loaded from `file://` drew its chart and readout.
- Deployment: `docker compose up -d --no-deps --no-build app`; running, 0 restarts, Ready. Other containers untouched.
- Live checks at https://learn.brunovsky.online: `/` 307, `/sign-in` 200, `/api/chats` 401, `/demo-kit/runtime.js`, `vega.js`, `plotly.js`, `flow.css` 200, font 200 with `Access-Control-Allow-Origin: *`; the live stylesheet contains the new session scale, heading, table fade and composer rules.
- Not exercised: signed-in production use, and a demo built by the model with the new builder.
- Rollback: `cd ~/learnharness && docker tag learnharness:rollback-demo-kit-20261027 learnharness:amd64 && docker compose up -d --no-deps --no-build app` (image `sha256:d720c758…`, source `b3a2836`). VM record: `~/agent-runs/2026-10-27-demo-kit-deploy/`.
- VM disk: 12 GB free after the build (was 16 GB); build cache left in place.
