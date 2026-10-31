# Implementation Plan: Library and canvas pages

**Branch**: `feat/009-library-canvas` | **Date**: 2026-10-30 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/009-library-canvas/spec.md`, including the owner's rulings under Clarifications.

## Summary

Five pieces, built in story order:

1. **Library store.** Document bytes stay in the tenant's flat `files/` folder, so the jailed fs tools keep working. A new `library/` folder holds a catalog, page versions and cached text. Existing files join the catalog when the Library is listed. All writes move to `src/store/library.ts`. Same-name uploads get a 409 and never overwrite.
2. **@ references.** The menu only inserts `@name` into the field's text. The server parses that text against the catalog when it accepts the input, so drafts, Home's `?prompt=` path, retries and steers need no new client state. Resolved references are stored on the message that carries them: the user message, the practice thinking marker or the answer's tool result. `toLlmMessages` adds the material at the wire.
3. **Pages.** Append-only versions on disk, one server-side learner draft with compare-and-swap, and an editor in a resizable pane shared with the demo workspace.
4. **Agent tools.** `library_list`, `library_read`, `image` (a vision job), `page_create` and `page_revise`, with a new `pages` toggle in Settings → Agent.
5. **Settings.** Audit findings 5-14, a static search index, and generic row deep links.

**Editor: TipTap rich text (owner, 2026-10-30), overriding the recommended textarea.** Added size about 154 KB gzip, loaded only when a page opens. Pages stay stored as Markdown with math, behind `components/library/page-editor.tsx`. Markdown round-tripping is the main risk: T056a must pass before the pane is built on it.

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js 16.3.2.

**Primary Dependencies**: TipTap with Markdown and math extensions (owner-approved, 2026-10-30; startup cost measured in T003 and T056a). Reused: `pdfjs-dist` through `src/agent/subagents/pdf-ops.ts`, Streamdown with `@streamdown/math`, Radix through existing shadcn primitives, `nanoid`, the job runner.

**Storage**: files, per [data-model.md](data-model.md). No database.

**Testing**: `node:test` through `tsx`, no model calls; scripted engines where a job must run. One browser regression, `scripts/check-library-ui.mjs`, using `CHROME_PATH` (research R13).

**Target Platform**: hosted (tenant-scoped, one Node process per `docs/hosting.md`) and desktop (Electron standalone server).

**Project Type**: web application with a file-backed server and an Electron wrapper.

**Performance Goals**: initial JS, cold sidebar readiness and startup within 5% of baseline. The composer gains a small hook only. The menu, the Library view, the editor and the preview are dynamic chunks.

**Constraints**:
- 50 MiB per file (52,428,800 bytes), one file per request.
- `experimental.proxyClientMaxBodySize: "51mb"`.
- Inline limit 32 KiB per item and 64 KiB per message; at most 8 references per message; outline at most 8 KiB.
- Page content at most 1 MiB.
- Hidden scrollbars; 320, 390 and 1440 px; 44 px coarse targets.

**Scale/Scope**: production today has 1 tenant, 5 chats and no `files/` folder (audit). Listing is designed for up to a few thousand items per tenant.

## Settled decisions

Each has its reasoning in research.md.

| Question | Decision | Research |
|----------|----------|----------|
| Existing hosted files | Bytes stay in `files/` under the same names. Listing adds missing catalog entries and never touches bytes. | R2 |
| Jailed fs tools | Unchanged. `ls`, `find`, `grep`, `read` and the `pdf` job still read documents. A rename also renames the file, so names agree. Pages are reached through `library_read` only. | R2 |
| Same-name upload | `link()` to the target, which fails on an existing name. The API answers 409 with a free name. The UI offers Keep both or Cancel. There is no Replace, because originals are never edited. | R3 |
| 50 MB uploads | One raw-body request per file, streamed to `<data>/tmp`. Declared size above 50 MiB gets 413 before reading. Received bytes must equal the declared length, because the proxy truncates silently. | R4 |
| Inline limit | 32 KiB per item, 64 KiB per message, and no more than half the room left before compaction. | R5 |
| Outline | Headings or pages, capped at 8 KiB, built without a model. | R6 |
| Reference storage | On the carrier message, not a new marker. A marker between a question call and its result breaks the provider shape rule. | R7 |
| Prompt injection | Material is wrapped in escaped `<library_item>` tags with a fixed preamble. Tools wrap their output the same way. | R8 |
| Answer secrecy | Grading fields and `compactAnswerForModel` output are unchanged. Page tools refuse while a question dangles or a problem is active. | R9 |
| Concurrent edits | Version base checks plus compare-and-swap on one draft. Conflicts keep both texts. Nothing merges automatically. | R10 |
| Images | Agent-called `image` job on the vision slot, role `pdfReader`. No vision model means a labeled refusal at send, with no model call. `read` refuses images inside the Library folder. | R11 |
| Settings search | Static index module with a drift test against rendered rows. | R12 |
| Row deep links | `data-settings-row` on rows, with a generic scroll-and-focus effect. Providers keep their unfold behavior. | R12 |
| Browser checks | Temporary Chromium from npm outside the repo, launched with `--no-sandbox` through a wrapper. Probed on this machine. | R13 |
| Startup | Dynamic chunks everywhere, enforced by `tests/startup-module-graph.test.ts`. | R14 |

## Constitution Check

*Pre-design: pass, with the owner items below still open. Re-checked after Phase 1: pass, same items.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I Owner decides | Pass, approvals pending | The clarifications are honored as written. The editor is decided: TipTap. Doctrine, tool descriptions, UI strings and layout defaults are drafts marked for approval in [contracts/doctrine.md](contracts/doctrine.md) and [contracts/ui-contract.md](contracts/ui-contract.md). The open list is under Owner decisions below. Implementation must not start until they are answered. |
| II Teaching theory first | Pass | Grading and `compactAnswerForModel` output do not change. Page tools refuse during a pending question or active problem, and doctrine forbids writing a posed answer into a page. Practice never announces its target. Reference material never enters graph extraction, which reads message content only. |
| III Learner data is never lost | Pass, owner-approved exception | References are written ahead with the input; a refused gate persists nothing. Versions are append-only. Conflicts keep both texts. Uploads no longer overwrite and deletes confirm. The spec's assumption that items outlive sessions conflicts with "deleting a session removes its traces" for agent-made pages (owner decision 6). |
| IV Honest states | Pass | Every reference has a label naming its mode and reason. Missing items, unreadable PDFs and a missing vision model are stated to both learner and agent. Library and Settings show loading, empty and failed states with Try again. A failed refresh keeps the last list. |
| V Consent before cost | Pass | Upload and text extraction use no model. Sending a reference starts no extra model call. The `image` job runs only when the agent calls it inside a turn the learner started, and it shows in the activity dock with cost and abort. See owner decision 10. |
| VI Interface follows DESIGN.md | Pass | DESIGN.md gains the section first. Opacity dimming goes, per the clarification. Build with `shadcn`, check with `impeccable` and `web-design-guidelines`. Hidden scrollbars in the list, editor, preview and menu. |
| VII Boundaries, tenancy and sandboxing | Pass, fixes an existing breach | `src/server/files.ts` writes the filesystem today, outside `src/store`. This feature moves those writes. New core modules are pure. Every route uses `withTenant`, checked by `tests/tenant-routes.test.ts`. `PATHS.library` fails closed through `dataRoot()`. Page locks use `tenantScoped`. The jail is untouched. Served content gets `nosniff` and a download disposition except for PDF and raster images. |
| VIII Performance does not regress | Pass, measurement pending | No heavy code in the startup graph; the module-graph test is extended. The recorded baseline does not exist yet (`TODO(PERF_BASELINE)`), so T003 measures it from `main` before any code changes. |

## Project Structure

### Documentation

```text
specs/009-library-canvas/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── library-api.md
│   ├── references.md
│   ├── agent-tools.md
│   ├── doctrine.md
│   └── ui-contract.md
└── tasks.md
```

### Source Code

```text
config.ts                              PATHS.library
next.config.ts                         experimental.proxyClientMaxBodySize
src/core/
├── library.ts                         item types, kinds, limits, name rules (new)
├── library-refs.ts                    @ parser, mention query, wire rendering (new)
├── page-edits.ts                      find/replace edit application (new)
├── native-messages.ts                 carrier field, toLlmMessages
├── input-events.ts                    inputAppends takes resolved references
├── view.ts, lookups.ts, pending.ts    label part, rows, toggle, activity labels
├── compaction.ts                      counts material, summary keeps names only
└── ports.ts                           LibraryStore port
src/store/library.ts                   all library filesystem writes (new)
src/server/
├── library.ts                         route handlers (new; replaces files.ts)
├── library-references.ts              resolve references for one input (new)
├── library-text.ts                    text, outline and PDF caching (new)
├── chat-handler.ts, chats.ts          resolve before write-ahead; strip material
└── stores.ts, index.ts                wiring and exports
src/agent/tools/
├── library.ts                         library_list, library_read (new)
├── pages.ts                           page_create, page_revise (new)
├── jobs.ts, read.ts, fs-shared.ts     image job; read refusal; comment updates
├── ../tools.ts, practice.ts           registration and the pages toggle
├── ../subagents/image-reader.ts       vision call (new)
└── ../subagents/runner.ts             KIND_ROLE.image = "pdfReader"
src/agent/prompts/
├── shared/30-learner-files.md         Library, both modes
├── shared/31-files-hosted.md          new, composed when hosted
├── shared/31-files-desktop.md         new, composed on desktop
├── teacher/47-pages.md, practice/20-library.md   new
app/(app)/library/page.tsx             full view (new)
app/api/library/**                     routes (new); app/api/files removed
components/library/
├── library-view.tsx, library-row.tsx, delete-item-dialog.tsx
├── upload.ts                          XHR upload with progress
├── mention-menu.tsx, use-library-mention.ts
├── page-pane.tsx, page-editor.tsx, page-preview.tsx, page-history.tsx
├── use-page-draft.ts, page-pane-context.tsx
└── references-card.tsx, page-row.tsx
components/workspace-pane.tsx          resizable shell extracted from DemoPanel (new)
components/settings/settings-index.ts  search index (new)
scripts/check-library-ui.mjs           browser regression (new)
```

**Structure decision**: follows the existing layout and the lint zones in `eslint.config.mjs`. No new package.

## Owner decisions

Items 1 to 3 block implementation. The rest have a stated default that the plan assumes, and each is cheap to change now.

1. **Page editor technology.** Decided: TipTap (owner, 2026-10-30).
2. **Wording.** Doctrine, tool descriptions and UI strings in the contracts are drafts, as in feature 008.
3. **Visual reference.** Features 001, 002 and 008 had a design canvas as binding reference; 009 has none. Either approve `contracts/ui-contract.md` as the reference or ask for a canvas first.
4. **A page opened from the Library, with no chat on screen.** The spec says pages open beside the chat. Default: the pane sits beside the list and stays open when the learner then goes to a session.
5. **Does an agent-made page open itself?** US4 says "shown" and its scenario says a row opens it. Default: the row opens it, and nothing takes over the pane.
6. **Agent-made pages after a session is deleted.** The spec keeps them; constitution III says a deleted session's traces go. Default: the page stays and its link to the chat is cleared.
7. **Deleting an item that was inlined earlier.** Default: bytes and versions go; the name stays as a tombstone so labels stay honest; text already inlined in old messages stays in those records and keeps reaching the model until compaction, because chat records are append-only. Scrubbing would need a new ruling.
8. **Storage quota.** The spec caps each file but not the total. Default: no quota. Backups remain audit finding 3, and 50 MB files make it more pressing.
9. **Proxy memory.** `proxyClientMaxBodySize` buffers each request in memory before auth runs, so any caller, signed in or not, can hold up to 51 MB per request. It is also an experimental option. Default: accept it for the current deployment. A Caddy rate limit is the mitigation if that changes.
10. **FR-009 and FR-015 read together.** FR-009 bars a reference from starting a model call; FR-015 requires images to go through the vision model. Default: the vision call happens only when the agent asks for it during the turn. A learner who wants a guaranteed look must say so in the message.
11. **Which agents hold page tools.** Default: teacher and practice. The prober does not, since it assesses and does not teach.
12. **Pages and demos.** "Interactive content uses the existing demos." Default: a bold demo title in a page opens the demo as chat does. Pages do not embed iframes.
13. **Library search.** FR-002 says search. Default: names only, not contents.
14. **A hand-typed exact name.** Because the server parses text, typing `@notes.pdf` without using the list still counts as a reference. The pre-send line shows this. Default: accept.
15. **Browser checks.** Default: use the temporary Chromium in R13. Numbers from it are comparable only with each other, so the baseline must use the same binary.

## Complexity Tracking

No constitution violations to justify.
