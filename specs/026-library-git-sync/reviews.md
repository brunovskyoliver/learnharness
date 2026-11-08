# Reviews: Library git sync (T054)

2026-11-08. `impeccable` (audit, Operate mode, DESIGN.md governs) and `web-design-guidelines` (Vercel Web Interface Guidelines, fetched fresh) on the feature's Library changes: `repo-link-dialog.tsx`, `repo-details-dialog.tsx`, `repo-status-line.tsx`, `repo-freshness.tsx`, `folder-row.tsx`, `library-row.tsx`, the `library-view.tsx` wiring, `read-only-view.tsx`, `pdf-reader.tsx`, and one `paper.css` rule.

Visual pass: `tests/e2e/study/library-git-sync.spec.ts` with `LH_SHOTS_DIR`. Its per-width tests now run at 320, 390 and 1440 (they ran at 390 and 1440 before), in light and dark. Each one also asserts there's no horizontal overflow. Screenshots are in `~/agent-runs/2026-11-08-library-git-sync/phase7/`: link dialog, linking, refusal, synced, syncing, failed, updated, removed, mirror rows and menu, bulk refusal, @ list, removed reference, details, token field, unlink confirm.

## Fixed

| # | Source | Finding | Fix |
| --- | --- | --- | --- |
| 1 | WIG Forms | Link dialog inputs had no `name`. | `name="repo-url"`, `repo-folderName`, `repo-token`, `repo-branch`. |
| 2 | WIG Forms / a11y | A refusal line under a field was announced (`role="alert"`) but not tied to its field. | Each line has an id. Its field gets `aria-describedby` while it's refused. |
| 3 | WIG Forms ("focus first error") | After a refused submit, focus stayed on the busy Link button. | The refused field takes focus, so screen readers read its sentence with it. Form-level refusals (limit, already linked) keep focus where it is. |
| 4 | impeccable (copy) | The unlink confirm read "its 1 files" for a one-file repo. | "{n} file" when n is 1, the way the status line's skipped count already pluralises. The approved sentence is unchanged for every other n. |
| 5 | impeccable (clarity, seen at 320 dark) | "Show details" on a token failure showed isomorphic-git's `UserCanceledError: The operation was canceled.`, which reads as if the learner cancelled something. | The `auth` failure from a cancelled credential prompt now has the detail "HTTP 401 Unauthorized: the server asked for credentials." (`src/server/repo-git.ts` `toFailure`). |

## Checked, no change

- Every icon-only control has an `aria-label`, and every decorative icon is `aria-hidden`. Focus uses the shared `:focus-visible` ring, and the new code has no `outline-none`. Nothing uses `transition: all`. Under reduced motion the blot is static (`paper.css`).
- The status line is a polite live region. Its minute tick is `aria-live="off"`. Dialogs trap focus and return it. In Repo details, Escape closes the token field first. The unlink confirm stacks over Repo details and Escape closes the innermost dialog first.
- Long names and addresses wrap with `overflow-wrap:anywhere` at 320. No overflow showed at any width in either theme, and the menus stay on screen at 320.
- Hidden tracks: the dialogs scroll with `overflow-y-auto` under the global hidden-scrollbar rule. The failure detail `<pre>` wraps rather than scrolling.
- `autoFocus` on the link dialog's address field is the dialog's single primary input, the same as the other Library dialogs.

## Not applied (guideline conflicts with DESIGN.md or approved strings)

- WIG "Title Case for buttons/headings": DESIGN.md and every approved string use sentence case.
- WIG "Placeholders end with …": the address placeholder is the approved example `https://github.com/you/notes`. An ellipsis would make it an invalid address.
- WIG "URL reflects state" for the dialogs: no Library dialog is deep-linked. That would be a new behaviour, not a fix.

## Owner review needed (not changed)

- **O1. Token replace field has no visible label at the line.** **Owner-approved 2026-11-08, done:** a visible faint "New token" label above the field, matching the link dialog's labels. In Repo details, "Replace token" opens an underline field with only `aria-label="Personal access token"`. The "Token" row label sits above the mask, so at 320 the bare line under the mask doesn't explain itself (`token-field-320-*.png`). Option: add a placeholder or visible label, e.g. "New token". That's a new string and needs owner approval.
- **O2. "Remove token" has no confirm or undo.** **Owner-approved 2026-11-08, done:** removes at once and shows "Token removed" with Undo for 6 s, reusing the app's Undo status-line pattern (Reviewers, thread Resolve; the app has no toast component); Undo restores the same token server-side from memory, never sent to the client. This is the phase-6 agent decision (progress.md). The token can be added again, but only by pasting it again. WIG says destructive actions need a confirm or undo. Owner decides whether removal counts as destructive.
