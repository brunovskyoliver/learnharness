# UI contract: Library git sync

DESIGN.md (feature 025 paper system) governs. Built from existing pieces: `lh-tool` toolbar words, `LibraryEntryMenu`/`LibraryMoreButton`, `folder-row.tsx`, `folder-dialogs.tsx` (lifted dialog), `delete-item-dialog.tsx` (destructive confirm, `nb-pill lh-pill-danger`), `read-only-view.tsx`, components/ui Input (line field). No new component family.

**Every string below was approved by the owner at gate 2 (2026-11-08, "go").**

## Entry point

- Library toolbar: "Link a repo" toolbar word with lucide `GitBranch` icon, after "New folder" (spec Assumptions). Hidden inside a mirror folder, as are Upload, New page, New folder and New diagram (R11, owner approved 2026-11-08). With 10 links it stays, and the dialog opens on the limit sentence.

## Link dialog (lifted dialog, focus trapped, returns to "Link a repo")

| Element | Text |
| --- | --- |
| Title | Link a repo |
| Description | The app pulls the repo every 15 minutes and keeps a read-only copy here. It never writes to the repo. |
| Field | Repo address (HTTPS) — placeholder `https://github.com/you/notes` |
| Field | Folder name — prefilled from the repo name |
| Field | Personal access token (only for a private repo) — `type=password`, `autocomplete=off` |
| Disclosure | Branch — "Default branch" until opened; then a line field |
| Location | "In {folder path}" or "In Library" (the current folder, as New folder does) |
| Primary | Link (ink pill) → "Linking…" with the blot while the first pull runs |
| Secondary | Cancel (text action; while linking it reads "Cancel" and only closes the dialog; the pull finishes or fails on the server and nothing is kept on failure) |
| Hosted note (faint) | The token is stored on the server for your account only. |

Refusal lines under the field they belong to, in `--text-red`, the raw detail behind "Show details":

| Code | Sentence |
| --- | --- |
| not_https | Only HTTPS addresses are supported. |
| credential_in_address | Take the name or token out of the address and put the token in its own field. |
| invalid_address | That isn't a repo address. |
| invalid_branch | That isn't a branch name. |
| already_linked | {display} ({branch}) is already linked as {folder}. |
| limit_links | You have 10 linked repos, the most allowed. Unlink one to add another. |
| name_taken | {name} is already a folder here. + "Use {suggested}" |
| auth | The repo refused the token. Check that it can read this repo. / This repo is private. Add a token that can read it. |
| not-found | No repo or branch was found at that address. |
| network | The repo's server couldn't be reached. |
| limit-files | The repo has {n} supported files, {over} over the 2,000 limit. |
| limit-bytes | The repo has {size} of supported files, {over} over the 500 MB limit. |
| too-large-download | The repo's download is over 500 MB. |
| address_blocked | This address can't be reached from the hosted app. |
| server | The repo couldn't be pulled. |

## Linked folder row and folder header

- Folder row: lucide `FolderGit2` icon instead of the folder icon; meta `Repo · {n} items`.
- Status line under the folder title (inside the folder) and in the row's meta (faint, `text-meta`):
  - never/pending: "Syncing for the first time…" (blot)
  - syncing: "Syncing…" (blot)
  - synced: "Synced just now" / "Synced {n} min ago" / "Synced {h} h ago" / "Synced on {date}"
  - failed: "Sync failed · {sentence}" with "Show details" and "Sync now" text actions; the last good contents stay listed.
  - skipped (when any): "· {n} files skipped" → "Show which" lists named files with reasons ("over 50 MB", "name can't be used", "Git LFS file", "submodule", "symbolic link", "contents don't match its type") and "{n} files of other types".
- Folder header toolbar (inside the linked folder): "Sync now" (disabled with aria-disabled and "Syncing…" while running), "Repo details".
- Pending first link: a row in the target folder with the folder name and "Syncing for the first time…"; not openable; disappears on failure (the dialog, if open, shows why; if closed, an inline red line on that spot "Couldn't link {display} · {sentence}" with Dismiss).

## Menus (⋯ and right-click)

| Entry | Actions |
| --- | --- |
| Linked folder | Open folder, Sync now, Repo details…, Rename folder, Move folder, Favorite, Pin, Archive, Delete folder (→ unlink dialog) |
| Mirror folder | Open folder, Favorite, Pin, Archive |
| Mirrored file | Open, Favorite, Pin, Tags…, Archive, Download |
| Bulk select | Move to… and Move to the trash refuse each mirrored entry: "{name}: comes from the repo." (existing bulk failure list) |
| Drag | mirrored rows are not draggable; dropping onto a mirror folder shows no drop target |

Row-level named buttons: no Rename/Delete icon buttons on mirrored rows.

## Repo details dialog

Title "{folder name}". Rows: "Address" {display} (link opens the https URL in a new tab; no credentials); "Branch" {branch} or "{branch} (default)"; "Last sync" status sentence + time; "Commit" first 7 of the oid; "Token" {mask} with "Replace token" and "Remove token" text actions, or "No token" with "Add token". Footer: "Sync now" text action, "Unlink…" red text action, "Close".

Replace token: line field, "Save token" ink pill; after saving the field clears and the mask shows ("Saved. The next sync uses it.").

**Owner-approved 2026-11-08 (review items O1, O2):**
- Replace/Add token: the line field has a visible faint label "New token" above it (`lh-float-label`, as the link dialog's field labels); the label is the field's accessible name.
- Remove token: removes at once (no confirm) and shows a status line "Token removed" with an "Undo" text action for 6 s; focus moves to Undo and, if still there when the line goes, to "Add token". Undo brings back the same token: the server holds the removed token in process memory for 10 s (the 6 s Undo plus slack for the round trip), never on disk after removal and never in a response. Too late: "The token can no longer be brought back. Add it again." (agent wording, flag for owner).

## Unlink confirm (destructive, lifted dialog)

- Title: Unlink {folder name}?
- Body: The folder and its {n} files leave your Library. Your highlights, notes and flashcards stay, and come back if you link this repo again. The repo isn't changed.
- Primary: Unlink (red pill). Secondary: Cancel. Focus starts on Cancel. Escape cancels.

## Opening a synced file

- Markdown/text/code/CSV: `read-only-view.tsx` with "This comes from {display}. Change it in the repo." replacing "This is your original; it can't be edited here."
- PDF reader: highlights and notes as for uploads; header meta "From {display}".
- When the open file changes in a pull: a faint line "Updated from the repo" with "Reload"; when removed: "Removed from the repo" (the view keeps what it showed).

## References and @ list

- @ list rows for mirrored items: name, meta "{folder path}" (as search results today); inserts `@{full Library path}`: ancestor folders, linked folder and repo path, `/`-joined (R13, owner approved 2026-11-08; full path per analyze M2).
- Reference line for a removed entry: "{name} · Removed from the repo" (replaces " · no longer in your Library" for these). Agent sentence: "This item was removed from the repo."

## Layout and access

- 320 / 390 / 1440 px; dialog fields stack; status line wraps under the title on phones.
- Keyboard: every action reachable in the menus; dialogs trap focus and return it; Escape closes innermost first; visible focus; 44 px coarse targets (existing classes).
- Live region: the status line is `role="status"` `aria-live="polite"`; failures are announced once.
- Reduced motion: the blot is static.
