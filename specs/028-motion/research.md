# Research: One motion language (feature 028)

Sources read: `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`, `.../02-components/link.md` (`transitionTypes`), `.../04-functions/use-router.md` (`push/replace` take `transitionTypes`), Next 16.3.2's compiled React (exports `ViewTransition`), `@types/react/canary.d.ts`, app/paper.css, app/globals.css, components/ui/{dialog,popover,tooltip}.tsx, components/paper/{appearance,chrome}.tsx, components/lh-mark.tsx, components/sidebar.tsx, components/interface-switch.ts, components/keyboard-shortcuts.tsx, components/workspace/tab-strip.tsx, app/(app)/layout.tsx, `~/agent-runs/2026-11-07-unified-redesign/startup-js/startup-js.mjs`.

Facts that shape the decisions:

- `tw-animate-css` is not installed. The shadcn classes `animate-in`, `fade-in-0`, `zoom-in-95`, `slide-in-from-*` on dialog, popover and tooltip match no CSS, so these layers appear and vanish with no motion today. "Replace the shadcn zoom" means removing dead classes and adding the vocabulary, not overriding a running animation.
- The only live view transition is the theme cross-fade (`withThemeFade` in components/paper/appearance.tsx, `::view-transition-old/new(root)` .35s in paper.css).
- The ☰ and wordmark are rendered inside each page's top band (`SidebarToggle`, components/sidebar.tsx; Notebook's own chrome in components/notebook/notebook-app.tsx), not in the root layout. Anything that snapshots "the page" snapshots the chrome too.
- The mark's ring is a filled even-odd annulus path, not a stroke (components/lh-mark.tsx).
- The mode switch is `switchInterface(target, navigate)` → `router.push(href)` (components/interface-switch.ts, keyboard-shortcuts.tsx, sidebar, palette, Notebook's overlay sidebar).
- Cached routes stay in the DOM under React Activity (`display: none`) (feature 027, T001 log). A CSS animation restarts when an element goes from `display: none` to shown.
- Electron 44.9.3 (Chromium 14x) and the system Chromium 157 used by Playwright both support same-document view transitions, transition types, `view-transition-class`, `:active-view-transition-type()` and `linear()`.

## R1. View transitions in Next 16.3 App Router

- **Decision**: Use React's `<ViewTransition>` (`import { ViewTransition } from "react"`, types via `"react/canary"` added to tsconfig.json `types`) with no Next config. In-app navigations pass `transitionTypes`: `["lh-route"]` for links and `router.push` between Study routes, `["lh-mode"]` for the mode switch (`switchInterface`'s navigate callback becomes `(href) => router.push(href, { transitionTypes: ["lh-mode"] })`). Browser back/forward carries no type, so it gets no view transition (row 5's plain ink-in comes from R2's arrival CSS). The `<ViewTransition>` sits in a shared content wrapper (`components/paper/route-content.tsx`) used by each page's content region, never in a layout (layouts persist, so enter/exit never fire there).
- **Rationale**: owner Q2; Next docs: "route navigations are transitions, so `<ViewTransition>` animations activate automatically", and `transitionTypes` exist on `Link` and `push/replace`. `default="none"` keeps refreshes, Suspense reveals and untyped transitions from animating (FR-009).
- **Alternatives**: `document.startViewTransition` by hand around `router.push` (fights React's own transition timing; rejected); the `motion` package (FR-018, constitution Technology; rejected).
- **To verify (T003)**: how `<ViewTransition>` behaves when Next re-shows an Activity-cached route (React treats a reveal as an enter); whether `router.push` from a keydown handler keeps its types. Results go under Decisions before Phase 2.

## R2. Capture only the outgoing page ("live arrival")

- **Decision**: Only the outgoing content is captured. The wrapper's `<ViewTransition exit={{ "lh-route": "lh-lift", "lh-mode": "lh-lift", default: "none" }} enter="none" update="none" default="none">` names the old content only for the exit; the incoming content is never named, so it is live and hit-testable from its first frame. During `lh-route` and `lh-mode` transitions the root is unnamed (`html:active-view-transition-type(lh-route, lh-mode) { view-transition-name: none }`), so the live page (chrome included) renders under the overlay, and the old snapshot lifts (140ms opacity) above it. The incoming content's own motion (route ink-in, mode unfold) is the on-arrival CSS of R6, keyed by an arrival kind the wrapper reads once on mount (`data-lh-arrive="route" | "mode" | "history" | "signature" | "cold"`). `::view-transition { pointer-events: none }` as the owner asked. The chrome is never named.
- **Rationale**: the Next guide warns that "hit-testing still skips named participants … for the transition's duration": naming the chrome (the guide's anchored-header recipe) would make the ☰ deaf for up to 400ms, and naming the new content would swallow the first clicks on it (FR-005, owner Q2 "clicks stay live"). With nothing named but the leaving snapshot, chrome is pixel-identical in both modes (025) and simply stays put (FR-003), and the fallback path is the same CSS minus the lift (US2 AS2).
- **Alternatives**: full-root cross-fade (chrome would fade; rejected); named chrome with `animation: none` (deaf ☰; rejected); new content as `::view-transition-new` with an unfold keyframe (not clickable for 340ms; rejected).

## R3. Platform support and fallback

- **Decision**: Feature-detect nothing in our code: React skips view transitions where `document.startViewTransition` is missing, and the arrival CSS (R6) runs everywhere, so without the platform the only loss is the old page's 140ms lift. `linear()` springs get cubic fallbacks: tokens default to the cubic value and `@supports (animation-timing-function: linear(0, 1))` sets the spring. Safari 18.2+ and Firefox 144+ support same-document transitions and types; older Safari falls back cleanly.
- **Rationale**: FR-023, edge case "platform without view transitions or `linear()`"; one code path for arrival.
- **Test**: Playwright `addInitScript` deletes `Document.prototype.startViewTransition`; routes, mode switch and theme still finish in their final state with no console error (T029).

## R4. The signature mark (ring as one stroke)

- **Decision**: `LhMark` gains an optional `signature` render mode used by the wordmark: the ring's fill is masked by an SVG `<mask>` holding a stroked circle on the ring's centre line (stroke width = ring thickness, `pathLength="1"`, `stroke-dasharray: 1`, `stroke-dashoffset: 1 → 0`, `--motion-mark` 400ms `--ease-draw`); the dot carries `nb-blot-splat` (`--motion-mark-dot` 300ms from 280ms) with `transform-box: fill-box`; the spiral fades in (`nb-fade-in`). Mask ids come from `useId()`. All three animations are CSS keyed on `html[data-lh-arrival="signature"] .nb-wordmark-mark`, so they run from the server-rendered SVG at first paint, before hydration. Without the attribute the mask is complete (dashoffset 0) and the mark is static.
- **Start point and direction** (gate 2 item 4): clockwise from the spiral's open end, so the stroke finishes beside the dot (contract §2). Timings (gate 2 item 1): ring `--motion-mark` 400ms, dot `--motion-mark-dot` 300ms from 280ms.
- **Alternatives**: redraw the mark as strokes (changes the owner's icon geometry; rejected); clip-path conic sweep (not a pen stroke; rejected).

## R5. Once per tab session, without blocking LCP or hydration

- **Decision**: A tiny inline script at the top of `<body>` in app/(app)/layout.tsx and app/(auth)/layout.tsx (the same pattern as the existing tabs bootstrap):
  `try{if(document.visibilityState==="visible"&&!sessionStorage.getItem("lh.motion.signature")){document.documentElement.setAttribute("data-lh-arrival","signature");}sessionStorage.setItem("lh.motion.signature","1")}catch{}`
  The flag is written at once, so a reload during the signature never replays it (FR-012). `<html>` gets `suppressHydrationWarning` (the attribute is not React's). A client `MotionArrival` component (layout) removes the attribute at the first navigation or 900ms after mount, whichever is first, so later mounts never get the signature. The decision logic is a pure function `signatureDecision({ visible, stored })` in src/core/motion.ts, mirrored by the inline string and unit-tested for equality.
- **LCP and hydration**: no JS runs before first paint except that one-line script (<300 bytes HTML); hydration is not delayed. The LCP candidate (the page heading) gets delay 0; Chrome records LCP at its first frame with opacity > 0 (≈1 frame). Measured before/after (quickstart §5), informative.
- **Final state by default** (FR-008): every signature rule applies only under the attribute, with `animation-fill-mode: backwards`; no script, no attribute, no animation. A hidden tab at load never plays it (edge case).
- **Alternatives**: localStorage (would play once ever, against Q4); a React effect that adds a class after hydration (signature would start late and flash finished→hidden; rejected); cookie read on the server (a new server dependency for a cosmetic flag; rejected).

## R6. Once per arrival (FR-009, FR-010, FR-011)

- **Decision**: components/paper/motion-arrival.ts holds a per-page-load registry (`Set<string>`) and two hooks:
  - `useArrival(key)` → `true` on the first mount of that key in this page load; the element gets `data-arrive` and drops it on `animationend`, so an Activity re-show (display none → shown) or a re-render never replays (FR-009).
  - `useNewRows(listKey, ids)` → the ids that appeared after the list's first render (a refresh with equal data returns none); those rows unfold, removed rows lift.
  Staggers use a CSS index `--i` set inline, clamped in CSS (`min(var(--i) * var(--motion-stagger), var(--stagger-cap))`), and apply only to the first N rows (`:nth-child(-n + N)`, N = cap / step), so rows below the fold are already finished (FR-011). Phones (below 640px) use 24ms steps and a 160ms cap (FR-025, gate 2 item 3). A route arrival at Home or the Library is one ink-in that includes the row stagger (gate 2 item 6); the list's own arrival (rows 13, 15) plays only for `signature`, `cold` and data that lands after the route arrived, so nothing animates twice.
  Settled history is never wrapped (transcript turns, answered checks, saved notes): the route wrapper on a lesson animates the band title and the composer only (FR-010, US1 AS4).
- **Alternatives**: IntersectionObserver per row (cost on long lists, scroll-back risk; rejected).

## R7. Replacing the shadcn classes on Radix layers

- **Decision**: In components/ui/dialog.tsx, popover.tsx and tooltip.tsx remove the inert `animate-*`/`zoom-*`/`slide-in-from-*`/`fade-*` classes and the no-op `duration-200`. Popover and tooltip open with `nb-menu-in` (`--motion-quick` `--ease-menu`, transform-origin from Radix's variable); dialogs open with a new `lh-dialog-rise` (6px, scale .98→1, `--spring-soft` 220ms) and the scrim with `nb-fade-in`. Closing uses `data-[state=closed]` `lh-lift` (100ms menus, 120ms dialogs); Radix `Presence` keeps the node until `animationend`.
- **Focus and Escape stay immediate** (FR-005, US4 AS2): the shared `DialogContent` records the opener on open and focuses it in the same task as `onOpenChange(false)`, then `preventDefault`s `onCloseAutoFocus`; closing content gets `pointer-events: none`. Verify (T045) that a second Escape within 50ms closes the next layer; if Radix still routes it to the closing layer, layers with a layer beneath close without an exit animation (exits are short and quiet anyway; FR-004).
- **Alternatives**: install `tw-animate-css` (a dependency, and still generic zoom; rejected by FR-001).

## R8. Tab marker and sliding pills

- **Decision**: One absolutely positioned marker per tab strip (components/workspace/tab-strip.tsx) and per segmented control (components/paper/option-cards.tsx where the catalogue lists it), moved by `transform: translateX() scaleX()` from measured offsets (ResizeObserver), transitioned on `--motion-route`/`--spring-soft` (280ms / 300ms). Not a view transition (a named marker would stop taking clicks; R2).
- **Alternatives**: CSS anchor positioning (not in Safari 17; rejected for now).

## R9. Theme ink soak (owner Q6)

- **Decision**: `withThemeFade(apply, origin?)` calls `document.startViewTransition({ update, types: ["lh-theme"] })` (callback form where the object form is missing), after setting `--lh-soak-x`, `--lh-soak-y` and `--lh-soak-r` (distance to the farthest viewport corner) on `<html>` from the chosen option card's centre (pointer or keyboard). CSS: `html:active-view-transition-type(lh-theme)::view-transition-new(root) { animation: lh-soak var(--motion-soak) var(--ease-unfold) both }`, old snapshot `animation: none`. Shape (gate 2 item 2): a feathered radial mask, `mask-image: radial-gradient(circle at var(--lh-soak-x) var(--lh-soak-y), …)` with a graded edge `--lh-soak-f` wide (five stops; about a sixth of the reach, 64-280px; phase 8, after the lead found the 24px edge read as a crisp circle) and the radius `--lh-soak-p` animated from 0 to `--lh-soak-r` + `--lh-soak-f` (a registered `@property` length; where `@property` is missing, a crisp `clip-path: circle()` of the same radius). The OS switching the system theme has no origin and changes at once, as today (FR-024). Reduced motion: 150ms opacity on the root pair. The demo iframe is not touched (theme bridge unchanged; snapshots never remount; constitution VII).
- **Alternatives**: keep the cross-fade (owner chose the soak); a radial gradient painted over the live page (would hide content under a layer; rejected).

## R10. Reduced motion (owner Q5)

- **Decision**: One `@media (prefers-reduced-motion: reduce)` block at the end of the motion section of app/paper.css maps every arrival class (`[data-arrive]`, `[data-lh-arrive]`, `.nb-ink-in`, `.nb-unfold`, `.nb-settle`, layer open/close) to `lh-fade` (opacity only, ≤150ms, no delay); strokes `stroke-dashoffset: 0`; splats and the mark draw `animation: none`; sliding markers `transition: none`; view-transition pseudos `animation: 150ms linear both nb-fade-in` / `lh-lift`. Existing `animation: none` rules for these classes are rewritten to the fade where the catalogue says so; loops keep their rule (breathing blot rests at .7). DESIGN.md's rule changes in the same phase (FR-022).
- **Test**: emulate reduced motion; every `document.getAnimations()` entry animates opacity only with duration ≤150ms (T036, T075).

## R11. Tokens and existing keyframes

- **Decision**: Tokens from the spec on `html.lh-paper` in app/paper.css (contract §1). Existing literals that equal a token are rewritten to it (`nb-ink-in`, `nb-ink-word`, `nb-unfold`, `nb-blot-splat`, tether tie, pencil, `nb-menu-in`, `nb-chat-in`); literals that equal no token keep their literal value, as the spec's "identical values" rule requires (`ease-out` keyword on `nb-settle`, `nb-side-in`, `nb-fade-in`; `nb-code-in` .42s; sketch pop curves). New keyframes: `lh-lift`, `lh-fade`, `lh-dialog-rise`, `lh-sheet-in`, `lh-soak`, `lh-mark-draw`. Existing names never change.
- **Test**: tests/motion-tokens.test.ts parses paper.css (T010).

## R12. Startup JS budget (FR-019, SC-006, constitution VIII)

- **Decision**: Baseline at HEAD `b0cdb1e` with `~/agent-runs/2026-11-07-unified-redesign/startup-js/startup-js.mjs` (`npm run build`, `next start`, fresh data dir) for `/`, `/chat/new`, `/library` at 1440×900, and a copy of the script at 390×844 for the mobile row, saved to `~/agent-runs/2026-11-09-motion/startup-base*.json`; after the feature `startup-after*.json`. Each route ≤ +5% gzip. Expected additions are small (arrival module, route wrapper, tab marker, dialog focus wrapper, soak origin); `ViewTransition` is already inside React. For reference, after-027 was / 260,575, /chat/new 251,592, /library 269,850 bytes gzip.
- **Alternatives**: none; the constitution fixes the method.

## R13. Layout shift and long tasks (FR-014, FR-017, SC-007)

- **Decision**: Animate transform, opacity, clip-path and stroke-dashoffset only; unfold is a clip reveal of a box already at full size; status lines stack old and new text in one grid cell so the swap never resizes; folder expand and row insert are input-caused (`hadRecentInput`) and the rows themselves reveal by clip-path. Test with a `layout-shift` PerformanceObserver (sum of shifts without recent input = 0 per trigger) and a `longtask` observer under 4× CPU throttle (CDP `Emulation.setCPUThrottlingRate`), no task over 50ms caused by motion code.

## R14. Test strategy

- **Unit** (`node --test` via tsx, no browser): tests/motion-guards.test.ts for src/core/motion.ts (`signatureDecision`, its inline-script twin, `arrivalKind`, `staggerDelay` caps for desktop and phone, `soakOrigin`/radius); tests/motion-tokens.test.ts for app/paper.css (every token and value from the contract, spring fallbacks, reduced-motion block covers every arrival selector, new keyframes touch only allowed properties) and components/ui (no `zoom-`/`slide-in-from-`/`animate-in` left); tests/token-hygiene.test.ts keeps passing.
- **Playwright** (tests/e2e/study/motion.spec.ts, tests/e2e/notebook/mode-switch addition):
  - plays once: fresh context shows `data-lh-arrival="signature"` and a running mark draw; reload shows neither; a new page in a new context plays again;
  - reduced motion: `emulateMedia({ reducedMotion: "reduce" })`, every animation opacity-only and ≤150ms for each catalogue trigger;
  - input never blocked: Mod+K at 50ms after load opens the palette; a click on a Library row 50ms into a route transition navigates; typing during the mode switch lands in the field; Escape twice closes two layers;
  - no layout shift: CLS sum 0 per trigger;
  - fallback: `startViewTransition` removed, every transition ends in its final state, no console errors;
  - chrome still: the ☰/wordmark box is pixel-identical across frames during a mode switch and a route change;
  - interrupt: ten rapid route clicks show the last route, never a queue;
  - demos: the iframe's `load` count is unchanged across mode switch, route change and theme soak.
- Live Electron check of the cold-start signature (constitution: desktop window changes need a live check).
