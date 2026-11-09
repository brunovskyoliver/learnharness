# Data model: One motion language (feature 028)

No learner data, no stored format, no settings key and no migration. Everything below is per tab or per page load, and losing it only means an animation plays or does not.

## Signature flag (per tab session)

| Field | Where | Value | Written | Read |
|---|---|---|---|---|
| `lh.motion.signature` | `sessionStorage` | `"1"` | by the inline body script on every cold load, before first paint (R5) | by the same script on the next cold load in this tab |

- Lifetime: the tab (survives reloads and in-app navigation, gone with the tab; a new tab or window starts without it). Not tenant data; never sent to the server.
- Storage unavailable (private mode quirks, blocked storage): the script's `try` fails closed: no signature attribute, the page appears in its final state with the route ink-in.

## Arrival attribute (per document, transient)

| Attribute | On | Values | Set | Cleared |
|---|---|---|---|---|
| `data-lh-arrival` | `<html>` | `signature` | inline script, when the flag is absent and `document.visibilityState === "visible"` | `MotionArrival` (layout client component): first navigation or 900ms after mount, whichever is first |

State transitions: absent → `signature` (cold load, first in tab, visible) → absent (navigation or timeout). Never set again in that document.

## Arrival kind (per mount of a content region)

`data-lh-arrive` on the route content wrapper (`components/paper/route-content.tsx`), read once at mount from the navigation helper's pending kind (src/core/motion.ts `arrivalKind`):

| Kind | When | Motion (contract §3) |
|---|---|---|
| `signature` | first mount while `html[data-lh-arrival=signature]` | rows 1-2 |
| `cold` | first mount without the signature (reload, flag set) | row 4 ink-in |
| `route` | in-app navigation (`lh-route`) | row 4 |
| `mode` | Notebook ⇄ Study (`lh-mode`) | row 3 |
| `history` | browser back/forward (`popstate`) | row 5 |
| `tab` | workspace tab select | row 6 (pane ink-in, no stagger) |

The attribute is removed on `animationend`, so an Activity re-show never replays it.

## Arrival registry (per page load, in memory)

`components/paper/motion-arrival.ts`: a module `Set<string>` of keys that have arrived (`sidebar-rows`, `demo:{id}`, `home-section:{id}`, …) and, per list key, the ids present at the list's first render. Cleared only by a full page load. Validation: keys are plain strings built by callers; unknown keys are simply first arrivals.

## Soak origin (per theme change, transient)

CSS custom properties on `<html>` set just before `startViewTransition`: `--lh-soak-x`, `--lh-soak-y` (px, the control's centre) and `--lh-soak-r` (px, distance to the farthest viewport corner). Removed when the transition's `finished` settles.
