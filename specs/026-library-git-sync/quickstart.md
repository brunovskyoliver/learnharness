# Quickstart: validating Library git sync

Shapes: [data-model.md](data-model.md). Routes: [contracts/api.md](contracts/api.md). Screens and strings: [contracts/ui-contract.md](contracts/ui-contract.md).

## Prerequisites

- `npm install` after `isomorphic-git@1.44.4` is added (exact pin, server-only).
- `git` ≥ 2.30 on PATH for the fixture remote (`git http-backend`). Tests that need it skip with a stated reason when it is missing.
- No model keys: nothing here calls a model.

## Automated

```bash
npm test                     # unit + integration (fixture smart-HTTP remote on 127.0.0.1)
npm run lint && npm run typecheck && npm run build
npm run test:e2e -- --project study tests/e2e/study/library-git-sync.spec.ts
```

Expected:

| Check | Proves |
| --- | --- |
| `tests/repo-link-core.test.ts` | address rules, repo key, classification, limits, overshoot wording (FR-003, FR-007, FR-029) |
| `tests/library-mirror.test.ts` | mirror equals tip after add/change/delete/move; identity kept; removed entries keep annotations; revive on return and relink; marks survive; reconcile ignores mirrors; catalog round-trips through an older reader unchanged (FR-006, FR-010, FR-025, FR-028, SC-003, SC-004, SC-009) |
| `tests/library-mirror-faults.test.ts` | injected failure before/after each swap step leaves the last good mirror (FR-011, SC-005) |
| `tests/repo-git.test.ts` | real isomorphic-git: public, private+token, wrong token, missing branch, force-push, LFS/symlink/submodule skipped and named, limits, transfer cap, unchanged tip skips the fetch (FR-005, FR-017, US2 #5) |
| `tests/repo-sync-scheduler.test.ts` | fake clock: local arm + 15 min; hosted presence 0→1 pulls once, 1→0 stops (SC-011); single-flight Sync now; pool of 2 |
| `tests/repo-tokens.test.ts` | 0600, mask only, removed on unlink/replace; sentinel token absent from logs, responses, catalog, index, mirror (SC-006) |
| `tests/library-mirror-refusals.test.ts` | rename/move/trash refused inside the mirror; marks allowed; linked folder rename/move allowed, delete refused `repo_linked` (FR-012) |
| `tests/tenant-repo-links.test.ts` | two tenants cannot see each other's links, tokens, mirrors; jail reads mirrored files (FR-020, FR-024, SC-007) |
| `tests/library-references.test.ts` (extended) | @ path token resolves; removed entry reads "Removed from the repo" (FR-019, FR-028) |
| `tests/startup-module-graph.test.ts` (extended) | isomorphic-git absent from startup and client graphs (SC-008) |
| `library-git-sync.spec.ts` | link → syncing → tree → open read-only file → push + Sync now → updated → unlink confirm → gone → relink → highlight back; 320/390/1440 |

## Manual (live check against a local fixture repo)

No live private repo was provided (owner, gate 2, 2026-11-08): the live check uses the fixture remote from `tests/fixtures/git-remote.ts` on 127.0.0.1 (token-protected variant for the private case) with `LH_TEST_GIT_LOOPBACK_HTTP=1`; record that in progress.md.

1. `LH_TEST_GIT_LOOPBACK_HTTP=1 npm run dev:fresh`, open `/library`, "Link a repo", paste the fixture repo's `http://127.0.0.1:<port>/…` address + its test token, folder "Lecture notes", Link. Expect the tree within a minute (SC-001).
2. Push a change; wait ≤ 16 min with the window open (SC-002), or press Sync now (≤ 1 min).
3. Highlight a passage in a synced PDF; delete the file upstream; Sync now → references read "Removed from the repo"; restore it upstream; Sync now → highlight back.
4. Revoke the token → Sync now → "Sync failed · The repo refused the token." and the files stay; Replace token → next sync works.
5. Hosted (`LH_HOSTED=1` with Clerk; `LH_TEST_GIT_LOOPBACK_HTTP=1` lets 127.0.0.1, and only it, past the hosted address block, never in production): close all windows for > 15 min, push, reopen → one pull on open.
6. `grep -r "<token>" data/ ~/.next 2>/dev/null` and server logs → nothing (SC-006).
7. Startup JS before/after with the 025 script (≤ +5%, SC-008).

Bitbucket access tokens (user `x-token-auth`) are not covered by R6's `x-access-token` user; a Bitbucket repo is expected to fail with the auth sentence.
