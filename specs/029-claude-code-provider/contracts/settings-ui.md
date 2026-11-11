# Contract: Settings UI

Settings → Providers (`section-keys`), a new group after "Subscriptions". Built from the fork's `SettingsGroup`, `Toggle`, `ConnectionRow`, `ConnectionFooter`, lazy `ConnectionDialog` and `Button`; paper tokens per DESIGN.md Settings and Dialogs. Copy marked **(O1)**/**(O2)** was approved by the owner at gate 2 (plan.md "Owner answers (gate 2)"); the rest is upstream's.

## Group "External CLI" (`data-testid="group-external-cli"`)

`ClaudeCodeInstallationStatus` (`data-testid="claude-code-installation"`):

1. Row: label "Claude Code", switch `Toggle label="Claude Code"`; locked (faint, not opacity) until settings load or while saving. Default off.
2. Failure line under the row: "Could not load Claude Code settings." / "Could not save Claude Code settings." (`role="alert"`, the fork's settings failure style).
3. Only when on:
   - Status (`role="status"`): "Checking…" / "Not found" / "Version {v} · meets minimum" / "Version {v} · update required" / "Version could not be checked"; beside it "Check again" (outline, `data-testid="claude-code-check-again"`, disabled while checking).
   - Local: "**Install and authenticate Claude Code in your terminal, then select a Claude Code model here.** LearnHarness starts it when needed—no background process required." and "Checks installation/version only—not authentication, model access, or quota. Claude Code controls billing. Requires v2.1.259+. Setup ↗" (link to https://code.claude.com/docs/en/setup, new tab, `rel="noreferrer"`).
   - The upstream line "Verify AI claims independently…" is not rendered (Clarifications).
   - Hosted **(O2)**: the terminal paragraph becomes "Sign in with your own Claude account. Your usage is billed to that account."; "Claude Code controls billing. Requires v2.1.259+." stays without the Setup link; the sign-in row follows.
4. Switching on persists first (`PUT /api/settings/claudeCode`), then probes; switching off aborts a pending probe; saves notify `"claudeCode"` so the model catalog refetches.

## Hosted sign-in row (`ClaudeCodeSignIn`, only when hosted and on)

- `ConnectionRow` label "Claude account" **(O1)**, status text in the children slot, action "Sign in" (outline, `data-testid="claude-code-sign-in"`) when signed out or unchecked, "Sign out" (ghost, `data-testid="claude-code-sign-out"`) when signed in. Status words **(O1)**: "Signed in · Claude subscription", "Signed in · Anthropic Console", "Signed out", "Checking…", "Sign-in status could not be checked".
- Sign out: no confirmation **(O1)**; the row shows "Checking…" until the response.
- After a successful sign-in or sign-out the component notifies `"claudeCode"` on the settings signal, so the model picker refetches and the row re-reads status (O6). Signed-out users still see Claude Code models; sending refuses with "Sign in to Claude Code in Settings → Providers.".

## Sign-in dialog (`ConnectionDialog`, `testid="claude-code-sign-in-dialog"`)

- Title (sr-only `label` plus `.lh-dialog-title`) "Sign in to Claude Code" **(O1)**.
- Step 1, method: two choices, "Claude subscription" / "Anthropic Console" with hints **(O1)**; radio semantics (`role="radiogroup"`, arrow keys), first focused. Footer: Cancel (text action), Continue (`nb-pill`).
- Step 2, code: sentence **(O1)**, link "Open sign-in page ↗" (`target="_blank" rel="noreferrer"`, the server-validated URL only), field `.nb-set-input` labelled "Code" (`autoComplete="off"`, `spellCheck={false}`, `autoCapitalize="off"`), footer Cancel and "Sign in" pill (disabled while empty or submitting; Enter submits). Busy state: `aria-busy`, controls locked, backdrop dismissal off.
- Failure: the server's message under the field (`role="alert"`, `--text-red`), "Start again" returns to step 1. Expiry or nothing pending (409): "This sign-in expired. Start again." **(O1)**.
- Cancel, Escape or backdrop: POST `cancel`, close, focus back to the Sign in button.
- Success: dialog closes, row shows the signed-in status, focus returns to the row's action.
- The code field's value is cleared on close and never kept in any store, URL or log.

## Model menu and stats bar (US3)

- Model menu rows for provider `claude-code`: meta shows "CLI billing" (title "Billing is determined by your Claude Code configuration; LearnHarness does not estimate it.") instead of "$in/$out / 1M"; context column "—" when the catalog has no window.
- Stats bar: context "{used} / {window}" only when the session's latest Claude Code response reported a window for the selected model, else usage only; detail adds "Window reported by Claude Code; may be lower for auto-compaction."; cost label includes "CLI" and never "$0.00".

## Layout and access

320/390/1440 px without overflow; 44px controls on coarse pointers; visible focus; hidden scrollbars in the dialog; Escape closes the dialog before the settings modal; Settings search finds "Claude Code" (hint "External CLI").
