# Research: Library git sync

**Feature**: 026 | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

Grounded in the code as of `adc0021`: `src/store/library.ts` (catalog, reconcile, lock, trash), `src/core/library.ts` (kinds, names, refusals), `config.ts` (`PATHS`, `tenantScoped`, `runAsTenant`, `authFile`), `src/store/auth.ts` + `src/server/keys.ts` (key store, env reflection), `src/server/events-stream.ts` (SSE), `src/agent/tools/fs-shared.ts` (hosted jail), `src/agent/tools/read.ts`, `src/agent/tools/library.ts`, `src/server/library-index.ts`, `src/store/library-annotations.ts`, `src/core/library-refs.ts`, `components/library/*`.

Items marked **Owner approved 2026-11-08** were proposals the plan could not settle under principle I; the owner approved all of them at gate 2 ("go") and they are encoded in spec.md (Clarifications, gate 2). Everything else is a reversible technical choice the spec already constrains.

## R1. Where mirrored bytes live

- **Decision**: `files/.mirrors/<linkId>/<snapshotId>/<repo path>` inside the tenant's `PATHS.files`.
- **Rationale**:
  - `files/` is flat by name today; `reconcile()` reads only its top-level regular files (`entry.isFile()`), so a sub-directory is invisible to it and can't be tombstoned or adopted as an "existing" item.
  - `uploadName()` refuses a leading dot, so no upload, rename or restore can ever take the name `.mirrors`; `takenKeys()` adds the directory's name to the taken set, which is harmless for the same reason.
  - The hosted jail (`jailedPath`) is `realpath(PATHS.files)`; anything under `files/.mirrors` is inside it, so FR-020 holds in hosted mode with no jail change, and the realpath check still stops `..` and symlinks (the mirror never writes symlinks, R5).
  - Local/Electron fs tools are not jailed; explicit absolute paths work. `read.ts`'s `isInLibraryFolder` already treats the path as Library, so a mirrored image goes through the image tool as uploads do.
- **Alternatives**: flat names in `files/` (collide: `week1/notes.md` vs `week2/notes.md` vs an upload `notes.md`; FR-009 forbids renaming); `library/mirrors/` outside `files/` (hosted agent tools could not read it without widening the jail, VII); one directory per link without snapshots (no atomic swap, R4).

## R2. Catalog shape (additive, older app keeps working)

- **Decision**: two new on-disk keys in `library/catalog.json`, `version` stays 1:
  - `repoLinks: RepoLink[]` — link records (data-model.md).
  - `mirrored: { folders: LibraryFolder[]; items: (LibraryItem | LibraryTombstone)[] }` — every mirror folder, every mirrored item and every removed mirrored entry.
  The store merges `mirrored.folders` into `folders` and `mirrored.items` into `items` on read and splits them out on write — the feature-022 `diagrams` pattern (`readCatalog`/`writeCatalog`). In memory each carries an additive `mirror` field (data-model.md).
- **Rationale**: an older app's `reconcile()` tombstones any document item with no file at `files/<name>` (the reason 022 moved diagrams out of `items`). Kept outside `items` and `folders`, an older app neither lists, tombstones nor deletes them, and `writeCatalog` rewrites unknown keys as they are (it writes the parsed object back). The linked folder's `parentId` may point at a normal folder; an older app sees that normal folder as empty and could delete it, after which `liveFolderId` reads the linked folder as top level — nothing is hidden.
- **Reconcile**: `reconcile()` skips entries with `mirror` (they have no flat file); `takenKeys()` and `nameTaken()` ignore mirrored names (FR-009: no clash with uploads); `siblingKeys()` still applies to the linked folder's own name at its parent (FR-001 clash handling).
- **Alternatives**: catalog version 2 (FR-025 forbids); mirrored entries in `items` (older app tombstones them); a separate `mirrors.json` (two files can't change in one atomic write, R4).

## R3. Stable identity per (repo, path) and reattach

- **Decision**: a mirrored entry's identity key is `repoKey + "\n" + path`, where `repoKey` is the normalized address plus the branch (R7). Removed entries are kept, not deleted: when a path leaves the tip (FR-028) or the link is unlinked, the item becomes a `LibraryTombstone` with additive `mirror` and `removedAt`, `removedBecause: "repo" | "unlinked"`, inside `mirrored.items`. Its `library/annotations/<id>.json`, `derived/<id>.json` and card links are kept (unlike `remove()`, which deletes them). When a pull or a relink finds a removed entry with the same key, it is revived with the same `id`. Folders follow the same rule keyed by directory path, so marks on mirror folders also reattach.
- **Rationale**: Q1 and Q2 ("same path returning gets the same identity", "relinking the same repo reattaches"). A link id can't be the key: a relink makes a new link. Tombstones already make references honest; the extra field only changes the sentence (R13).
- **Branch in the key**: two links to one repo on different branches would otherwise share identities. **Owner approved 2026-11-08**: "the same repo" means the same address and branch; linking an address+branch that is already linked is refused ("{address} ({branch}) is already linked as {folder}.").
- **Changed content at a kept path**: same id; `updatedAt` moves, `textState` goes to `pending` for PDFs, and feature 020's fingerprints re-anchor highlights as after any change (SC-004 covers unchanged files only).
- **Growth**: removed entries are small (id, name, kind, key, dates). They are never purged automatically; this mirrors tombstones today.

## R4. Atomic swap (a failed sync keeps the last good mirror)

- **Decision**: per pull:
  1. Fetch and read the tree (R5) into memory-bounded steps; write each supported blob to `files/.mirrors/<linkId>/<new snapshotId>/<path>` (`wx`, fsync). A blob whose oid equals the current snapshot's is hard-linked (`fs.link`) from it instead of rewritten.
  2. Under the Library lock: read the catalog, compute adds/changes/removals/revivals by key, update `mirrored`, the link's `sync` and each live item's `mirror.snapshot`, and write the catalog once (`writeCatalog` is temp + fsync + rename, so it is atomic).
  3. After the write, remove the old snapshot directory. On any failure before step 2 the new snapshot directory is removed and the catalog is untouched.
  4. On every pull and at scheduler arm, sweep `files/.mirrors/<linkId>/*` that no catalog entry names (crash leftovers) and `library/git-work/*` older than a day.
- **Readers during the swap**: a stream opened before the delete keeps reading the old inode (POSIX), so it sees the old version whole. The content route (`libraryContentResponse`) resolves the path from a fresh catalog; on `ENOENT` it re-reads the catalog once and retries, so it sees the new version whole. The client marks an open reader stale on `library-changed` for that item ("Updated from the repo" + Reload, ui-contract.md).
- **Disk**: at most two snapshots exist during a pull; unchanged files are hard links, so the extra space is the changed files only.
- **Alternatives**: a `current` symlink swapped by rename (atomic, but the jail and reconcile both avoid following symlinks; a second mechanism); rewriting in place (half-written mirror on crash, violates FR-011).

## R5. Git engine and fetch flow

- **Decision**: `isomorphic-git` pinned at exactly `1.44.4` (published 2026-10-23; 1.44.5+ are under two weeks old), owner-approved (request; version **Owner approved 2026-11-08**). Loaded only by `import("isomorphic-git")` inside `src/server/repo-git.ts`, the one file that imports it, like `ts-fsrs` in `src/server/card-scheduler.ts`. Transport `isomorphic-git/http/node`.
- **Flow** for one pull:
  1. `getRemoteInfo2` (protocol v2 where offered, else v1) → the branch's tip oid; for "default branch" the remote's `HEAD` symref names it (stored on the link at first pull).
  2. If the tip equals `link.sync.commit` and the mirror is whole: no fetch; only `lastSuccessAt` moves (US2 #5). This makes the 15-minute poll one small request.
  3. Otherwise `clone({ depth: 1, singleBranch: true, noCheckout: true, noTags: true, ref })` into a fresh temp gitdir `library/git-work/<linkId>-<nanoid>/` (outside `files/`, so agent tools in hosted mode never see `.git`), then `readTree` recursively from the commit's tree.
  4. Classify each entry: mode `120000` symlink, `160000` submodule → skipped and named; directories named `.git`, `node_modules` or starting with `.` → skipped (counted); names failing `uploadName()` → skipped and named; extension without `kindForName()` → counted as unsupported; blob that is a Git LFS pointer (under 1 KiB and starting `version https://git-lfs.github.com/spec/v1`) → skipped and named; over `MAX_FILE_BYTES` → skipped and named; `contentMatches()` false → skipped and named "contents don't match its type" (same rule as uploads).
  5. Limits (R16) checked before any blob is written: supported-file count from the tree walk; the 500 MB sum from blob sizes as they are read, stopping at the limit.
  6. Delete the temp gitdir in `finally`.
- **Why a fresh shallow clone on change**: isomorphic-git has no `gc`; refetching into one shallow repo grows the object store forever. A fresh depth-1 clone is the smallest correct thing, and step 2 makes it rare.
- **Memory**: isomorphic-git collects the packfile in memory before indexing; a 500 MB pack is 500 MB of RAM. Bounded by the process-wide pool (R9) and the transfer cap (R6).
- **Alternatives**: the system `git` binary (not on every Electron machine; shell-out is a new attack surface); `simple-git` (wraps the binary); a tarball API (host-specific).

## R6. HTTPS transport and token auth

- **Decision**:
  - `onAuth` returns `{ username: "x-access-token", password: token }` when a token is set (GitHub, GitLab, Gitea and Codeberg accept any username with a PAT as password); `onAuthFailure` returns `{ cancel: true }` so a wrong token fails once instead of looping. Bitbucket access tokens need `x-token-auth` as the user: out of scope for now, noted in quickstart.
  - The `http` client is wrapped: it refuses any request or redirect target that is not `https:` (the loopback test exception below), counts response bytes and aborts past 500 MB with the limit error (FR-029), and applies a 30 s connect / 10 min total timeout.
  - Errors are mapped to plain reasons (data-model.md `SyncFailure`): `auth` (401/403), `not-found` (404 or no such branch), `network` (DNS, TLS, timeout, reset), `limit-files`, `limit-bytes`, `limit-links`, `too-large-download`, `server` (other). The raw detail is kept for "Show details" after passing through `redactSecrets()`, which removes the token string and any `Authorization` header text.
  - **Owner approved 2026-11-08 (security, hosted)**: in hosted mode, at connect time, the host's resolved addresses are checked and loopback, private (RFC 1918, fc00::/7), link-local (169.254/16, fe80::/10) and unspecified addresses are refused ("This address can't be reached from the hosted app."), and so is every redirect target (checked again per request, so a redirect or DNS change can't reach them). Without this, a hosted user could make the server fetch from its internal network (SSRF). Local and Electron allow them (his own LAN git server).
  - **Connect-time enforcement (analyze M1, 2026-11-08)**: the check runs inside the request's own `lookup` hook (`node:https` `lookup` option), so every address is validated before the socket connects to that very address; a separate resolve-then-connect would leave a DNS-rebinding gap. IP-literal hosts (which Node connects to without a lookup) are checked before the request. Every redirect is a new request through the same hook. To own that hook, `src/server/repo-git.ts` uses its own small `node:http`/`node:https` client in isomorphic-git's `HttpClient` shape instead of `isomorphic-git/http/node`.
- **Tests over plain HTTP**: the URL validator takes an explicit `allowLoopbackHttp` option that only tests and the e2e server pass (env `LH_TEST_GIT_LOOPBACK_HTTP=1`, ignored when `NODE_ENV=production`); it accepts `http://127.0.0.1:<port>` only. **Analyze M3 (2026-11-08)**: the same flag (never in production) also lets 127.0.0.1, and only it, past the hosted address block, so hosted checks can run against the fixture remote.

## R7. Address validation and the repo key (pure, `src/core/repo-link.ts`)

- **Decision**: `parseRepoAddress(raw, options)` → `{ url, display, repoKey } | refusal`:
  - trimmed; `URL` parse; protocol must be `https:`, else refusal `not_https` ("Only HTTPS addresses are supported."); `git@…`, `ssh://`, `http://`, `file://` all land here.
  - `username`/`password` present → refusal `credential_in_address`; nothing is stored, and the refusal never echoes the address.
  - no query or fragment; path not empty.
  - `display` = host + path without a trailing `/` or `.git`; `repoKey` = the lowercased host, the path exactly as in `display` (no host is assumed case-insensitive), then `"#" + branch`.
- **Branch**: optional; validated with git's ref-name rules (`clean-git-ref` comes with isomorphic-git; the pure check is a small regex in core).

## R8. Token storage

- **Decision** (**Owner approved 2026-11-08**): `PATHS.data/git-tokens.json`, a flat `{ [linkId]: token }` map, mode 0600, written temp + chmod + rename exactly like `src/store/auth.ts`, read fresh on each use, through a new adapter `src/store/repo-tokens.ts`. Per tenant in hosted mode because `PATHS.data` is the tenant root. The client only ever gets `maskKey(token)` (from `src/core/auth-keys.ts`).
- **Why not auth.json itself**: in local mode `initAuthEnv()` reflects every var in `auth.json` into `process.env` (`isManagedName` is true for any name in the file) and `keyStatuses()` lists unknown vars on the Settings keys page. A git token would leak into the environment of every child process and appear as a stray key row. A sibling file with the same mechanics is "stored the way provider keys are" without either effect.
- **Packaging**: `data/` is already excluded from output tracing (`next.config.ts`) and `build-server.mjs` refuses leaked data; `git-tokens.json` is added to that refusal list (line 56's secret list). The dev data dir `data/` is already in `.gitignore`.
- **Lifecycle**: written only after the first pull succeeds (FR-002: a failed link keeps no token; the in-flight token lives in memory for that request); replaced in place on PATCH; deleted on unlink and on "Remove token".

## R9. Scheduler

- **Decision**: `src/server/repo-sync.ts` owns pulls:
  - Per tenant (`tenantScoped("__lhRepoSync", …)`): a single-flight map `linkId → Promise` (FR-015: a second "Sync now" joins the running pull and starts nothing), the interval timer, and the open-window count.
  - Process-wide pool of 2 concurrent pulls (globalThis), FIFO across tenants, for memory (R5). **Owner approved 2026-11-08**: the spec's edge case now reads "pulls from different tenants run independently, at most 2 at a time per server; a pull waits only behind the pulls queued before it" (FR-015).
  - Clock and timers injectable (`setClock` for tests; SC-011).
  - **Local / Electron**: armed by the first SSE connection of the process (Electron opens its window at start, so this is "soon after start"); at arm it pulls every link whose last attempt is over 15 minutes old, then every 15 minutes; it never disarms while the process runs. No new `instrumentation.ts` startup hook, so startup is unchanged (VIII).
  - **Hosted**: `eventsResponse()` already runs inside the tenant; it calls `windowOpened()` at start and `windowClosed()` in `stop()`. 0 → 1 open windows: one pull ("once on open"), then every 15 minutes; 1 → 0: the timer is cleared, a running pull finishes (timers set inside the tenant keep it, `config.ts` comment). Several windows share one timer.
  - The SSE route reaches the scheduler through a tiny hook module (`src/server/repo-sync-hooks.ts`) that does `import("./repo-sync.ts")` lazily, so neither the events route nor startup statically imports isomorphic-git.
- **Alternatives**: `instrumentation.ts` `register()` (a startup hook to measure, and hosted would need presence anyway); a client-side timer (would stop in a background tab, and FR-014 says server-side).

## R10. Sync state and live updates

- **Decision**: the link record carries `sync` (data-model.md); state `never | syncing | synced | failed`, with the last good commit, counts and skipped list. A new server event `library-sync: { linkId }` fires on start and end of a pull (added to `ServerEvents` and the subscribed list in `src/core/events.ts`); the mirror's catalog write emits `library-changed` per changed item id so open readers and the search index react as today. The Library view fetches `GET /api/library/links` on `library-sync`. "Synced {n} min ago" ticks on the client from `lastSuccessAt`.

## R11. Read-only enforcement (store first, UI second)

- **Decision**: refusals in the store so API, bulk actions, drag and drop and agent tools all get the same answer:
  - mirrored item: `rename`, `moveItem`, `trashItem`, `remove`, page/diagram writes → refusal `repo_file` (409) "{name} comes from the repo. Change it there."; `markItem` allowed.
  - mirror sub-folder: `renameFolder`, `moveFolder`, `trashFolder`, `removeFolder` → `repo_file`; `markFolder` allowed.
  - linked folder: `renameFolder`, `moveFolder`, marks allowed (Q5); `trashFolder`/`removeFolder` → refusal `repo_linked` (409) "{name} is linked to a repo. Unlink it to remove it." The UI never shows that refusal: its "Delete folder" opens the unlink dialog (Q5).
  - **Owner approved 2026-11-08**: putting anything *into* the mirror (upload with `folderId` in it, `createFolder`/`createPage`/diagram with a parent in it, `moveItem`/`moveFolder`/restore into it, drag onto it) → refusal `repo_folder` "{folder} mirrors a repo. Add files in the repo instead." Inside the mirror the toolbar hides Upload, New page, New folder and New diagram. Without this, FR-006 ("exactly the supported files of the branch tip") breaks.
  - **Owner approved 2026-11-08**: trashing or deleting a normal folder that contains a linked folder at any depth → refusal "{folder} holds the linked folder {name}. Move it out or unlink it first."
  - Moving the linked folder into another mirror → `repo_folder`; into its own subtree → existing `folder_cycle`.

## R12. Agent, search, references, cards

- **Decision**:
  - `documentPath(item)` takes `Pick<LibraryItem, "name" | "mirror">` and returns the snapshot path for mirrored items; `readText` and every direct `path.join(PATHS.files, item.name)` in `src/store/library.ts` (content checks, trash, rename) go through it or refuse first (R11).
  - `library_list` shows mirrored items with their folder path and the readable file path (so `read`/`grep` can be pointed at them); `library_read` works unchanged through `documentPath`. Synced content is material like every Library item (FR-021): it arrives inside the existing reference/tool wrappers.
  - Search: `library-index.ts` already indexes every live item via `documentPath`/`readText`; mirrored items join because `list()` includes them. Removed entries drop out as tombstones do.
  - Cards: card sources point at item ids; a removed entry reads as gone today; with R13 it reads "Removed from the repo".

## R13. References to removed files, and @ names for duplicate file names

- **Decision**: `referenceSentence` and the client line (`src/core/library-refs.ts`) read a tombstone with `removedBecause` as "This item was removed from the repo." (agent) and "Removed from the repo" (learner), instead of the deleted wording.
- **Owner approved 2026-11-08 (naming)**: @ tokens resolve by name (`nameTable` keeps one entry per name key), so `week1/notes.md`, `week2/notes.md` and an upload `notes.md` can't all be reached by `@notes.md`. Decision: a mirrored item's @ name is its Library path (e.g. `@Lecture notes/week1/notes.md`); `/` never appears in upload names, so it can't clash. Its display name stays `notes.md`. **Technical resolution of analyze M2 (2026-11-08)**: the path is the full one, every ancestor folder name + the linked folder's name + the repo path, `/`-joined (`@Physics/Lecture notes/week1/notes.md`), because folder names are unique per parent only and two linked folders named alike under different parents would otherwise give equal @ names. Renaming or moving the linked folder or any ancestor folder pushes each affected item's old path onto `previousNames` in the same catalog write, so old tokens still resolve.

## R14. Testing approach

- **Unit (no network)**: `src/core/repo-link.ts` (address, key, limits, classification), store mirror apply (adds/changes/removals/revivals, swap, crash points via injected failures, reconcile ignoring mirrors, older-app round trip of the catalog), token adapter (0600, masking, never in catalog), scheduler (fake clock: arm/disarm by presence, single-flight, pool), refusals (R11), references wording. The engine depends on a `RepoRemote` port (`tip(url, auth)`, `snapshot(url, auth, ref)` → entries with modes and bytes) with an in-memory fake.
- **Integration (real isomorphic-git)**: `tests/fixtures/git-remote.ts` builds bare repos with the `git` binary (2.43 present) in a temp dir and serves them over smart HTTP from a Node `http` server on 127.0.0.1 that runs `git http-backend` (CGI) and checks a Basic token when configured. Covers public, private with token, wrong token, missing branch, force-push, LFS pointer, symlink, submodule, unsupported files, limits (fixture with 2,001 small files; byte cap with a lowered test limit), transfer cap. Skipped with a stated reason if `git` is absent.
- **Playwright**: `tests/e2e/study/library-git-sync.spec.ts` starts the same fixture server in `beforeAll`; the e2e web server gets `LH_TEST_GIT_LOOPBACK_HTTP=1`; journey: Link a repo → syncing → folder tree → open a Markdown file (read-only line) → push upstream + Sync now → updated → unlink confirm → gone. At 320/390/1440.
- **Hosted**: `tests/tenant-*.test.ts` style: two tenants, links/tokens/mirrors invisible across; scheduler presence per tenant.
- **Secrets (SC-006)**: a test runs a sync with a sentinel token and greps captured console output, every API response body, `catalog.json`, the index shards and the mirror for it.

## R15. Startup and bundle (VIII)

- **Decision**: isomorphic-git and its deps are reachable only through `import()` in `src/server/repo-git.ts`; `tests/startup-module-graph.test.ts` gains an assertion that no startup or client chunk contains it; startup JS is measured before and after with the 025 method (`~/agent-runs/2026-11-07-unified-redesign/startup-js/startup-js.mjs`). The Library view's new dialogs are part of the Library route chunk (link dialog lazy on first open). Electron standalone: `scripts/smoke-server.mjs` runs one fixture sync to prove the traced bundle carries isomorphic-git.

## R16. Limits and constants (`src/core/repo-link.ts`)

- `REPO_MAX_FILES = 2000`, `REPO_MAX_BYTES = 500 * 1024 * 1024` (supported files' total; 500 MiB written as "500 MB" as the Library writes 50 MiB as "50 MB"), `REPO_MAX_LINKS = 10`, `REPO_SYNC_INTERVAL_MS = 15 * 60 * 1000`, `REPO_PULL_POOL = 2`, `MAX_FILE_BYTES` reused.
- **Owner approved 2026-11-08**: the per-link 500 MB counts the supported files that would be mirrored, after skips (skipped and unsupported files don't count). The download itself is also stopped at 500 MB (R6), because the server cannot know the supported files' size before it has the pack; a repo whose pack is over 500 MB but whose supported files are under it is refused with "The repo's download is over 500 MB."
- Overshoot wording: files "{n} supported files, {n − 2,000} over the 2,000 limit"; bytes "{size} of supported files, {size − 500 MB} over the 500 MB limit"; links "You have 10 linked repos, the most allowed." (ui-contract.md).
