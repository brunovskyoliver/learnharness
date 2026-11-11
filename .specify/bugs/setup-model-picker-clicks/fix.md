# Fix: Setup dialog model picker doesn't respond to clicks

- **Slug**: setup-model-picker-clicks
- **Fixed**: 2026-11-11

## Summary

Dialog containers' open animations now fill `backwards` instead of `both`, so after opening they carry no transform and menus portaled into them are placed against the viewport again.

## Changes

- `app/paper.css`: `.lh-paper .lh-dialog` (setup and other `lh-dialog` dialogs) and `.lh-paper :is(.lh-layer-dialog, .nb-export)[data-state="open"], .lh-paper .nb-settings` (Settings, shared dialogs, export): `both` → `backwards`, with a comment naming this bug.

## Tests Added or Updated

- `tests/e2e/study/setup-model-picker.spec.ts`: setup dialog on desktop (mouse) and phone (touch) picks a model in all three tiers with raw pointer input at the option's coordinates, asserting the menu opens against its trigger and the dialog stays open; Settings → Agent strong model menu the same way on desktop. All three failed before the fix (menu offset by the dialog's corner) and pass after.

## Local Verification

- Before the fix (CSS stashed): 3/3 new cases fail ("menu opens against its trigger").
- After: new spec plus `settings.spec.ts` and `claude-code-settings.spec.ts`: 18 passed.
- Full Playwright suite and `npm test`: see the bug's progress entry in specs/029 Report / commit message.

## Deviations from Assessment

- The phone layout was also affected (assessment said unaffected); the new test covers it.

## Follow-ups

- Menus portaled into any future animated container need the same rule; the comment in paper.css says why.
