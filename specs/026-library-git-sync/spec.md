# Feature 026: Library git sync

**Feature Branch**: `unified-redesign` (harness worktree branch; no new branch)

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description (owner, verbatim): "in library i would like to be able to link with git repo, so it automatically pulls my notes from there... only download side sync.. so it pulls the whole repo, i can name the folder and it would extract md and pdf and whatever else for docs being used..."

## Clarifications

### Session 2026-11-08 (owner, decisions given with the request)

- Q: What can he do with the pulled files? → A: **A read-only mirror.** The repo is the only source. Every sync overwrites, and files deleted upstream disappear from the folder. Pulled files can be read, @-referenced, quoted to the tutor and annotated (highlights and notes, which never touch the file), but not edited in the app.
- Q: When does it pull? → A: **Every 15 minutes, server-side, while the app runs**, plus a "Sync now" button and a faint "Synced {n} min ago" line. A failed pull says why.
- Q: How does the app get access? → A: **An HTTPS URL plus an optional personal access token**, stored the way provider API keys are (never shown again after saving). The same in local, Electron and hosted.
- Q: Which git engine? → A: **isomorphic-git**, approved by the owner as a new server-only runtime dependency (constitution: "New runtime dependencies need owner approval and a measured startup cost"). A shallow clone/fetch of one branch.
- Q: Which files come in? → A: **Every file type the Library already opens**: Markdown, text, PDF, images, code and CSV. Everything else is skipped, as are `.git` and `node_modules`.
- Q: How is the repo laid out in the Library? → A: **The repo's directory tree becomes nested Library subfolders** under the folder he names. Directories with no supported files are left out.
- Q: What happens to a synced file, and what was attached to it, when the file is deleted upstream? → A: **The file leaves the folder; his highlights, notes, flashcard links and @-references to it are kept.** References to it say "Removed from the repo". If the same path comes back, it gets the same identity and everything reattaches. (gate 1, recommended A)
- Q: What does unlinking do to the folder? → A: **Unlinking removes the linked folder and its synced files, after a confirm dialog that names the folder.** Highlights, notes, flashcard links and references are kept as for an upstream delete; relinking the same repo reattaches them. (gate 1, recommended A)
- Q: What limits apply? → A: **Per link at most 2,000 supported files and 500 MB; at most 10 links per user, in every mode.** A pull over a limit is refused, the last good mirror stays, and the reason names the limit and by how much it was passed. (gate 1, recommended A)
- Q: When does hosted mode pull? → A: **Hosted pulls every 15 minutes only while that user has the app open, and once when he opens it.** Local and Electron pull every 15 minutes while the process runs. (gate 1, recommended A)
- Q: Which Library organizing actions work on synced content? → A: **Inside the mirror: favourite, pin, tag and archive are allowed; rename, move and trash are not.** The linked folder itself can be renamed and moved. Its "Delete folder" means unlink (as above). (gate 1, recommended A)

### Session 2026-11-08 (owner, gate 2: "go", approving every proposal in research.md and the analyze fixes)

- Q: How does @ reach a synced file when several files share a name? → A: **A synced file's @ name is its full Library path: every ancestor folder name, the linked folder's name and the repo path, `/`-joined** (e.g. `@Lecture notes/week1/notes.md` at the top level, `@Physics/Lecture notes/week1/notes.md` under Physics), so equal-named linked folders under different parents never clash (analyze M2, 2026-11-08). Its display name stays the file name. Renaming or moving the linked folder or any ancestor keeps the old paths as previous names, so older @ tokens still resolve. (R13)
- Q: Can a hosted link point at a private or local address? → A: **No.** Hosted refuses addresses that resolve to loopback, private, link-local or unspecified networks: "This address can't be reached from the hosted app." Local and Electron allow them. (R6)
- Q: Can anything be put into a mirror? → A: **No.** Nothing can be added, moved or restored into the linked folder or a folder inside it: "{folder} mirrors a repo. Add files in the repo instead." A folder that holds a linked folder (at any depth) can't be trashed or deleted: "{folder} holds the linked folder {name}. Move it out or unlink it first." (R11)
- Q: What is "the same repo"? → A: **The same address and branch.** Linking an address and branch that is already linked is refused: "{display} ({branch}) is already linked as {folder}." (R3)
- Q: How many pulls run at once? → A: **At most 2 per server**, across all users; others wait in the order they were asked for. (R9)
- Q: What counts toward 500 MB? → A: **The supported files' total size after skips, and separately the download itself**, which is stopped at 500 MB: "The repo's download is over 500 MB." (R16)
- Q: Where is the token kept? → A: **In its own file beside the provider key file (owner-only permissions, per user in hosted mode), never in the provider key file itself**, so it is not put into the environment or listed with provider keys. (R8)
- Q: Engine version? → A: **isomorphic-git pinned at exactly 1.44.4**, server-only. (R5)
- The strings in contracts/ui-contract.md are approved.
- No live private repo was provided: the live check uses a local fixture repo only.

### Standing rules that apply

- Constitution I–VIII. III: learner data is never lost (annotations, highlights, flashcards and references to synced files are learner data; the mirrored bytes are not, the repo holds them). IV: honest states (syncing, synced, failed, never synced are distinct; a failed sync keeps the last good mirror). V: a sync is not a model call, so no budget applies; nothing in this feature calls a model. VII: hosted mode is tenant-scoped; credentials stay out of logs, chat and the client beyond their mask; agent file tools stay inside their allowed folders.
- The Library catalog's format stays additive: existing fields and the catalog version do not change, so an older app reading a newer catalog keeps working.
- UI follows DESIGN.md (feature 025's paper system), built with the shadcn skill and checked with impeccable and web-design-guidelines.
- Don't push, merge, deploy or touch `~/learnharness`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Link a repo and see its notes in the Library (Priority: P1)

He keeps his course notes in a git repo. In the Library he chooses to link a repo, pastes its HTTPS address, adds a personal access token because the repo is private, and names the folder "Lecture notes". The app pulls the repo once, and "Lecture notes" appears in the Library with the repo's directories as subfolders, holding his Markdown files, PDFs, images, code and CSVs. Everything else in the repo is left out. He opens a note and reads it.

**Why this priority**: without the first pull there is nothing to keep in sync; this alone already replaces uploading files by hand.

**Independent Test**: link a small fixture repo (public, and private with a token) that contains supported files in nested directories, an unsupported binary, a directory with only unsupported files, `.git` content and `node_modules`; check the folder tree and items match the supported files exactly, and that each opens as the same kind would after an upload.

**Acceptance Scenarios**:

1. **Given** a reachable public repo, **When** he links it with the folder name "Lecture notes", **Then** a folder "Lecture notes" appears in the Library holding one item per supported file, inside nested subfolders that follow the repo's directories.
2. **Given** a repo with a directory that holds only unsupported files, **When** it is pulled, **Then** that directory does not appear as a Library folder.
3. **Given** a private repo, **When** he links it with a valid token, **Then** the pull succeeds, and afterwards the token is shown only as a mask, never in full.
4. **Given** a wrong address, a missing or wrong token, or an unreachable host, **When** he links, **Then** the link is refused with a plain sentence naming the reason, no folder is created and the token is not kept.
5. **Given** the first pull is running, **When** he looks where the folder will appear, **Then** he sees a pending row with the folder name reading "Syncing for the first time…", which is not a folder, can't be opened, and is distinct from an empty or failed folder; it disappears if the first pull fails.

---

### User Story 2 - It keeps itself up to date (Priority: P1)

He pushes a new note and edits another from his laptop. Without doing anything in the app, within 15 minutes the new note appears and the edited one shows its new text. A note he deleted from the repo is gone from the folder. Under the folder's name a faint line reads "Synced 3 min ago". When he wants the change now, he presses "Sync now".

**Why this priority**: "automatically pulls my notes" is the owner's request; a one-time import would not meet it.

**Independent Test**: link a local fixture repo, then add, change, delete and move files upstream; trigger the periodic pull with a controllable clock and with "Sync now"; check the mirror equals the repo's supported files after each, and the status line updates.

**Acceptance Scenarios**:

1. **Given** a linked repo, **When** a file is added, changed or deleted upstream, **Then** after the next pull the folder holds exactly the repo's supported files at that commit.
2. **Given** a linked repo and the app running (local, Electron) or open in his browser (hosted), **When** 15 minutes pass since the last pull, **Then** the server pulls again without any action from him; in hosted mode no scheduled pull runs while he has no window open, and one runs when he opens the app.
3. **Given** a linked repo, **When** he presses "Sync now", **Then** a pull starts at once, the control shows it is running, and a second press while running starts nothing new.
4. **Given** a pull fails (network, revoked token, repo gone, over a limit), **When** he looks at the folder, **Then** the last good mirror is still there and a line says the sync failed and why, with the raw detail on demand.
5. **Given** nothing changed upstream, **When** a pull runs, **Then** no item changes and only the "Synced {n} min ago" time moves.
6. **Given** a synced file with highlights that is deleted upstream, **When** the next pull runs, **Then** the file leaves the folder, references to it say "Removed from the repo", and its highlights and notes are kept; **When** the same path returns in a later pull, **Then** it has the same identity and the highlights reattach.
7. **Given** a repo that grows past 2,000 supported files or 500 MB, **When** a pull runs, **Then** it is refused, the last good mirror stays, and the line names the limit and by how much it was passed.

---

### User Story 3 - Synced notes work like the rest of the Library (Priority: P2)

In a lesson he types @ and picks a synced note; the tutor receives it like any other Library item. He selects a passage in a synced PDF, highlights it and asks the tutor about it. He searches the Library's full text and finds a line in a synced Markdown file. When he opens a synced file it says it comes from the repo and can't be edited here.

**Why this priority**: the notes are pulled so they can be used in study; this story is what makes the mirror useful beyond reading.

**Independent Test**: with a linked fixture repo, @-reference a synced file in a turn (intercepted model request), add a highlight to a synced PDF, run a full-text search, and ask the agent's file tools to read a synced file in local and hosted mode.

**Acceptance Scenarios**:

1. **Given** a synced file, **When** he @-references it, **Then** the turn carries it with the same full-or-outline rule and visible label as any Library item.
2. **Given** a synced PDF or text file, **When** he highlights or annotates it, **Then** the highlight is saved and survives later syncs that leave the file unchanged.
3. **Given** a synced file or a folder inside the mirror, **When** he tries to rename, move, trash, edit or replace it, **Then** the app does not offer it and says it comes from the repo; favourite, pin, tag and archive work as for any item.
4. **Given** synced files, **When** the agent's file tools look for or read them (local or hosted), **Then** they can read them, and still cannot reach anything outside their allowed folders.
5. **Given** synced text files, **When** he searches full text, **Then** they are indexed and found like uploads, and unreadable ones are named as not searched.
6. **Given** the linked folder, **When** he renames or moves it, **Then** it keeps its link and its contents, and the next pull fills it as before.

---

### User Story 4 - Manage the link (Priority: P3)

He opens the linked folder's menu and sees the repo address, branch, last sync time and outcome. He can replace the token when it expires, sync now, or unlink the repo.

**Why this priority**: tokens expire and courses end; without this the link can only be broken, not maintained.

**Independent Test**: replace a token with a new valid one and an invalid one; unlink after the confirm; check status, masking, that the folder and synced files are gone while highlights and references remain (reading "Removed from the repo"), and that relinking the same repo reattaches them.

**Acceptance Scenarios**:

1. **Given** a linked folder, **When** he opens its link details, **Then** he sees the address (without any credential in it), the branch, the last sync time and its outcome, and the token only as a mask.
2. **Given** an expired token, **When** he saves a new one, **Then** the next pull uses it and the old one is gone.
3. **Given** a linked folder, **When** he chooses Unlink (or "Delete folder" on the linked folder), **Then** a confirm dialog names the folder; on confirming, periodic pulls for it stop, its token is deleted, and the folder and its synced files leave the Library while highlights, notes, flashcard links and references to them are kept.
4. **Given** a repo he unlinked, **When** he links the same repo again, **Then** files at the same paths get their old identity back and their highlights, notes, flashcard links and references reattach.
5. **Given** he has 10 links, **When** he tries to link another, **Then** the link is refused with a sentence naming the 10-link limit.

---

### Edge Cases

- Two files with the same name in different repo directories (`week1/notes.md`, `week2/notes.md`): both appear, each in its own subfolder, without renaming and without clashing with each other; @ reaches each by its full Library path (`@Lecture notes/week1/notes.md`), and an upload `notes.md` stays `@notes.md`.
- A synced file whose name matches an upload elsewhere in the Library: neither is renamed or overwritten.
- A file renamed or moved upstream: a delete of the old path plus an add of the new one. The new path is a new identity; the old path's highlights and references stay with it and read "Removed from the repo" (they reattach if the old path comes back).
- A file deleted upstream and later restored at the same path: same identity, everything reattaches. Restored with changed content: same identity, and highlights re-anchor as they do after any change.
- A file type changed upstream (e.g. `notes.txt` → `notes.md`): treated as a rename (a delete plus an add).
- A supported file over the Library's per-file size limit (50 MiB): skipped and named in the sync result.
- Git LFS pointer files, submodules and symlinks: not fetched or followed; skipped and named in the sync result.
- File names the Library can't hold (control characters, over 200 characters, leading dot): skipped and named. Directories starting with a dot are skipped like `.git`.
- The branch is force-pushed or rewritten: the mirror follows the new tip.
- The repo becomes empty or every supported file is deleted upstream: the folder stays, empty, still linked.
- The app was off for hours: the first pull happens soon after start (local, Electron) or after he opens the app (hosted), not 15 minutes later.
- Hosted, he closes every window: scheduled pulls stop for him until he opens the app again; a pull already running finishes.
- A repo over 2,000 supported files or 500 MB: the link (on the first pull) or that pull (later) is refused with the limit and the overshoot, e.g. "2,340 supported files, 340 over the 2,000 limit"; the last good mirror stays.
- An 11th link: refused with a sentence naming the 10-link limit; nothing is fetched.
- A pull is still running when the next one is due: the next one waits; pulls of one repo never overlap.
- The server stops mid-pull: the mirror is never left half-written; the next pull completes it.
- He moves or renames the linked folder: allowed; the link follows the folder. "Delete folder" on it opens the unlink confirm instead of the trash. Folders and files inside the mirror offer no rename, move or trash, also in bulk selections and drag and drop, where each refused item is named with the reason.
- He opens a synced file while a pull replaces it: he sees the old or new version whole, never a mix, and an open reader shows the file has updated.
- Hosted: one tenant's repos, tokens and mirrors are invisible to every other tenant. Pulls from different tenants run independently, at most 2 at a time per server; a pull waits only behind the pulls queued before it.
- Hosted: an address whose host resolves to a loopback, private, link-local or unspecified address (or redirects to one) is refused with "This address can't be reached from the hosted app."; nothing is fetched. Local and Electron allow such addresses.
- Linking an address and branch that is already linked is refused, naming the folder it is linked as; the same address on another branch is a separate link.
- Uploading, creating a page, folder or diagram, moving, dropping or restoring from the trash into the linked folder or any folder inside it is refused with "{folder} mirrors a repo. Add files in the repo instead."; inside a mirror the toolbar does not offer Upload, New page, New folder or New diagram.
- Trashing or deleting a normal folder that holds a linked folder at any depth is refused with "{folder} holds the linked folder {name}. Move it out or unlink it first."
- He unlinks while a pull of that repo runs: the running pull is awaited and its result discarded; then the unlink completes as usual.
- He renames or moves the linked folder, or renames or moves a folder above it: synced files' @ names change with it, and the old names keep resolving.
- The address contains a username or token inline (`https://user:token@host/...`): refused or stripped so the credential is never stored in the address or shown.
- Non-HTTPS addresses (`git@`, `ssh://`, `http://`, `file://`): refused with a sentence saying only HTTPS is supported.

## Requirements *(mandatory)*

### Functional Requirements

**Linking**

- **FR-001**: The Library MUST let him link a git repo by giving an HTTPS address, an optional personal access token, and a folder name; the folder name follows the Library's folder name rules and clash handling. An address and branch that is already linked MUST be refused before anything is fetched, naming the folder it is linked as.
- **FR-002**: Linking MUST pull the repo before the folder counts as linked; a link whose first pull fails creates no folder and keeps no token, and says why.
- **FR-003**: Only HTTPS addresses MUST be accepted; credentials embedded in the address MUST NOT be stored or shown.
- **FR-004**: The token MUST be stored server-side the way provider API keys are (an owner-only file, per user in hosted mode), but in its own file and never in the provider key file, so it is not put into the environment or listed with provider keys; it MUST never be logged, never sent to the client beyond its mask, and never written into the Library catalog, the mirror, search indexes, chat or agent context.
- **FR-005**: Each pull MUST fetch one branch shallowly (only the latest commit's files).

**Mirroring**

- **FR-006**: After each successful pull, the linked folder MUST hold exactly the supported files of the branch tip: added files appear, changed files show their new content, deleted files leave the folder (FR-028).
- **FR-007**: Supported files are those the Library already opens (Markdown, text, PDF, images, code, CSV, by the Library's accepted extensions). Everything else, `.git`, `node_modules`, LFS pointers, submodules and symlinks MUST be skipped.
- **FR-008**: The repo's directories MUST become nested Library subfolders under the linked folder; directories with no supported files at any depth MUST NOT appear.
- **FR-009**: Files with the same name in different directories MUST both appear, each under its own subfolder, without being renamed and without clashing with uploads or with each other.
- **FR-010**: A synced file MUST keep the same Library identity across pulls while its path in the repo stays the same, so @-references, annotations, highlights, flashcard sources and open tabs keep pointing at it. The identity is tied to the repo (its address and branch) and the path, so it also survives an upstream delete and return and an unlink and relink of the same repo.
- **FR-011**: A pull MUST replace the mirror as a whole or not at all: an interrupted or failed pull leaves the last good mirror in place.
- **FR-012**: Synced files and the folders inside the mirror MUST NOT be editable, renamable, movable, trashable or replaceable in the app; the viewer says the file comes from the repo. Favourite, pin, tag and archive MUST work on them as on any item. The linked folder itself MUST be renamable and movable; its "Delete folder" MUST mean unlink (FR-023). Nothing MUST be added, moved or restored into the linked folder or any folder inside it (uploads, pages, folders, diagrams, moves, drops, trash restores), refused with "{folder} mirrors a repo. Add files in the repo instead." A folder that holds a linked folder at any depth MUST NOT be trashable or deletable ("{folder} holds the linked folder {name}. Move it out or unlink it first."). The app MUST NOT write to the repo.
- **FR-013**: Uploads, pages and diagrams elsewhere in the Library MUST be unaffected by any pull.

**Syncing**

- **FR-014**: In local and Electron modes the server MUST pull every linked repo every 15 minutes while the process runs, and once soon after start. In hosted mode it MUST pull a user's repos every 15 minutes only while that user has the app open, and once when he opens it.
- **FR-015**: "Sync now" MUST start a pull at once, or queue it behind the pulls already running when the server's limit of 2 concurrent pulls is reached; pulls of the same repo MUST NOT overlap. Queued pulls run in the order they were asked for, across all users.
- **FR-016**: The linked folder MUST show its sync state: syncing, "Synced {n} min ago", or failed with the reason in plain words and the raw detail on demand. Never-synced, syncing, synced and failed MUST be visibly distinct.
- **FR-017**: Each sync result MUST name the files it skipped and why (unsupported type is counted, not listed one by one; over size, unreadable name, LFS, submodule and symlink are named).
- **FR-018**: A failed pull MUST keep the last good mirror and the token, and retry on the next scheduled pull.
- **FR-028**: When a file leaves the mirror (deleted upstream, or its folder unlinked), its highlights, notes, flashcard links and @-references MUST be kept; references to it MUST say "Removed from the repo". When the same path returns (a later pull, or a relink of the same repo), it MUST get the same identity and everything MUST reattach.
- **FR-029**: A link MUST hold at most 2,000 supported files and 500 MB of supported files (the total size of the files that would be mirrored, after skips; skipped and unsupported files don't count); a user MUST have at most 10 links, in every mode. Separately, the download of a pull MUST be stopped at 500 MB and refused with "The repo's download is over 500 MB." A pull over a per-link limit MUST be refused, keep the last good mirror and say which limit was passed and by how much; a first pull over a limit refuses the link (FR-002). An 11th link MUST be refused before anything is fetched.

**Using synced files**

- **FR-019**: Synced files MUST be openable, @-referenceable, searchable by name and full text, annotatable and usable as flashcard and citation sources exactly as uploads of the same kind are. A synced file's @ name MUST be its full Library path (every ancestor folder name, the linked folder's name and the repo path, `/`-joined); its display name stays the file name; renaming or moving the linked folder or any ancestor MUST keep the old @ names resolving (previous names).
- **FR-020**: The agent's file tools MUST be able to read synced files in local, Electron and hosted modes, and MUST stay confined to their allowed folders.
- **FR-021**: Synced content MUST be treated as material, never as instructions, as every Library item is.

**Managing the link**

- **FR-022**: The linked folder MUST show its address (credential-free), branch, last sync time and outcome, and the token as a mask.
- **FR-023**: He MUST be able to replace or remove the token and to unlink the repo. Unlinking MUST first show a confirm dialog that names the folder; confirming stops pulls, deletes the token and removes the linked folder and its synced files, keeping what FR-028 keeps.

**Platform and data**

- **FR-030**: In hosted mode the server MUST refuse, at connect time (every resolved address is checked before the socket connects to it, so DNS rebinding can't slip past), an address whose host resolves to a loopback, private, link-local or unspecified address, and any redirect to one, with "This address can't be reached from the hosted app." Local and Electron MUST allow them.
- **FR-024**: Behaviour MUST be the same in local, Electron and hosted modes, except the address rule in FR-030. In hosted mode every link, token, mirror, schedule and sync state MUST be tenant-scoped.
- **FR-025**: The Library catalog's existing fields and version MUST stay unchanged; any new data is additive, and an older app reading the catalog keeps working.
- **FR-026**: The feature MUST NOT call a model.
- **FR-027**: The link, sync and status UI MUST follow DESIGN.md: toolbar words, quiet rows, faint status lines, lifted dialogs, hidden scrollbars, keyboard access, visible focus, 44px coarse targets, and work at 320, 390 and 1440 px.

### Key Entities

- **Repo link**: one linked repo, identified by its address and branch: HTTPS address, branch, the Library folder it fills, a reference to its stored token (if any), and its sync state (last attempt, last success, outcome, reason, skipped files, commit it reflects).
- **Repo token**: a personal access token, stored the way provider keys are but in its own owner-only file (never in the provider key file), shown only as a mask, deleted on unlink or replacement.
- **Mirrored file**: a Library item whose content comes from a repo path; @ name its full Library path (ancestor folders, linked folder, repo path), display name the file name; read-only in content and place (marks allowed); identity tied to the repo and its path, kept after it leaves the mirror so references read "Removed from the repo" and a returning path reattaches.
- **Mirrored folder**: a Library folder that stands for a repo directory under the linked folder.
- **Sync run**: one pull of one link: start, end, commit, outcome, counts of added, changed, removed and skipped files.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Linking a repo of up to 200 supported files takes him under 1 minute from opening the link dialog to reading the first note on a typical connection.
- **SC-002**: A change pushed upstream appears in the Library within 16 minutes with the app running (local, Electron) or open (hosted) and no action from him, and within 1 minute of pressing "Sync now".
- **SC-003**: After every successful pull, the set of synced items equals the repo's supported files at the branch tip, with zero extra, missing or stale items (checked against fixture repos).
- **SC-004**: Annotations, highlights and references on a file unchanged upstream survive 100% of pulls.
- **SC-005**: A failed or interrupted pull never removes or corrupts a previously synced file (fault-injection tests).
- **SC-006**: The token never appears in logs, client responses, the catalog, chat or agent context (searched in test output and stored data).
- **SC-007**: In hosted mode, no tenant can see or read another tenant's links, tokens or mirrored files.
- **SC-008**: App startup and initial JavaScript do not regress by more than 5% (the git engine stays server-only and off the startup path).
- **SC-009**: Highlights, notes, flashcard links and references on a file deleted upstream (or unlinked) survive in 100% of cases, and reattach in 100% of cases when the same path returns (fixture tests).
- **SC-010**: Every pull over 2,000 supported files or 500 MB, and every 11th link, is refused with the limit and the overshoot named, and leaves the last good mirror unchanged (fixture tests).
- **SC-011**: In hosted mode, zero scheduled pulls run for a user with no open window (controllable clock test).

## Assumptions

- **Branch**: the link uses the repo's default branch unless he names another when linking (an optional field). One branch per link.
- **Many repos**: he can link more than one repo, each into its own folder; a folder holds at most one repo. The linked folder may sit at the Library's top level or inside another folder he picks, like "New folder".
- **Entry point**: a "Link a repo" toolbar word beside "New folder" in the Library; final strings are in contracts/ui-contract.md, approved by the owner at gate 2 (2026-11-08).
- **Agent**: the agent cannot link, unlink or trigger a sync; only the learner can. The agent reads synced files.
- **Pages**: synced Markdown files stay files (read-only Markdown), not editable Library pages.
- **Scheduler**: no scheduler exists today; a server-side 15-minute timer is built for this feature. Local and Electron: one per process. Hosted: per user, armed while he has the app open (FR-014).
- **Size**: the Library's existing 50 MiB per-file limit applies to synced files.
- **Local data folders**: the mirror lives inside the user's data directory (per tenant in hosted), so backups and deletes treat it like other Library data.
- **Dependencies**: isomorphic-git 1.44.4, exact pin (owner-approved); the existing Library catalog, folders, annotations, search index, @ list and agent file tools; the provider key store.
- **Out of scope**: pushing or committing, editing synced files, SSH or non-HTTPS remotes, OAuth sign-in to git hosts, webhooks, Git LFS content, submodules, history browsing, and converting synced files to pages.
