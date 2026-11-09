# Data model: Library git sync

All shapes are additive to `src/core/library.ts`. `CATALOG_VERSION` stays 1 (FR-025). Field names are the plan's; the store owns every write (VII).

## On disk

```text
<data root>/                      # PATHS.data; per tenant in hosted mode
├── git-tokens.json               # NEW 0600 { [linkId]: token } (R8)
├── files/
│   ├── <uploads, flat>           # unchanged
│   └── .mirrors/<linkId>/<snapshotId>/<repo path>   # NEW, current snapshot only after a pull (R1, R4)
└── library/
    ├── catalog.json              # + repoLinks, + mirrored (R2)
    ├── annotations/<itemId>.json # unchanged; kept for removed mirrored entries (R3)
    └── git-work/<linkId>-<nanoid>/   # NEW temp gitdir during a pull, removed after (R5)
```

## catalog.json additions

```ts
interface LibraryCatalog {
  // existing: version, items, folders?, trash?, diagrams?
  repoLinks?: RepoLink[];
  mirrored?: { folders: LibraryFolder[]; items: (LibraryItem | LibraryTombstone)[] };
}
```

In memory, `mirrored.folders` join `folders` and `mirrored.items` join `items`; `writeCatalog` splits them back by the presence of `mirror` (as diagrams split by kind).

## MirrorRef (additive field on LibraryItem, LibraryTombstone and LibraryFolder)

```ts
interface MirrorRef {
  linkId: string;        // the link that holds it now (stale after unlink; repoKey is the identity)
  repoKey: string;       // R7: "<host>/<path>#<branch>"
  path: string;          // repo-relative, "/"-separated; "" for the linked folder itself
  oid?: string;          // items: blob oid at the last pull (change detection, R4 hard links)
  snapshot?: string;     // items: snapshot dir that holds the bytes now
}
```

- `LibraryItem.mirror?: MirrorRef` — a live mirrored file. `origin` is `{ type: "repo"; linkId }` (new `LibraryOrigin` variant; additive union member).
- `LibraryFolder.mirror?: MirrorRef` — `path: ""` marks the **linked folder**; any other path marks a **mirror folder** for that directory.
- `LibraryTombstone.mirror?: MirrorRef` plus `removedBecause?: "repo" | "unlinked"` — a **removed entry** (R3). Same `id` as the live item it was.

**Identity**: `(repoKey, path)` is unique among entries with `mirror` (live or removed). A pull or relink that sees a key with a removed entry revives it (same `id`, `removedBecause` and `deletedAt` dropped).

**Validation**:
- `path` segments each pass `uploadName()`; none starts with `.`; no segment is `node_modules`.
- `name` = last path segment; `kind` = `kindForName(name)` (never `other`: unsupported files are not mirrored).
- `size ≤ MAX_FILE_BYTES`; `previousNames` holds old @ paths (R13): the full Library path, ancestor folders + linked folder + repo path, `/`-joined (M2).
- Marks (`favorite`, `pinned`, `tags`, `archivedAt`) allowed on mirrored items and folders (Q5) and survive pulls.

## RepoLink

```ts
interface RepoLink {
  id: string;               // "rpl_<nanoid>"
  folderId: string;         // the linked folder (LibraryFolder with mirror.path === "")
  url: string;              // credential-free https URL as given (R7)
  display: string;          // "github.com/oliver/notes"
  repoKey: string;          // identity (R3, R7)
  branch: string;           // resolved at first pull when none was given
  branchGiven: boolean;     // false = "default branch"
  hasToken: boolean;        // the token itself lives only in git-tokens.json
  createdAt: string;
  sync: RepoSyncState;
}

interface RepoSyncState {
  state: "never" | "syncing" | "synced" | "failed";
  lastAttemptAt?: string;
  lastSuccessAt?: string;       // drives "Synced {n} min ago"
  commit?: string;              // tip oid the current mirror reflects
  failure?: SyncFailure;        // present only when state === "failed"
  counts?: { files: number; bytes: number; added: number; changed: number; removed: number; revived: number };
  skipped?: { unsupported: number; hiddenOrIgnored: number; named: SkippedFile[] };
}

interface SyncFailure {
  code: "auth" | "not-found" | "network" | "limit-files" | "limit-bytes" | "too-large-download" | "server" | "storage" | "address-blocked"; // address-blocked: hosted block on a later pull (phase 2, flagged in progress.md)
  message: string;              // plain sentence (ui-contract.md)
  detail: string;               // raw, redacted (R6); "Show details"
  limit?: { kind: "files" | "bytes"; limit: number; found: number };
}

interface SkippedFile { path: string; reason: "too-large" | "bad-name" | "lfs" | "submodule" | "symlink" | "content-mismatch" }
```

**State transitions**

```text
(link request) ──first pull ok──▶ synced          (folder, items, token written in one go)
       └──────first pull fails──▶ (nothing stored; refusal returned)
synced|failed ──scheduled / Sync now──▶ syncing
syncing ──ok──▶ synced            (mirror swapped; counts; failure cleared)
syncing ──fails──▶ failed          (mirror, commit, lastSuccessAt untouched; failure set)
syncing ──process stops──▶ (on next read) failed with code "server", "The last sync was interrupted." ; next pull completes it
any ──unlink──▶ (link removed; folder + mirror folders + items → removed entries; token deleted; snapshot dirs deleted)
```

`never` is the state of a link whose first pull is in flight (shown as syncing in the dialog; no catalog link exists yet, FR-002). It is kept in the type for the client's pending row.

## Pending link (memory only)

`{ requestId, display, folderName, parentId, startedAt }` held by the scheduler per tenant while the first pull runs, so `GET /api/library/links` can return a `pending` row (US1 #5) without writing a folder or a token.

## Limits (R16)

| Constant | Value | Where checked |
| --- | --- | --- |
| `REPO_MAX_LINKS` | 10 per user | link create, before any fetch |
| `REPO_MAX_FILES` | 2,000 supported files per link | after the tree walk, before writing |
| `REPO_MAX_BYTES` | 500 MB of supported files per link, after skips; also the transfer cap | while reading blobs; HTTP wrapper |
| `MAX_FILE_BYTES` | 50 MiB per file | per blob (skipped and named) |
| `REPO_SYNC_INTERVAL_MS` | 15 min | scheduler |
| `REPO_PULL_POOL` | 2 per server | scheduler |

## Server events

`library-sync: { linkId: string }` (new); `library-changed: { itemId }` per changed mirrored item and for the linked folder (existing).
