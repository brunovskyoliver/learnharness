# Implementation Plan: One motion language (ink in motion)

**Branch**: `unified-redesign` (harness worktree; no branch of its own) | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/028-motion/spec.md` (gate 1 answered 2026-11-09)

## Summary

Extend feature 024's ink vocabulary (draw, ink in, unfold, blot, lift) to the whole app as named motion tokens on the paper root and a 30-row catalogue. The one authored moment is the cold-load signature: the wordmark ring draws as a pen stroke, its dot splats, and the page inks in in reading order, once per tab session (a one-line inline script and a session-storage flag, CSS-only from first paint). Routes and the Notebook ⇄ Study switch use React `<ViewTransition>` with Next's `transitionTypes`, but only the outgoing page is captured: it lifts over the live incoming page, which inks in or unfolds through on-arrival CSS, so chrome and new content stay clickable and the same CSS is the fallback. Radix layers lose their inert shadcn classes and get the vocabulary with immediate focus return. The theme cross-fade becomes the ink soak from the chosen card. Reduced motion keeps ≤150ms opacity fades only. No new dependency.

## Technical Context

**Language/Version**: TypeScript 5, React 19.2 (Next 16.3.2's compiled React exports `ViewTransition`; types from `@types/react/canary`), Next.js 16.3.2 App Router (docs read: view-transitions guide, `Link transitionTypes`, `useRouter` push/replace options)

**Primary Dependencies**: existing only: Radix via components/ui, Tailwind CSS v4, app/paper.css keyframes. `motion` stays unused by this feature. No new runtime dependency.

**Storage**: none persistent. `sessionStorage["lh.motion.signature"]` per tab (data-model.md); never learner data.

**Testing**: `node --test` via `tsx` (tests/*.test.ts), Playwright `study` and `notebook` projects (tests/e2e), `tests/token-hygiene.test.ts`, `tests/startup-module-graph.test.ts`, startup-js.mjs benchmark, live Electron check.

**Target Platform**: Chromium (Electron 44, system Chromium 157), Safari 18.2+ and Firefox 144+ with view transitions; older engines fall back to arrival CSS (R3).

**Project Type**: web app (Next.js) with an Electron shell and hosted mode.

**Performance Goals**: startup JS on `/`, `/chat/new`, `/library` within +5% gzip of HEAD `b0cdb1e` (R12); CLS 0 from motion; no long task >50ms from motion code on the throttled mobile profile; routes and tabs ≤300ms, mode ≤400ms, signature text solid ≤600ms.

**Constraints**: transform, opacity, clip-path, mask, stroke-dashoffset only; input live during every animation; settled history never animates; demos never reload; hidden scrollbars; reduced motion per gate 1 Q5; print shows final states.

**Scale/Scope**: 30 catalogue rows across chrome, five Study routes, Notebook, layers, Home, Library, lessons, checks, demos, Review, Settings, auth screens.

## Constitution Check

*Gate before Phase 0; re-checked after Phase 1.*

| Principle | Status | Notes |
|---|---|---|
| I Owner decides | Pass | Gate 1 (Q1-Q6 + phones) recorded in spec Clarifications. Gate 2 answered `go` 2026-11-09 (items 1-7 below, spec Clarifications); items still open after gate 2 are listed under "Open after gate 2" and their tasks wait; technical choices are research R1-R14 (progress.md Decisions). |
| II Teaching theory first | Pass | No change to lessons, checks, grading, graph or practice. Motion never reveals an answer early (the pencil under a correct grade plays after the grade arrives). |
| III Learner data is never lost | Pass | No stored format. Transitions never remount the transcript, drafts or reading positions (the wrapper animates arrival only; the mode-switch e2e already checks the draft round trip; scroll restoration covered by T044). |
| IV Honest states | Pass | Loading, empty, running and failed stay distinct; skeleton → content and status lines keep their words and only change how they arrive; the waiting blot stays a waiting signal. |
| V Consent before cost | Pass | No model calls, no automatic actions. |
| VI Interface follows DESIGN.md | Pass | DESIGN.md Motion section rewritten in this feature (FR-022, owner-approved Q5/Q6 changes). Existing paper keyframes and components/ui primitives; no parallel components or decorative library. Focus visible and moved at open; Escape innermost first; reduced motion; 44px; 320/390/1440 checks. UI tasks are built with the `shadcn` skill and checked with `impeccable` and `web-design-guidelines` (tasks T079-T080). |
| VII Boundaries, tenancy, sandboxing | Pass | src/core/motion.ts is pure. The sandboxed iframe is not touched; theme soak and transitions never reload it (T037, T067). No server or tenant path changes. |
| VIII Performance | Pass, measured | CSS-first; a one-line inline script; small client modules. Baseline at `b0cdb1e` (T002) and after (T078), desktop and 390px. |

Post-design re-check: unchanged, all pass. No Complexity Tracking entries.

## Owner review at gate 2

Answered `go` on 2026-11-09: every recommendation below is approved, plus items 6 and 7. Tasks marked **(gate 2)** implement these versions.

1. **Signature timing vs FR-006** (contract §2). As specified, the dot ends at 840ms and the last rows at 760ms, but FR-006/SC-001 require everything finished by 600ms. Recommended: keep order and curves, shorten to ring 400ms, dot 300ms from 280ms, ink 360ms with the 40ms/240ms stagger (all done by 600ms). Alternative: keep the values and relax FR-006 to "text legible by 600ms, mark finished by 900ms".
2. **Ink soak edge**: (A, recommended) a feathered radial mask (24px soft edge) growing from the card's centre, reading as ink spreading; (B) a crisp `clip-path: circle()`; both 450ms `--ease-unfold`.
3. **Phone staggers** (FR-025): below 640px, step 24ms and cap 160ms (desktop 40ms / 240ms; sidebar and Library keep their own caps).
4. **Ring stroke start**: clockwise from the spiral's open end, finishing beside the dot.
5. **Lesson route arrival**: only the band title and the composer ink in; the transcript is still (FR-010 applied to row 4).
6. **Route arrival at Home and the Library** (analysis M4): one route ink-in that includes the row stagger; the rows do not animate a second time (rows 13 and 15 play only on the signature, a cold load and when data lands later).
7. **Test gaps and wording** (analysis M5-M7, L1-L3): folded into tasks (T017a no-JS final state, T045a exits ≤160ms opacity-only, T038 chrome stillness on route change, 20 trials per surface for SC-002, touch press in T070); the "skip the signature if not interactive in time" clause is dropped; the Overview now says the shadcn classes are inert.

Approved timings: ring 400ms (`--motion-mark`), dot 300ms from 280ms (`--motion-mark-dot`), arrival ink 360ms (`--motion-arrive`) with 40ms steps capped at 240ms (phones 24ms / 160ms), plot data from 240ms. 024's own tokens (`--motion-ink` 520ms, `--motion-draw` 560ms) keep their values for the Notebook motions that already use them.

## Open after gate 2

These came out of applying gate 2. Both resolved 2026-11-09 (owner intent applied by the lead): O1 A, O2 A; T023-T024 and T060-T061 are unblocked.

- **O1. Route stagger vs the 300ms route budget** (blocks T023, T024): item 6 puts the row stagger inside the route ink-in, so a Home or Library arrival ends at 280ms + 240ms cap = 520ms (phones 280 + 160 = 440ms). That meets FR-006 (600ms) but not SC-003 / US3 AS1 ("routes within 300ms"), and row 4's own "one 40ms step" already ends at 320ms. Options: (A, recommended) SC-003 counts the lift and the heading (both ≤300ms) and FR-006 bounds the rows; (B) compress the route stagger to fit 300ms (for example ink 200ms, 20ms steps, cap 100ms). **Resolved: A.** SC-003's 300ms counts the lift and the heading's ink-in; the row stagger is bounded by FR-006's 600ms.
- **O2. 024 strokes vs "every row ends by 600ms"** (blocks T060-T061): rows 17 and 18 reuse 024 motions longer than 600ms (`nb-ink-word` .64s per streaming word, the pencil underline 800ms under a correct grade). They draw over text that is already readable. Options: (A, recommended) keep 024 timings, since FR-006 measures readability; (B) shorten the new pencil under a grade to 600ms. **Resolved: A.** Rows 17-18 keep 024's durations (exempt from the 600ms cap; the text is readable throughout); everything else ≤600ms.

## Project Structure

### Documentation (this feature)

```text
specs/028-motion/
├── spec.md
├── plan.md                  # this file
├── research.md              # R1-R14
├── data-model.md            # session flag, arrival attribute and registry
├── quickstart.md
├── contracts/
│   └── motion-contract.md   # tokens, signature, catalogue mechanics, VT rules, reduced motion
├── checklists/requirements.md
├── progress.md
└── tasks.md
```

### Source Code (repository root)

```text
app/
├── paper.css                       # tokens, new keyframes, VT rules, arrival rules, reduced motion, print
├── (app)/layout.tsx                # inline signature script, suppressHydrationWarning, <MotionArrival/>
└── (auth)/layout.tsx               # same script
src/core/motion.ts                  # pure: signatureDecision, arrivalKind, staggerDelay, soakOrigin (+ index export)
components/
├── lh-mark.tsx                     # signature mask mode
├── paper/
│   ├── chrome.tsx                  # wordmark signature hook, ☰⇄✕ draw
│   ├── motion-arrival.ts           # registry, useArrival, useNewRows, MotionArrival
│   ├── route-content.tsx           # <ViewTransition> wrapper + data-lh-arrive
│   ├── navigate.ts                 # lh-route / lh-mode push helpers, popstate kind
│   ├── appearance.tsx              # ink soak
│   ├── overlay-sidebar-dialog.tsx  # sheet motion, rows once
│   └── option-cards.tsx            # sliding pill, soak origin
├── ui/{dialog,popover,tooltip,button,skeleton,empty}.tsx
├── interface-switch.ts, keyboard-shortcuts.tsx, sidebar.tsx, command-palette-dialog.tsx
├── workspace/tab-strip.tsx, workspace-pane.tsx
├── home.tsx, waiting-section.tsx, library/*, review/*, artifacts/{demo-card,plot-card}.tsx, study/check-thread.tsx
└── notebook/{notebook-app,settings-modal}.tsx
tsconfig.json                       # "types" gains "react/canary" (ViewTransition types)
tests/
├── motion-guards.test.ts, motion-tokens.test.ts
└── e2e/study/motion.spec.ts (+ helpers), e2e/notebook/smoke.spec.ts additions
DESIGN.md                           # Motion section
```

**Structure Decision**: existing Next.js app layout; pure logic in `src/core`, client motion helpers in `components/paper/` beside the other paper parts.

## Complexity Tracking

None.
