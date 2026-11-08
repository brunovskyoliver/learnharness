# Implementation Plan: Library git sync

**Branch**: `unified-redesign` | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: spec.md with gate-1 answers (Q1–Q5) and gate-2 approvals ("go", 2026-11-08), [research.md](research.md) (R1–R16), [data-model.md](data-model.md), [contracts/api.md](contracts/api.md), [contracts/ui-contract.md](contracts/ui-contract.md), [quickstart.md](quickstart.md).

## Summary

A Library folder can be linked to an HTTPS git repo. The server pulls one branch shallowly with isomorphic-git (server-only, dynamically imported) every 15 minutes (local/Electron: while the process runs; hosted: while the user has a window open, plus once on open) and on "Sync now". Each pull reads the tip's tree, keeps the Library's supported kinds, and writes them into a new snapshot under `files/.mirrors/<linkId>/<snapshotId>/`; one atomic catalog write then swaps the mirror's folders and items (stored under additive catalog keys `repoLinks` and `mirrored`, so the catalog version and older apps are untouched), and the old snapshot is deleted. Mirrored entries are identified by repo key + path, so a file that leaves and returns, or an unlink and relink, keeps its id and its highlights, notes, flashcards and references. Tokens live in a 0600 `git-tokens.json` per tenant, masked to the client. The store refuses rename/move/trash inside the mirror and anything added, moved or restored into it, and refuses trashing a folder that holds a linked folder; marks work. A mirrored item's @ name is its full Library path (ancestor folders, linked folder, repo path; M2). "The same repo" is address + branch; a duplicate link is refused. Hosted refuses loopback/private/link-local/unspecified addresses at connect time (SSRF, DNS rebinding; M1). At most 2 pulls run per server. The Library view gets "Link a repo", a status line, a repo details dialog and an unlink confirm, built from existing paper components.

## Technical Context

**Language/Version**: TypeScript 5.6, Node 24, React 19.2, Next.js 16.3 App Router (read `node_modules/next/dist/docs/` before touching route conventions).

**Primary Dependencies**: existing stack plus `isomorphic-git` 1.44.4 (exact pin; owner-approved new server-only runtime dependency; deps pako, sha.js, simple-get, async-lock, crc-32, clean-git-ref, diff3, ignore, minimisted, pify). Startup cost: measured, expected 0 (dynamic import only, R15).

**Storage**: file-backed JSON per tenant: `library/catalog.json` (+`repoLinks`, +`mirrored`), `files/.mirrors/…` bytes, `git-tokens.json` (0600), temp `library/git-work/`. No database.

**Testing**: `npm test` (tsx --test) with an in-memory `RepoRemote` fake and a real smart-HTTP fixture remote (`git http-backend` behind a Node server on 127.0.0.1); Playwright `tests/e2e/study/library-git-sync.spec.ts`; tenant tests; startup-module-graph assertion; SC-006 sentinel-token scan.

**Target Platform**: local web, Electron (standalone server), hosted (Clerk, one process, tenants under `users/<id>`).

**Project Type**: web application (Next.js app + file-backed server stores).

**Performance Goals**: link of ≤ 200 files under 1 min (SC-001); unchanged-tip poll is one ref request, no fetch; startup and initial JS ≤ +5% (SC-008).

**Constraints**: constitution I–VIII; FR-025 additive catalog; limits 2,000 files / 500 MB of supported files after skips / 10 links, plus a 500 MB download cap (FR-029); pull pool 2 per server, FIFO across tenants (FR-015; memory: isomorphic-git buffers packs); hosted address block (FR-030); no model calls (FR-026); token never logged or sent (FR-004).

**Scale/Scope**: ≤ 10 links × 2,000 files per user; ~12 new or changed server/store/core files, ~6 Library components, ~10 test files.

## Constitution Check

*Pre-research and re-checked after Phase 1 design: pass.*

| Principle | Status | How |
| --- | --- | --- |
| I Owner decides | Pass | Gate-1 answers Q1–Q5, the six request decisions and the gate-2 approvals (2026-11-08, "go") are in spec Clarifications. The design proposals in research.md (branch in the identity / duplicate link refusal R3, hosted address blocking R6, token file R8, pool of 2 R9, refusing additions into the mirror and trashing a folder holding a link R11, @ path names R13, the download cap and what counts toward 500 MB R16, isomorphic-git 1.44.4 R5) and every UI string in ui-contract.md are marked **Owner approved 2026-11-08**. Remaining technical choices are reversible and logged in progress.md. |
| II Teaching theory first | Pass | No lesson, practice, question or graph behaviour changes. Synced files are material like uploads. |
| III Learner data is never lost | Pass | Highlights, notes, flashcard links and references survive upstream deletes and unlinks (removed entries keep id and annotation files, R3); the mirror bytes are not learner data (the repo holds them). Atomic swap keeps the last good mirror (R4). The learner's own files are never edited; the repo is never written. Catalog stays v1, additive, diagrams' split pattern (R2). Golden fixtures unchanged. |
| IV Honest states | Pass | never/pending, syncing, synced and failed are distinct; failure keeps the last mirror and says why with redacted detail on demand; skipped files are named; limits name the overshoot; refusals are 400/409/422 with codes (contracts/api.md). |
| V Consent before cost | Pass | No model call. Background pulls are network work the owner asked for (15-minute cadence, hosted only while open); "Sync now" is explicit. Not an externally visible action: read-only fetch. BYOK rule mirrored for tokens: never logged, printed or sent beyond the mask. |
| VI Interface follows DESIGN.md | Pass | Toolbar word, quiet rows, faint status line, lifted dialogs, red pill for unlink, existing menus and read-only view; hidden scrollbars, keyboard, focus, 44 px coarse targets, 320/390/1440; shadcn while building, impeccable and web-design-guidelines before done. DESIGN.md's Library section gains the repo-link rules at the end (docs task). |
| VII Boundaries, tenancy and sandboxing | Pass | Hosted refuses loopback/private/link-local/unspecified addresses and redirects to them (FR-030, R6). `src/core/repo-link.ts` pure; filesystem writes only in `src/store/library.ts` (mirror apply), `src/store/repo-tokens.ts`; git and network in `src/server/repo-git.ts`. Every path under `PATHS` (tenant-scoped); registries `tenantScoped`; scheduler hosted presence from the tenant's SSE. Agent tools: hosted jail unchanged and still realpath-checked; the mirror never writes symlinks; `.git` work dirs sit outside `files/`. Tokens out of logs, catalog, chat, agent context (SC-006 test). |
| VIII Performance does not regress | Pass, to be measured | isomorphic-git only through `import()` in one server file; no new startup hook (scheduler armed by the first SSE connection); startup-module-graph test asserts it; startup JS measured before/after with 025's script. |

No violations; Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/026-library-git-sync/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md, progress.md
├── checklists/requirements.md
└── contracts/api.md, contracts/ui-contract.md
```

### Source Code

```text
src/core/repo-link.ts                # NEW pure: parseRepoAddress, repoKey, branch check, classifyEntry, limits, overshoot text, RepoLink types
src/core/library.ts                  # + MirrorRef, origin "repo", removedBecause, refusal codes + messages, catalog keys
src/core/library-refs.ts             # "Removed from the repo" wording; @ path names for mirrored items (R13)
src/core/events.ts                   # + "library-sync"
src/core/ports.ts                    # documentPath(Pick<"name"|"mirror">); mirror methods on LibraryStore
src/store/library.ts                 # split/merge mirrored keys; reconcile/takenKeys skip mirrors; refusals (R11);
                                     #   applyMirror (snapshot swap), unlinkMirror, sweepMirrors; documentPath/readText routing
src/store/repo-tokens.ts             # NEW 0600 git-tokens.json adapter
src/server/repo-git.ts               # NEW the only isomorphic-git importer: RepoRemote (tip, snapshot), http wrapper (https-only,
                                     #   byte cap, timeouts, hosted address check), error mapping, redactSecrets
src/server/repo-sync.ts              # NEW scheduler: per-tenant single-flight, pool of 2, presence, clock seam, pending links
src/server/repo-sync-hooks.ts        # NEW lazy windowOpened/windowClosed for events-stream
src/server/repo-links.ts             # NEW route logic (list, create, sync, patch token, unlink)
src/server/events-stream.ts          # call hooks on start/stop
src/server/library.ts                # list adds links; refusal statuses; content route retry (R4)
src/server/index.ts                  # export the new responses
app/api/library/links/route.ts, app/api/library/links/[id]/route.ts, app/api/library/links/[id]/sync/route.ts   # NEW thin routes
src/agent/tools/library.ts           # library_list prints folder path + file path for mirrored items
components/library/library-view.tsx  # "Link a repo"; toolbar hidden inside a mirror; status line; menus per ui-contract
components/library/repo-link-dialog.tsx      # NEW link dialog (lifted dialog, line fields)
components/library/repo-details-dialog.tsx   # NEW details + token replace/remove
components/library/repo-status-line.tsx      # NEW faint status line + skipped list
components/library/folder-row.tsx, library-row.tsx, delete-item-dialog.tsx (unlink variant), read-only-view.tsx, pdf-reader.tsx, mention-menu.tsx, references-card.tsx
scripts/build-server.mjs             # refuse git-tokens.json in the bundle
scripts/smoke-server.mjs             # one fixture sync in the standalone server
package.json, package-lock.json      # isomorphic-git 1.44.4
tests/fixtures/git-remote.ts         # NEW bare repo builder + smart-HTTP server
tests/*.test.ts (see quickstart), tests/e2e/study/library-git-sync.spec.ts
DESIGN.md                            # Library section: linked folders
```

**Structure Decision**: the existing single Next.js project; core/store/server/agent layering as today (lint boundaries). One new server-only dependency behind one file.

## Complexity Tracking

None.
