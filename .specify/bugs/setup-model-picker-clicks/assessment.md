# Bug Assessment: Setup dialog model picker doesn't respond to clicks

- **Slug**: setup-model-picker-clicks
- **Created**: 2026-11-11
- **Source**: pasted text (owner relaying a user report)
- **Verdict**: valid (reproduced)
- **Severity**: high (blocks first-run setup on desktop for users without reduced motion; live since feature 025)

## Report

"one user mentioned that the model picker during introduction setup doesn't respond to clicks"

## Symptom

In "Set up your models", opening a tier's model picker draws the menu far below and to the right of its trigger, clipped by the dialog. Clicks on the clipped part land on the backdrop and close the dialog, and no model is picked. Expected: the menu opens under the trigger and a click picks the model.

## Reproduction

1. Desktop browser (1440×900), motion not reduced, any mode (local or hosted), a provider key present, no models chosen.
2. Click "Set up your models", then the Strong "Pick a model…" trigger.
3. The menu appears offset by the dialog's top-left corner (≈ +400, +160 px) and clipped. Clicking its third option hits `setup-backdrop`.
(Phone layouts and reduced motion are unaffected; Playwright's actionability-assisted `click()` on the first option also happens to succeed, which hid it from earlier tests.)

## Root cause

`app/paper.css` `.lh-paper .lh-dialog { animation: 0.2s var(--ease-menu) both nb-menu-in; }`. The keyframes end at `transform: none`, but with fill mode `both` the filled end value is the interpolated identity (`matrix(1, 0, 0, 1, 0, 0)`), not `none`. A transform other than `none` makes the dialog the containing block for `position: fixed` descendants. MenuShell portals menus into the dialog (MenuPortalContext) and places them with `position: fixed` viewport coordinates, so they are offset by the dialog's position and clipped by its `overflow: hidden`.

Same pattern: `.lh-paper :is(.lh-layer-dialog, .nb-export)[data-state="open"], .lh-paper .nb-settings { animation: 220ms var(--spring-soft) both lh-dialog-rise; }` (Settings and other dialogs that host MenuShell menus).

## Remediation

Preferred: change these dialog-container animations' fill mode from `both` to `backwards`. The start keyframe still applies before the animation starts; after it ends the element returns to its base style (opacity 1, transform none), identical to the end frame visually, and no longer a containing block.

Alternative: have MenuShell measure the containing block offset and compensate; more code, and it hides the cause.

Tests: Playwright spec `tests/e2e/study/setup-model-picker.spec.ts` picks a model in each tier with raw pointer clicks/taps at the option's coordinates (local and hosted, desktop and phone) and asserts the menu sits next to its trigger; plus a Settings model-picker case.

Risks: none functional; animation look unchanged.
