# API contract: repo links

Every route is `withTenant`-wrapped (hosted: 401 without a session) and `force-dynamic`, with `Cache-Control: no-store`. Bodies are JSON. No response ever carries a token, an `Authorization` value or an address with credentials (FR-004, SC-006). Thin route files under `app/api/library/links/`; logic in `src/server/repo-links.ts` (the import law).

## Shapes returned

```ts
interface RepoLinkView {
  id: string;
  folderId: string;
  display: string;            // "github.com/oliver/notes"
  url: string;                // credential-free
  branch: string;
  branchGiven: boolean;
  tokenMask: string | null;   // maskKey(token), e.g. "ghp_…a1b2"
  sync: RepoSyncState;        // data-model.md; failure.detail included (already redacted)
}
interface PendingLinkView { requestId: string; display: string; folderName: string; parentId: string | null; startedAt: string }
```

## GET /api/library/links

200 `{ links: RepoLinkView[], pending: PendingLinkView[], limits: { maxLinks: 10, maxFiles: 2000, maxBytes: 524288000 } }`.

## POST /api/library/links

Body `{ url: string; token?: string; branch?: string; folderName: string; parentId: string | null; requestId: string }`.

Runs the first pull in the request (≤ the 10 min transport timeout; SC-001 expects < 1 min for 200 files). While it runs the link appears in `GET` as `pending` and `library-sync` fires with `{ linkId: requestId }`.

| Status | Body | When |
| --- | --- | --- |
| 201 | `{ link: RepoLinkView, folder: LibraryFolder }` | first pull succeeded; folder, items, link and token written |
| 400 | refusal `not_https` / `credential_in_address` / `invalid_address` / `invalid_branch` / `invalid_name` | address, branch or folder name refused before any fetch |
| 404 | refusal `folder_missing` | `parentId` gone |
| 409 | refusal `name_taken` (+ `suggestedName`) / `repo_folder` / `already_linked` / `limit_links` | clash, parent inside a mirror, same repo+branch linked, 11th link |
| 422 | `{ refused: "sync_failed", failure: SyncFailure }` | first pull failed (auth, not-found, network, limits, server); nothing stored, token dropped |
| 403 | refusal `address_blocked` | hosted only, private/loopback address (R6, owner approved 2026-11-08) |

## POST /api/library/links/:id/sync

"Sync now". 202 `{ link: RepoLinkView }` with `sync.state: "syncing"`; joins a running pull (FR-015). 404 unknown id.

## PATCH /api/library/links/:id

Body `{ token: string }` replaces the token (stored only; the next pull uses it) or `{ token: null }` removes it. `{ restore: true }` (owner, 2026-11-08: the Undo of "Remove token") puts back the token removed within the last 10 s, held only in server memory; once only; a new token or an unlink ends the window. 200 `{ link }`; 400 empty token; 404 unknown; 409 `{ code: "undo_expired" }` when nothing is held.

## DELETE /api/library/links/:id

Unlink (after the client's confirm). Stops the schedule for it (a running pull is awaited, then discarded), deletes the token, turns the linked folder, mirror folders and items into removed entries (`removedBecause: "unlinked"`), deletes `files/.mirrors/<linkId>`. 200 `{ ok: true }`; 404 unknown.

## Changed existing routes

| Route | Change |
| --- | --- |
| `GET /api/library` | `items` and `folders` include mirrored entries with `mirror` and `origin: {type:"repo"}`; adds `links: RepoLinkView[]` so the view renders states without a second request |
| `PATCH /api/library/items/:id` (rename, move) | mirrored item → 409 `repo_file`; move into a mirror folder → 409 `repo_folder`; `marks` unchanged |
| `DELETE /api/library/items/:id`, trash | mirrored item → 409 `repo_file` |
| `PATCH /api/library/folders/:id` | mirror folder rename/move → 409 `repo_file`; linked folder rename/move allowed; move into a mirror → 409 `repo_folder` |
| `DELETE /api/library/folders/:id`, trash | linked folder → 409 `repo_linked`; mirror folder → 409 `repo_file`; folder holding a linked folder → 409 `holds_linked` (owner approved 2026-11-08) |
| `POST /api/library/upload`, folders, pages, diagrams, trash restore | target inside a mirror → 409 `repo_folder` (owner approved 2026-11-08) |
| `GET /api/library/items/:id/content` | resolves mirrored path; one retry on ENOENT (R4) |
| pages/diagrams write routes | a mirrored id never matches (they are documents) — unchanged 404 |

## New refusal codes (additive to `LibraryRefusalCode`)

`repo_file`, `repo_folder`, `repo_linked`, `holds_linked`, `not_https`, `credential_in_address`, `invalid_address`, `invalid_branch`, `already_linked`, `limit_links`, `address_blocked`, `sync_failed`. Messages in ui-contract.md.

## Server events

`library-sync { linkId }` — start and end of every pull, pending first pulls included. Clients refetch `GET /api/library/links` (notify → fetch).
