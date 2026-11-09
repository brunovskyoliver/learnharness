# Feature 028: Motion
Stage: analyze-gate
Updated: 2026-11-09T13:00:00Z

## Decisions
- Owner gate 1 (2026-11-09, every recommendation):
  - Q1 B: expressive at arrivals, quiet in routine; one cold-load signature; route and tab changes ≤300ms.
  - Q2 A: view transitions (React `<ViewTransition>`, Link/router `transitionTypes`) for routes and the Notebook ⇄ Study switch; on-arrival keyframes as the fallback; clicks stay live (`::view-transition { pointer-events: none }`).
  - Q3 A: signature = the mark's ring draws as one stroke, the dot splats, content inks in in reading order.
  - Q4 A: signature once per tab session (sessionStorage); later navigations use the route ink-in.
  - Q5 A: reduced motion keeps fades ≤150ms and colour changes; no movement, strokes or splats; DESIGN.md updated accordingly (owner-approved change).
  - Q6 A: theme change becomes the ink soak from the control (~450ms view transition, clip-path/mask), replacing the .35s cross-fade; reduced motion fades ≤150ms.
  - Recorded default: phones get the same motion with shorter staggers.
- Agent (plan, reversible): technical choices R1-R14 in research.md. Items that need the owner at gate 2 are in plan.md, "Owner review at gate 2".
- Agent (facts found while planning): `tw-animate-css` is not installed, so the shadcn `animate-in`/`zoom-in-95`/`slide-in-from-*` classes on components/ui dialog, popover and tooltip are inert today (those layers appear with no motion); the only live view transition is the theme cross-fade (components/paper/appearance.tsx `withThemeFade`). The wordmark ring is a filled even-odd annulus, not a stroke (components/lh-mark.tsx), so "draws as one stroke" needs a stroked mask (R4). Chrome (☰ + wordmark) is rendered inside each page's top band (components/sidebar.tsx `SidebarToggle`), not in the layout (R2). React's `ViewTransition` ships in Next 16.3.2's compiled React; its types are in `@types/react/canary`.

## Log
- 2026-11-09: gate 1 encoded in spec.md (Clarifications, catalogue reduced-motion column, row 23, `--motion-soak`, FR-012, FR-013, FR-022, FR-023-FR-025, Assumptions). Checklist re-validated.
- 2026-11-09: plan.md, research.md, data-model.md, contracts/motion-contract.md, quickstart.md written; Constitution Check passes (I-VIII).
- 2026-11-09: tasks.md written (T001-T084, 8 phases). speckit-analyze (read-only): 0 critical, 2 high, 7 medium, 4 low; constitution I-VIII aligned; every FR has a task except the test gaps in M6.
  - H1: rows 1-2 finish at 840ms (dot) and 760ms (last row) against FR-006/SC-001's 600ms. Fix: gate 2 item 1 (compressed timings) or relax FR-006.
  - H2: rows 13 and 15 (520ms ink + 240/160ms stagger = 760/680ms) and row 19 (axes 600ms then data 520ms ≈ 1.1s) also break FR-006. Fix: same choice as H1 (ink 360ms; plot data from 240ms) or exempt arrivals after data load.
  - M1-M3: gate 2 items 5, 3, 2. M4: rows 4 vs 13/15 precedence on a route arrival at Home/Library (proposed: route ink-in wins; list stagger only on the signature and when data lands later). M5: SC-002's 20 trials per surface not in T019/T031/T038/T045. M6: no test for FR-008 (no-JS final state), FR-004 (exits ≤160ms opacity-only) or chrome stillness on route changes (T038). M7: edge case "skip the signature if not interactive in time" has no mechanism in the CSS-only design (proposed: drop the clause).
  - L1: Overview says shadcn fades/zooms run today; they are inert. L2: `ease-out` keyword literals stay literal. L3: no touch-press test (FR-016). L4: ring start point (gate 2 item 4).
- Checklist requirements.md: 16/16 pass.

## Report
