# Verification: page-editing-fixes

- Date: 2026-10-31
- Unit: `tests/page-editing-fixes.test.ts` passes 15 of 15.
  - Covers the rebase on a 409 and on an event; restore when the save failed, when restore failed, and when it succeeded; no duplicate restore; Use latest after a missed newer version; close in a conflict; deleted on event and on write; paged History; the long-page refusal and that edits and short pages still work; formula rows and width.
- Browser: `LH_UI_PAGES_ONLY=1 node scripts/check-library-ui.mjs` printed 18 PASS lines at 1440, 390 and 320 px, including the existing reload, math, restore, two-tab, phone-layer and corpus checks and the new `checkPageFixes`.
  - Run with headless Chromium 1243 and `--no-sandbox`, since the container runs as root.
- Against the code before the fix, `checkPageFixes` fails at the formula check ("three lines, none hidden": rows 1, expected 3). Its first two checks pass on the old code too; they are guards, as the assessment explains for items 4 and 10.
- Full `npm test`: 3366 tests, 3338 pass, 5 fail, 23 skipped.
  - The 5 failures are in tests/tokens-headless.test.ts (4) and tests/subscription-auth.test.ts (1). They fail the same way on af12eac without these changes, so they are not caused by this fix.
- `tsc --noEmit` and eslint on the changed files pass.
- Not checked: Safari and Firefox in a real browser. The formula fix is covered there by the unit test of `fitMathSource` only.
