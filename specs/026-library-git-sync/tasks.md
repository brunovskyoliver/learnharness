# Tasks: Library git sync

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [contracts/ui-contract.md](contracts/ui-contract.md), [quickstart.md](quickstart.md)

**Tests**: included. The constitution requires `npm test`/e2e gates, and every story in spec.md has an Independent Test; tests are written first in each phase and must fail before the implementation task that makes them pass.

**Gate**: passed 2026-11-08. The owner replied "go" at gate 2, approving every proposal in research.md (R3, R5, R6, R8, R9, R11, R13, R16) and the ui-contract strings; the tasks below encode them (spec Clarifications, gate 2). New tasks were added at the end of their phase (T058, T059) so earlier IDs stay stable.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Add `isomorphic-git` at exactly `1.44.4` to dependencies in package.json and package-lock.json (`npm install isomorphic-git@1.44.4 --save-exact`); record installed size of it and its deps in specs/026-library-git-sync/progress.md
- [X] T002 [P] Measure the startup JS baseline for `/`, `/chat/new`, `/library` on the current HEAD with `~/agent-runs/2026-11-07-unified-redesign/startup-js/startup-js.mjs`; save numbers to `~/agent-runs/2026-11-08-library-git-sync/startup-before.md`
- [X] T003 [P] Create the fixture remote in tests/fixtures/git-remote.ts: build bare repos with the `git` binary in a temp dir from a `{path: content|{symlink}|{submodule}|{lfs}}` map, commit/force-push helpers, and a 127.0.0.1 Node `http` server running `git http-backend` (CGI env GIT_PROJECT_ROOT, GIT_HTTP_EXPORT_ALL) with optional Basic-token check; `skipReason()` when `git` is missing

## Phase 2: Foundational (blocks every story)

- [X] T004 [P] Write tests/repo-link-core.test.ts: `parseRepoAddress` (https only; `git@`, `ssh://`, `http://`, `file://` → `not_https`; userinfo → `credential_in_address` without echoing it; query/fragment/empty path → `invalid_address`; display/repoKey normalization incl. trailing `.git` and `/`; loopback http only with `allowLoopbackHttp`), branch-name check, `classifyEntry` (symlink, submodule, dot dirs, `node_modules`, bad names, unsupported, LFS pointer, over 50 MiB, content mismatch), limit checks and overshoot sentences (R16)
- [X] T005 Implement src/core/repo-link.ts to pass T004: types `RepoLink`, `RepoSyncState`, `SyncFailure`, `SkippedFile`, constants `REPO_MAX_FILES`, `REPO_MAX_BYTES`, `REPO_MAX_LINKS`, `REPO_SYNC_INTERVAL_MS`, `REPO_PULL_POOL`, `parseRepoAddress`, `isBranchName`, `classifyEntry`, `limitFailure`, `syncStatusText` (pure; no fs/env)
- [X] T006 Extend src/core/library.ts additively: `MirrorRef`, `LibraryItem.mirror?`, `LibraryFolder.mirror?`, `LibraryTombstone.mirror?`/`removedBecause?`, origin `{type:"repo"; linkId}`, catalog keys `repoLinks?`/`mirrored?`, refusal codes and messages from contracts/api.md (`repo_file`, `repo_folder`, `repo_linked`, `holds_linked`, `not_https`, `credential_in_address`, `invalid_address`, `invalid_branch`, `already_linked`, `limit_links`, `address_blocked`, `sync_failed`), helpers `isMirrored`, `isLinkedFolder`, `inMirror(folderId, folders)`
- [X] T007 [P] Add `"library-sync": { linkId: string }` to `ServerEvents` and the subscribed type list in src/core/events.ts
- [X] T008 Write tests/library-mirror-catalog.test.ts: read merges `mirrored.folders/items` into folders/items; write splits them back by `mirror`; a catalog with mirrors round-trips byte-stable through the current reader; an "older reader" (current code with mirror support stubbed out) rewrites the file keeping `repoLinks`/`mirrored`; `reconcile()` never tombstones or adopts mirrored entries; `takenKeys()` ignores mirrored names (upload `notes.md` beside mirrored `notes.md` succeeds)
- [X] T009 Implement T008 in src/store/library.ts: `readCatalog`/`writeCatalog` split/merge (diagram pattern), `reconcile()` and `takenKeys()` skip `mirror`, `documentPath(item)` returns `files/.mirrors/<linkId>/<snapshot>/<path>` for mirrored items, `readText` and every direct `path.join(PATHS.files, item.name)` route through `documentPath`; update the `documentPath` signature in src/core/ports.ts to `Pick<LibraryItem, "name" | "mirror">`
- [X] T010 [P] Write tests/repo-tokens.test.ts and implement src/store/repo-tokens.ts: `PATHS.data/git-tokens.json`, `{[linkId]: token}`, 0600 via temp+chmod+rename like src/store/auth.ts, `get/set/delete/mask`, absent/corrupt = `{}`; tenant-scoped path under `runAsTenant`; never reflected into `process.env`
- [X] T011 Write tests/repo-git.test.ts against tests/fixtures/git-remote.ts (skips with reason without `git`): `tip()` returns branch tip and default branch from HEAD; `snapshot()` returns entries with mode, oid, size and bytes for a depth-1 single-branch clone into `library/git-work/…` which is deleted after; public, private with token, wrong token (`auth`, once, no loop), unknown host (`network`), missing repo/branch (`not-found`), transfer over a lowered cap (`too-large-download`), https-only redirect refusal; no error text or log line contains the token
- [X] T012 Implement src/server/repo-git.ts to pass T011: the only `import("isomorphic-git")` site (own `node:http`/`node:https` client in isomorphic-git's `HttpClient` shape instead of `isomorphic-git/http/node`, so it owns the connect-time `lookup` hook, M1); `RepoRemote` port (`tip`, `snapshot`) in src/core/ports.ts; http wrapper (https-only incl. redirects, loopback http only under `LH_TEST_GIT_LOOPBACK_HTTP=1` and `NODE_ENV!=="production"`, byte counter abort at `REPO_MAX_BYTES`, 30 s connect / 10 min total); `onAuth` `x-access-token`/token; `onAuthFailure` cancel; error → `SyncFailure` mapping; `redactSecrets`
- [X] T013 Add the hosted address check to src/server/repo-git.ts (FR-030, R6, analyze M1): enforce it at connect time in the http client's `lookup` hook (every resolved address validated before the socket connects to it; IP literals checked before the request; every redirect target goes through the same hook), closing DNS rebinding; refuse loopback/private (RFC 1918, fc00::/7)/link-local (169.254/16, fe80::/10)/unspecified in hosted mode with `address_blocked` ("This address can't be reached from the hosted app."); local/Electron allow them; `LH_TEST_GIT_LOOPBACK_HTTP=1` (ignored in production) lets 127.0.0.1, and only it, past the hosted block (analyze M3); test in tests/repo-git.test.ts with `LH_HOSTED=1`: the 127.0.0.1 fixture allowed under the flag, `localhost`, other loopback, private and link-local addresses and redirects to them refused; without `LH_HOSTED` loopback allowed
- [X] T058 Write the 500 MB counting tests in tests/repo-link-core.test.ts and tests/repo-git.test.ts (FR-029, R16): only supported files that would be mirrored count toward the per-link 500 MB (skipped and unsupported files don't); a repo whose download passes the (lowered test) cap is refused `too-large-download` even when its supported files are under it; overshoot sentences match ui-contract.md

**Checkpoint**: core types, catalog split, token store and git transport exist and are tested; no UI yet.

## Phase 3: User Story 1 — Link a repo and see its notes (P1) 🎯 MVP

**Goal**: link a public or private repo into a named folder; the first pull builds the nested tree of supported files; files open like uploads.

**Independent Test**: spec US1 — fixture repo with nested supported files, an unsupported binary, an unsupported-only directory, `.git` content and `node_modules`; tree and items match exactly; each opens as an upload of its kind; failures create nothing.

- [X] T014 [P] [US1] Write tests/library-mirror.test.ts (apply part): `applyMirror(linkId, snapshot entries)` creates the linked folder, one mirror folder per directory with supported files at any depth (none for unsupported-only dirs), one item per supported file with kind, size, `mirror` and `origin:{type:"repo"}`; `week1/notes.md` and `week2/notes.md` both appear unrenamed; PDFs get `textState:"pending"`; bytes are under `files/.mirrors/<linkId>/<snapshot>/`; `library-changed` emitted
- [X] T015 [US1] Implement `applyMirror` (first-pull path), `stageSnapshot` (write blobs `wx` + fsync, hard-link by oid) and `discardSnapshot` in src/store/library.ts, exposed on `LibraryStore` in src/core/ports.ts
- [X] T016 [P] [US1] Write tests/repo-links-api.test.ts (create part): POST validation refusals before any fetch (400 codes, 404 parent, 409 name clash with `suggestedName`, 409 parent inside a mirror), 201 on success with link + folder, token stored only after success and returned only as `tokenMask`, 422 `sync_failed` leaves no folder, no link and no token, `pending` row visible in GET while the first pull runs and gone after a failure (US1 #5); hosted 403 `address_blocked` before any fetch (FR-030)
- [X] T017 [US1] Implement src/server/repo-sync.ts core: per-tenant registry (`tenantScoped("__lhRepoSync")`), pending first links, `pull(link)` = `RepoRemote.tip` → skip if unchanged → `snapshot` → `classifyEntry` → limits → `stageSnapshot` → `applyMirror` → delete old snapshot, process-wide pool of `REPO_PULL_POOL`, `library-sync` events, injectable clock and remote
- [X] T018 [US1] Implement src/server/repo-links.ts list/create responses and routes app/api/library/links/route.ts (GET, POST) per contracts/api.md; export from src/server/index.ts; `GET /api/library` adds `links` in src/server/library.ts
- [X] T019 [US1] Content route: `libraryContentResponse` in src/server/library.ts resolves mirrored paths via `documentPath` and retries once on ENOENT after re-reading the catalog (R4); test in tests/repo-links-api.test.ts
- [X] T020 [P] [US1] Build components/library/repo-link-dialog.tsx per ui-contract.md (lifted dialog, line fields, token `type=password` `autocomplete=off`, Branch disclosure, Link pill → "Linking…" with blot, refusal lines with Show details, focus trap and return) using the shadcn skill
- [X] T021 [US1] Wire "Link a repo" (lucide `GitBranch`) after "New folder" in components/library/library-view.tsx; pending row "Syncing for the first time…" in the target folder (not a folder, not openable; on failure replaced by "Couldn't link {display} · {sentence}" with Dismiss, ui-contract.md); linked folder rows with `FolderGit2` and `Repo · {n} items` in components/library/folder-row.tsx; refetch links on `library-sync` via components/server-events.tsx subscription
- [X] T022 [US1] Read-only line for mirrored files: "This comes from {display}. Change it in the repo." in components/library/read-only-view.tsx; PDF reader meta "From {display}" in components/library/pdf-reader.tsx
- [X] T023 [US1] Playwright journey part 1 in tests/e2e/study/library-git-sync.spec.ts: start the fixture remote in `beforeAll`, pass `LH_TEST_GIT_LOOPBACK_HTTP=1` to the e2e web server in playwright.config.ts, link → syncing → tree → open a Markdown file (read-only line) → open a PDF; private repo with token; wrong address refusal; at 320/390/1440

**Checkpoint**: US1 works end to end with manual Sync only through re-link; no schedule yet.

## Phase 4: User Story 2 — It keeps itself up to date (P1) 🎯 MVP

**Goal**: scheduled pulls (local every 15 min while running; hosted while open + once on open), Sync now, exact mirror after add/change/delete/move, removed entries and reattach, failures keep the last good mirror, status line.

**Independent Test**: spec US2 — controllable clock and Sync now against a fixture repo with add/change/delete/move; mirror equals the tip after each; status line updates; hosted presence.

- [X] T024 [P] [US2] Extend tests/library-mirror.test.ts (update part): add/change/delete/move upstream → mirror equals tip; unchanged files keep id, `updatedAt` and annotation file (SC-004); a deleted path becomes a tombstone with `mirror` and `removedBecause:"repo"` and keeps `library/annotations/<id>.json`, derived text and card links; the same path returning revives the same id (SC-009); marks on items and mirror folders survive pulls and reattach; old snapshot dir removed; force-push follows the new tip; empty repo leaves an empty linked folder; uploads, pages and diagrams outside the mirror are byte- and record-identical before and after every pull (FR-013)
- [X] T025 [US2] Implement the update path of `applyMirror` in src/store/library.ts: diff by `(repoKey, path)` and oid, revive removed entries, tombstone removed paths without deleting annotations/derived/cards, set `textState:"pending"` for changed PDFs, mirror folder add/remove/revive by dir path, single catalog write, emit `library-changed` per changed id
- [X] T026 [P] [US2] Write tests/library-mirror-faults.test.ts: inject a throw after staging, before the catalog write, after the catalog write and during old-snapshot removal; after each the catalog's mirror is the last good one or the new one whole, and `sweepMirrors()` removes orphan snapshot and git-work dirs (FR-011, SC-005); a pull marked syncing at process stop reads as failed "The last sync was interrupted." on the next read
- [X] T027 [US2] Implement `sweepMirrors()` and the interrupted-sync read rule in src/store/library.ts and src/server/repo-sync.ts
- [X] T028 [P] [US2] Write tests/repo-sync-scheduler.test.ts with the fake clock and fake remote: local arm on first window pulls links older than 15 min then every 15 min and never disarms; hosted: 0→1 windows pulls once, 15-min ticks while open, 1→0 stops ticks while a running pull finishes, zero pulls with no window (SC-011); two windows share one timer; Sync now during a pull joins it (FR-015); pool of 2 per server across tenants, a third pull waits and runs in FIFO order (FR-015); unchanged tip moves only `lastSuccessAt` (US2 #5); failure keeps commit and mirror and records `SyncFailure`; over-limit later pull refused with overshoot and mirror kept (SC-010)
- [X] T029 [US2] Implement scheduling in src/server/repo-sync.ts (arm/disarm, interval, presence per tenant, at-arm catch-up) and src/server/repo-sync-hooks.ts (`windowOpened`/`windowClosed`, lazy `import("./repo-sync.ts")`); call them from `eventsResponse()` start/stop in src/server/events-stream.ts
- [X] T030 [US2] Implement `POST /api/library/links/:id/sync` in src/server/repo-links.ts and app/api/library/links/[id]/sync/route.ts (202, joins running pull, 404 unknown); tests in tests/repo-links-api.test.ts
- [X] T031 [P] [US2] Build components/library/repo-status-line.tsx per ui-contract.md (syncing/synced n min ago/failed with Show details and Sync now; skipped "Show which"; `role="status"`, polite; client tick from `lastSuccessAt`; static blot under reduced motion)
- [X] T032 [US2] Place the status line under the linked folder's title and in its row meta; "Sync now" and "Repo details" toolbar words inside the linked folder in components/library/library-view.tsx; open readers show "Updated from the repo" + Reload or "Removed from the repo" on `library-changed` for their item in components/library/read-only-view.tsx and components/library/pdf-reader.tsx
- [X] T033 [US2] Playwright journey part 2 in tests/e2e/study/library-git-sync.spec.ts: push add/change/delete upstream → Sync now → tree updated, status line moves; revoke token on the fixture → failed line, files stay

**Checkpoint**: MVP (US1 + US2) complete and independently testable.

## Phase 5: User Story 3 — Synced notes work like the rest of the Library (P2)

**Goal**: @-references, highlights, full-text search, agent file tools, read-only rules with marks allowed (Q5).

**Independent Test**: spec US3 — @-reference a synced file (intercepted model request), highlight a synced PDF, full-text search, agent tools in local and hosted mode.

- [X] T034 [P] [US3] Write tests/library-mirror-refusals.test.ts: mirrored item rename/move/trash/remove → `repo_file`; mirror folder rename/move/trash/remove → `repo_file`; `markItem`/`markFolder` work; linked folder rename/move work and trash/remove → `repo_linked`; additions into the mirror (upload, createFolder, createPage, diagram, moveItem, moveFolder, restore) → `repo_folder`; trashing or deleting a folder holding a linked folder at any depth → `holds_linked`, also in bulk (FR-012, R11); refusal sentences match ui-contract.md; route statuses per contracts/api.md
- [X] T035 [US3] Implement the refusals in src/store/library.ts (rename, moveItem, trashItem, remove, renameFolder, moveFolder, trashFolder, removeFolder, createFolder, writeUpload, createVersioned, restoreTrash) and the status mapping in src/server/library.ts (`REFUSAL_STATUS`)
- [X] T036 [US3] Library UI per ui-contract.md menus: entries for linked folder / mirror folder / mirrored file in components/library/library-view.tsx, folder-row.tsx and library-row.tsx; no Rename/Delete icon buttons on mirrored rows; mirrored rows not draggable and mirror folders not drop targets; toolbar adding words hidden inside a mirror; bulk failures name each refused entry
- [X] T037 [P] [US3] Extend tests/library-references.test.ts and tests/library-refs.test.ts: the full-Library-path @ name (ancestor folders + linked folder + repo path, M2) resolves to the mirrored item; equal-named linked folders under different parents don't clash; duplicate basenames resolve separately; renaming the linked folder keeps old tokens via `previousNames`; a removed entry reads "Removed from the repo" (client) and "This item was removed from the repo." (agent); full-or-outline rule and label unchanged (FR-019); a referenced synced file arrives inside the same material wrapper as uploads, never as instructions (FR-021); the display name stays the file name
- [X] T038 [US3] Implement R13 in src/core/library-refs.ts (reference names for mirrored items, removed wording) and the @ list rows with folder path meta in components/library/mention-menu.tsx and the reference line in components/library/references-card.tsx (FR-019, R13)
- [X] T039 [P] [US3] Extend tests/document-search.test.ts / tests/document-index.test.ts: mirrored text files are indexed and found; a changed file reindexes; unreadable ones are named as not searched; removed entries drop out
- [X] T040 [P] [US3] Extend tests/fs-tools.test.ts and tests/tenant-files.test.ts: hosted `read`/`ls`/`grep`/`find` reach `files/.mirrors/…` and still refuse paths outside `files/` and symlinks; `library_list` shows folder path and file path for mirrored items; `library_read` reads a mirrored Markdown and PDF
- [X] T041 [US3] Implement `library_list` output for mirrored items in src/agent/tools/library.ts
- [X] T042 [P] [US3] Extend tests/document-anchors.test.ts or the annotations API tests: highlight on a mirrored PDF and text file saves and survives an unchanged pull; re-anchors after a changed pull
- [X] T043 [US3] Playwright journey part 3 in tests/e2e/study/library-git-sync.spec.ts: @ a synced note in a lesson (intercepted request carries it with its label), highlight in a synced PDF, full-text search hit, menus show only allowed actions
- [X] T059 [US3] Linked-folder rename keeps @ names (FR-019, R13): in src/store/library.ts `renameFolder`/`moveFolder` on a linked folder or any ancestor folder pushes every affected mirrored item's old full Library path onto its `previousNames` in the same catalog write (M2); covered by T037's rename case

## Phase 6: User Story 4 — Manage the link (P3)

**Goal**: details, token replace/remove, unlink with confirm, relink reattach, 10-link limit.

**Independent Test**: spec US4 — replace a token (valid, invalid), unlink after confirm, folder and files gone while highlights/references remain ("Removed from the repo"), relink reattaches.

- [X] T044 [P] [US4] Extend tests/repo-links-api.test.ts: PATCH token replace/remove (old one gone from git-tokens.json, mask changes, next pull uses it); DELETE unlinks: schedule stopped, token deleted, linked folder + mirror folders + items become removed entries with `removedBecause:"unlinked"` keeping annotations/cards, `files/.mirrors/<linkId>` deleted; relink of the same address+branch revives ids and marks; same address+branch while linked → `already_linked` before any fetch, same address on another branch allowed (FR-001); DELETE while a pull of that link runs awaits it and discards its result; 11th link → `limit_links` before any fetch (SC-010)
- [X] T045 [US4] Implement `unlinkMirror(linkId)` in src/store/library.ts and PATCH/DELETE in src/server/repo-links.ts and app/api/library/links/[id]/route.ts; limit and duplicate checks in create
- [X] T046 [P] [US4] Build components/library/repo-details-dialog.tsx per ui-contract.md (address without credentials, branch, last sync, commit, token mask, Replace/Add/Remove token, Sync now, Unlink…)
- [X] T047 [US4] Unlink confirm: variant of components/library/delete-item-dialog.tsx with "Unlink {folder}?" text, red pill, focus on Cancel; linked folder's "Delete folder" and the details dialog's "Unlink…" open it, in components/library/library-view.tsx
- [X] T048 [US4] Playwright journey part 4 in tests/e2e/study/library-git-sync.spec.ts: details dialog shows mask only; replace token; unlink confirm → folder gone, reference reads "Removed from the repo"; relink → highlight back

## Phase 7: Polish & cross-cutting

- [X] T049 [P] Tenancy: tests/tenant-repo-links.test.ts — two tenants' links, tokens, pending rows, mirrors, events and schedules are invisible to each other; no-tenant access in hosted mode throws (SC-007)
- [X] T050 [P] Secrets: tests/repo-secrets.test.ts — a sync with a sentinel token, then scan captured console output, every response body from the links/library routes, catalog.json, index shards, the mirror and git-work leftovers for it (SC-006); assert the token is never in `auth.json`, never in `process.env`, and absent from the Settings keys listing (FR-004, R8); assert no model call happens during link, pull or unlink (FR-026); add `git-tokens.json` to the secret refusal list in scripts/build-server.mjs
- [X] T051 [P] Startup: assert in tests/startup-module-graph.test.ts that `isomorphic-git` is absent from startup and client graphs; re-measure with the 025 script into `~/agent-runs/2026-11-08-library-git-sync/startup-after.md` (≤ +5%, SC-008)
- [X] T052 [P] Electron standalone: extend scripts/smoke-server.mjs to run one fixture sync against the built standalone server (proves the trace carries isomorphic-git)
- [X] T053 [P] DESIGN.md Library section: linked folders, status line, repo menus, unlink confirm, read-only line (from ui-contract.md)
- [X] T054 Run impeccable and web-design-guidelines on the Library changes at 320/390/1440 (light/dark); record findings and fixes in specs/026-library-git-sync/reviews.md
- [X] T055 Gates: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`, scripts/check-library-ui.mjs and scripts/check-library-folders-ui.mjs; pre-existing failures recorded separately in progress.md
- [X] T056 Live check per quickstart.md "Manual" against a local fixture repo only (served by tests/fixtures/git-remote.ts, with a token-protected variant): no live private repo was provided by the owner (gate 2, 2026-11-08); record that in progress.md and the Report; evidence under `~/agent-runs/2026-11-08-library-git-sync/`
- [X] T057 Write the Report in specs/026-library-git-sync/progress.md (what changed, how verified, what is left; implementation/commit/merge/deploy status separately)

## Dependencies & execution order

- Setup (T001–T003) → Foundational (T004–T013, T058) → stories.
- US1 (T014–T023) needs Foundational. US2 (T024–T033) needs US1's `applyMirror` and `pull` (T015, T017). US3 (T034–T043, T059) needs US1; T059 after T038; independent of US2 except T042's "changed pull" case. US4 (T044–T048) needs US1; relink test uses US2's revive logic (T025).
- Polish after the stories it covers; T056 uses the local fixture repo only (no owner credentials needed).

## Parallel examples

- Foundational: T004, T007, T010 together; T008 and T011 in parallel once T005/T006 land; T058 after T005 and T012.
- US1: T014, T016, T020 together; then T015 → T017 → T018.
- US2: T024, T026, T028, T031 together.
- US3: T034, T037, T039, T040, T042 together.
- Polish: T049–T053 together.

## Implementation strategy

- **MVP = Phases 1–4 (US1 + US2, both P1)**: linking plus automatic sync is what the owner asked for. Stop and validate with quickstart after Phase 4.
- Then US3 (use in study), US4 (manage), Polish. Each phase ends with its Playwright part green and `npm test` green.
