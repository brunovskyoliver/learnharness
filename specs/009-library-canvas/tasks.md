---
description: "Tasks for feature 009: Library and canvas pages"
---

# Tasks: Library and canvas pages

**Input**: `specs/009-library-canvas/`: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: required. The spec names test scenarios and the constitution requires gate commands. Tests make no model requests (`node:test` through `tsx`; scripted engines for jobs). Write a story's tests before its code.

**Before any task**: the owner answers plan.md Owner decisions 1-3 (editor, wording, visual reference) and confirms or changes the defaults in 4-15. Tasks assume the plan's defaults. Editor: TipTap (owner, 2026-10-30).

**Format**: `- [ ] T001 [P] [US1] Description with path`. `[P]` means different files and no unfinished dependency.

## Phase 1: Setup

**Purpose**: a browser, a baseline and the config.

- [X] T001 Run `npm test`, `npm run lint` and `npm run typecheck` on the branch before changes and record existing failures in specs/009-library-canvas/progress.md
- [X] T002 Set up a temporary `@sparticuz/chromium` and a `--no-sandbox` wrapper under `~/agent-runs/2026-10-30-feature-009/` (not in the repo, per research R13), re-run the audit's 12 browser-dependent tests with `CHROME_PATH`, and record the results in specs/009-library-canvas/progress.md
- [X] T003 Measure the startup baseline from `main` with scripts/measure-session-performance.mjs through `LH_BROWSER_URL` using that browser, ten runs desktop and mobile, and save it under `~/agent-runs/2026-10-30-feature-009/`; note in progress.md that this resolves `TODO(PERF_BASELINE)` for this feature
- [X] T004 [P] Add `experimental.proxyClientMaxBodySize: "51mb"` to next.config.ts with a comment pointing at research R4
- [X] T005 [P] Add `PATHS.library` to config.ts and fix the `PATHS.files` comment so it no longer says hosted only
- [X] T006 Write the "Library, @ list and page pane" section in DESIGN.md from contracts/ui-contract.md, including the opacity ruling under "Settings and secondary views" (FR-010, FR-012)

---

## Phase 2: Foundational

**Purpose**: types and the store that US1-US4 share. No story starts before this phase ends.

- [X] T007 [P] Tests for name rules, kind detection and limits in tests/library-core.test.ts
- [X] T008 [P] Create src/core/library.ts with item types, the accepted extensions per kind, `MAX_FILE_BYTES` = 52,428,800, `REFERENCE_INLINE_MAX_BYTES` = 32 KiB, `REFERENCE_MESSAGE_MAX_BYTES` = 64 KiB, `REFERENCE_MAX_PER_MESSAGE` = 8, `OUTLINE_MAX_BYTES` = 8 KiB, `PAGE_MAX_BYTES` = 1,048,576, and `uploadName` moved from src/server/files.ts ("NFC, trimmed, 1-200 characters, no separators, no leading dot, no control characters")
- [X] T009 Add the `LibraryStore` port to src/core/ports.ts and `library-changed` to `ServerEvents` in src/core/events.ts
- [X] T010 Tests for the catalog in tests/library-store.test.ts: reconcile adds existing files with bytes unchanged, skips symlinks, tombstones vanished files, recovers a crash mid-rename by size and mtime, refuses a newer `version`, refuses to recreate an unreadable catalog, and two tenants never see each other
- [X] T011 Create src/store/library.ts with the catalog (temp file and rename, `version: 1`), reconcile, a per-tenant lock through `tenantScoped`, `writeUpload` (stream to `<data>/tmp`, `fs.link` to target, unlink temp), rename with `previousNames`, and delete leaving a tombstone; wire it in src/server/stores.ts

**Checkpoint**: `npm test` green for the store; nothing visible yet.

---

## Phase 3: User Story 1 - Keep class documents in one library (P1) MVP

**Goal**: upload, list, search, rename, open and delete in a full Library view, replacing Settings → Files, in hosted and desktop modes.

**Independent test**: upload a file, reload, find it, delete it after confirming; no chat.

### Tests

- [X] T012 [P] [US1] Route tests in tests/library-api.test.ts per contracts/library-api.md: 201; 409 with `suggestedName` and original bytes unchanged; 411; 413 before reading; 415 by extension and by content; 400 for empty and for a received length differing from the declared; concurrent same-name uploads leave one winner; symlink at target gives a conflict with the outside file untouched; `nosniff` and no HTML served as HTML; works with `LH_HOSTED` on and off
- [X] T013 [P] [US1] Rework tests/tenant-files.test.ts: keep all jail tests; move upload tests to the new route; assert documents uploaded through the Library are readable through `resolveSourcePath` and `read`; assert a rename is seen by `ls`
- [X] T014 [P] [US1] Render tests in tests/render-library.test.tsx: loading, empty, failed with Try again, failed refresh keeps the list; every row action's accessible name includes the item's name; delete dialog names the item
- [X] T015 [P] [US1] Render test in tests/render-settings.test.tsx: no Files section in either mode

### Implementation

- [X] T016 [US1] Create src/server/library.ts with item handlers, and app/api/library/route.ts, app/api/library/upload/route.ts, app/api/library/items/[id]/route.ts, app/api/library/items/[id]/content/route.ts, all through `withTenant`; export from src/server/index.ts
- [X] T017 [US1] Remove src/server/files.ts and app/api/files/route.ts and its exports from src/server/index.ts
- [X] T018 [US1] Create src/server/library-text.ts: text info and the `library/derived/<id>.json` cache, PDF info after upload through `pdfInfo` with a yield between pages and one at a time per tenant, setting `textState`
- [X] T019 [US1] Create components/library/upload.ts: one XHR per file in sequence, with progress, and clash handling through 409
- [X] T020 [US1] Create components/library/library-view.tsx, library-row.tsx and delete-item-dialog.tsx, built with the `shadcn` skill, per contracts/ui-contract.md
- [X] T021 [US1] Create app/(app)/library/page.tsx with `withTenantPage`
- [X] T022 [US1] Add the Library entry to components/sidebar.tsx and pass the extended graph check in tests/startup-module-graph.test.ts
- [X] T023 [US1] Read-only opening for documents: a new-tab link for PDF and images, and a small read-only view for text kinds in components/library/library-view.tsx (moved into the pane by T059)
- [X] T024 [US1] Remove components/settings/files-section.tsx and the `files` entry, `FolderIcon` and hosted filter in components/settings/settings-dialog-content.tsx
- [X] T025 [US1] Update docs/hosting.md: storage layout at line 65 and the upload limit at line 90
- [X] T026 [US1] Add upload, clash and delete to scripts/check-library-ui.mjs (isolated data, own server, modeled on scripts/smoke-sidebar-ui.mjs), including a file above 51 MB through the real proxy to prove the truncation refusal, at 320, 390 and 1440 px

**Checkpoint**: US1 is usable alone.

---

## Phase 4: User Story 2 - Refer to library items with @ in any conversation (P1) MVP

**Goal**: @ in every composer and answer field; the agent receives items; labels say what happened.

**Independent test**: in two sessions, send a message with a reference; the turn shows the label and a stubbed agent's context holds the item.

### Tests

- [X] T027 [P] [US2] Parser tests in tests/library-refs.test.ts: email, inline and fenced code, spaces in names, longest match, case and NFC, punctuation after a name, duplicates, tombstones, `previousNames`, `mentionQuery` caret rules
- [X] T028 [P] [US2] Resolution tests in tests/library-references.test.ts covering every row of the table in contracts/references.md, including exactly 32 KiB and one byte more, the message limit, `no-room`, the ninth reference, and a read error
- [X] T029 [P] [US2] Wire tests in tests/native-references.test.ts: a message without references produces identical output, golden fixtures unchanged; `</library_item` escaped; tool-result adjacency held for answers and parallel question batches; `needsContinuation`, `endsInDismissal` and `reconstructRequestCause` unchanged; `references` never reaches the provider shape
- [X] T030 [P] [US2] Answer tests in tests/references-answers.test.ts: `compactAnswerForModel` output unchanged; quiz grading and confidence unchanged; "I don't know" and dismissals carry no references; client-sent `references` ignored; the client view carries no material and no answer data it lacked before
- [X] T031 [P] [US2] Handler tests in tests/references-handler.test.ts: references are on disk before the turn starts; a refused gate persists nothing; a steer with no live turn persists nothing; no model call is made on behalf of a reference (scripted engine counts calls); `library_list` and `library_read` in all three registries, with hosted and desktop paths, wrapped output and tombstone sentences
- [X] T032 [P] [US2] Prompt tests in tests/prompt-overrides.test.ts: hosted composes `shared/31-files-hosted.md`, desktop composes the other, practice gets its own fragment and no shared file mechanics
- [X] T033 [P] [US2] Component tests in tests/render-references.test.tsx: every label in contracts/ui-contract.md; deleted item label; tests/mention-keys.test.ts for the pure key decision: Enter and Tab insert, Escape claimed, no-match falls through, IME ignored
- [X] T034 [P] [US2] Image tests in tests/image-job.test.ts with a scripted engine: job kind `image` runs on role `pdfReader`; no vision slot refuses with no model call; `read` refuses a Library image and still reads others

### Implementation

- [X] T035 [US2] Create src/core/library-refs.ts: `parseReferences`, `mentionQuery`, `renderReferences`, and export from src/core/index.ts without KaTeX or TypeBox
- [X] T036 [US2] Extend src/core/native-messages.ts: `references` on the carriers, `newUserMessage`, `newUserSteer` and `newThinkingMessage` parameters, and `toLlmMessages` stripping the field and adding material
- [X] T037 [US2] Extend `inputAppends` in src/core/input-events.ts to take resolved references, writing them onto the carriers and into `details.references` for answers
- [X] T038 [US2] Create src/server/library-references.ts per contracts/references.md, adding the outline builders to src/server/library-text.ts and `pdfOutline` to src/agent/subagents/pdf-ops.ts
- [X] T039 [US2] Call the resolver in src/server/chat-handler.ts after `ensureCompacted` and before `inputAppends`, and in app/api/chats/[id]/steer/route.ts before `steerLiveChat`
- [X] T040 [US2] Strip `material` in `clientMessages` in src/server/chats.ts and in live stream message events; count it in `estimateMessageTokens` and write names only in the summary serializer in src/core/compaction.ts; write one label line in src/core/session-markdown.ts
- [X] T041 [US2] Add the `data-library-references` part in src/core/view.ts and create components/library/references-card.tsx, rendered from components/chat.tsx, components/answered-card.tsx and components/practice-cards.tsx
- [X] T042 [US2] Create src/agent/tools/library.ts (`library_list`, `library_read`, exporting `readTextSlice` from src/agent/tools/read.ts), register in src/agent/tools.ts and src/agent/tools/practice.ts, and add activity labels in src/core/pending.ts
- [X] T043 [US2] Add job kind `image`: src/core/contracts/jobs.ts, src/agent/tools/jobs.ts, `KIND_ROLE.image = "pdfReader"` in src/agent/subagents/runner.ts, new src/agent/subagents/image-reader.ts, job and steer cards in components/artifacts/; refuse Library images in src/agent/tools/read.ts
- [X] T044 [US2] Replace src/agent/prompts/shared/30-learner-files.md, add shared/31-files-hosted.md, shared/31-files-desktop.md and practice/20-library.md, verbatim from approved contracts/doctrine.md; filter in `listSourceSegments` in src/agent/prompt-segments.ts; update src/agent/prompts/README.md
- [X] T045 [US2] Update the 2026-09-19 comment in src/agent/tools/fs-shared.ts from contracts/doctrine.md, plus the header of src/agent/tools/read.ts and the `createTeacherTools` comment in src/agent/tools.ts (FR-008)
- [X] T046 [US2] Create components/library/use-library-mention.ts (small, no heavy imports) and components/library/mention-menu.tsx (dynamic, fetched on first trigger), per contracts/ui-contract.md
- [X] T047 [US2] Wire the hook into components/composer.tsx (covers chat, Home and new session), both textareas in components/question-dock.tsx and components/practice-dock.tsx; add the pre-send line; confirm draft, `reload-recovery` and `?prompt=` paths need no change
- [X] T048 [US2] Extend scripts/check-library-ui.mjs: keyboard path in all five fields, Escape layering with intercepted model submissions, label shown after send, at 320, 390 and 1440 px

**Checkpoint**: MVP complete. Run the gate commands and stop for an owner check before Phase 5.

---

## Phase 5: User Story 3 - Write and edit canvas pages beside the chat (P2)

**Goal**: pages with versions in a pane beside the chat.

**Independent test**: create a page, edit, reload with an unsaved draft and lose nothing; restore an older version.

### Tests

- [X] T049 [P] [US3] Store tests in tests/library-pages.test.ts: versions are append-only; a content file with no line is skipped; draft compare-and-swap gives 409 `stale`; restore adds one version and keeps all others; `PAGE_MAX_BYTES` gives 413 with the draft kept; a dirty draft is committed before restore
- [X] T050 [P] [US3] Route tests in tests/library-pages-api.test.ts per contracts/library-api.md, including a tenant scope check
- [X] T051 [P] [US3] Draft logic tests in tests/page-draft.test.ts on the pure reducer behind `use-page-draft`: reload restores local text, failed PUT keeps text and says so, two-tab conflict with Keep mine and Use latest both keep both texts, clean tab follows an update, dirty tab keeps its text
- [X] T052 [P] [US3] Render tests in tests/render-page-pane.test.tsx: save states, conflict line, history, the editor exposes an accessible name and visible focus

### Implementation

- [X] T053 [US3] Add versions, draft and restore to src/store/library.ts per data-model.md ("`bytes` at most 1,048,576"; content file with flag "wx" written before its line)
- [X] T054 [US3] Add page handlers to src/server/library.ts and create app/api/library/pages/route.ts, pages/[id]/route.ts, pages/[id]/draft/route.ts, pages/[id]/versions/route.ts, pages/[id]/versions/[n]/route.ts, pages/[id]/restore/route.ts
- [X] T055 [US3] Extract components/workspace-pane.tsx from components/artifacts/demo-panel.tsx, with no change to demo behavior; confirm scripts/smoke-demo-workspace.mjs passes
- [X] T056a [US3] Before T056: add TipTap with Markdown and math extensions, measure the chunk, and test Markdown round trips in tests/page-editor-roundtrip.test.ts on a corpus of headings, lists, tables, code, inline and display math, links and demo title links. Any loss of content blocks the phase and goes to the owner.
- [X] T056 [US3] Create components/library/page-editor.tsx, the single swappable editor component, using TipTap, loaded on demand, storing Markdown, hidden scrollbars
- [X] T057 [P] [US3] Create components/library/page-preview.tsx, read-only rendering for version history only (dynamic; existing Streamdown setup from components/ai-elements/message.tsx, debounced 200 ms) and page-history.tsx
- [X] T058 [US3] Create components/library/use-page-draft.ts (local backup, 1 s draft save, version on Save, close and leave, conflict state) and subscribe to `library-changed` through components/server-events.tsx
- [X] T059 [US3] Create components/library/page-pane.tsx and page-pane-context.tsx; mount in app/(app)/layout.tsx scope, components/chat.tsx and library-view.tsx; move T023's read-only view into the pane; add the "New page" action that T020 left out until pages exist; keep the one live demo iframe; make automatic demo opening respect an open page
- [X] T060 [US3] Add the phone full-screen layer with Back to chat and focus containment in components/library/page-pane.tsx and app/globals.css
- [X] T061 [US3] Make bold demo titles in the preview use `DemoPanelContext` as chat does, and render plain outside a chat
- [X] T062 [US3] Extend scripts/check-library-ui.mjs: reload with an unsaved draft, two real tabs, restore, phone layer, pane resize at 320, 390 and 1440 px

**Checkpoint**: pages work for the learner, and @ can reference them (T038 already handles kind `page`).

---

## Phase 6: User Story 4 - The agent creates and revises pages (P2)

**Goal**: page tools, a quiet row, a toggle.

**Independent test**: with a stubbed model, a tool call creates a page; a row links to it and it appears in the Library.

### Tests

- [X] T063 [P] [US4] Tool tests in tests/page-tools.test.ts: create; revise with `content` and with `edits`; a stale base refuses after committing the learner's draft as a version; a `find` matching zero or two times refuses; repeated `toolCallId` is idempotent; refused during a dangling question and an active problem; versions attributed to `agent` and restorable; no learner or agent text lost in any order
- [X] T064 [P] [US4] Toggle tests in tests/settings-body.test.ts and tests/render-settings.test.tsx: `pages` accepted; off removes `page_create` and `page_revise` from teacher and practice registries; `library_read` stays; the prober never holds page tools
- [X] T065 [P] [US4] Row tests in tests/render-page-row.test.tsx: each headline in contracts/ui-contract.md; running shows no input; opening from the row
- [X] T066 [P] [US4] Test in tests/chats-delete.test.ts or the existing chat deletion test: deleting a session keeps the page and clears `origin.chatId`

### Implementation

- [X] T067 [P] [US4] Create src/core/page-edits.ts with pure find/replace
- [X] T068 [US4] Create src/agent/tools/pages.ts per contracts/agent-tools.md and register in src/agent/tools.ts and src/agent/tools/practice.ts behind `enabled?.pages`
- [X] T069 [US4] Add `pages` to `TOGGLEABLE_TOOLS` in src/core/pending.ts and to `TOGGLE_TOOLS` and `TOOL_COPY` in components/settings/agent-section.tsx; add activity labels
- [X] T070 [US4] Add headlines to src/core/lookups.ts and create components/library/page-row.tsx on the components/artifacts/lookup-row.tsx skeleton; extend the native-focus list in components/chat.tsx:873 if the owner wants these rows included
- [X] T071 [US4] Add src/agent/prompts/teacher/47-pages.md verbatim from approved contracts/doctrine.md
- [X] T072 [US4] Clear `origin.chatId` on session deletion in src/server/chats.ts through the store
- [X] T073 [US4] Extend scripts/check-library-ui.mjs with a stubbed tool result: row opens the pane; open draft plus revision shows the conflict or update line

**Checkpoint**: all P1 and P2 stories work.

---

## Phase 7: User Story 5 - Settings meets DESIGN.md (P3)

**Goal**: audit findings 5-14 closed, search across rows, row links. Independent of the other stories except T024.

**Independent test**: findings resolved at 320, 390 and 1440 px, deep links and persistence still work.

### Tests

- [X] T074 [P] [US5] tests/settings-index.test.tsx: drift test between `data-settings-row` and the index in every section and mode; "thinking" and "font" find rows; desktop-only and hosted-only rows filtered
- [X] T075 [P] [US5] Extend tests/render-settings.test.tsx: type classes, radii, no `border-b` on connection rows, no `opacity-` on text in components/settings, dimmed row uses muted ink with a locked control, failed save reads in words with Show details and Try again, failed load has Try again that refetches, coarse-pointer classes on small controls

### Implementation

- [X] T076 [US5] Create components/settings/settings-index.ts, moving `TOOL_COPY` there, and add `rowId` to `SettingsRow` in controls.tsx plus `data-settings-row` on rows in agent-section.tsx, appearance-section.tsx, keyboard-section.tsx, update-settings.tsx, keys-section.tsx, connection-controls.tsx and graph-display-section.tsx
- [X] T077 [US5] Add search results under category headings and the row jump effect in components/settings/settings-dialog-content.tsx, keeping the keys unfold (finding 5, FR-017)
- [X] T078 [P] [US5] Type scale in components/settings/controls.tsx lines 34 and 54 (finding 6)
- [X] T079 [US5] Radii in every file listed under finding 7 in contracts/ui-contract.md
- [X] T080 [P] [US5] Remove the separator in components/settings/connection-controls.tsx:8 (finding 8)
- [X] T081 [US5] Coarse-pointer 44 px targets in every file listed under finding 9
- [X] T082 [US5] Muted ink and locked controls in controls.tsx, graph-display-section.tsx, keys-section.tsx, agent-section.tsx and toggle.tsx, and a scoped override for components/ui/field.tsx; update the 2026-09-20 comment in controls.tsx (finding 10)
- [X] T083 [US5] Plain errors, Show details and Try again; loading skeleton and load retry in components/settings/settings-dialog-content.tsx (findings 11 and 12)
- [X] T084 [P] [US5] Correct the scrollbar comments at components/settings/settings-dialog-content.tsx:132 and 306 (finding 14); record finding 13 as closed by T020 and T024 in progress.md
- [X] T085 [US5] Extend scripts/check-library-ui.mjs: settings search and jump, Escape, deep link, persistence after reload, at 320, 390 and 1440 px

**Checkpoint**: SC-005 can be checked against the audit.

---

## Phase 8: Polish and gates

- [ ] T086 [P] Update PRODUCT.md: add the Library and pages paragraph, primary surfaces and "Settings retain searchable categories"
- [ ] T087 [P] Finish the DESIGN.md section from what was built, update "Settings and secondary views" and the sidebar section, and update design-system/ if it mirrors a changed token
- [ ] T088 [P] Update docs/ui-review.md with Library review routes; add a Library sample to scripts/seed-review.mjs if the owner wants it in review data
- [ ] T089 Extend tests/startup-module-graph.test.ts per research R14 and confirm no `components/library/page-*` in sidebar, home or graph entries
- [ ] T090 Check all new UI with the `impeccable` and `web-design-guidelines` skills; fix findings; DESIGN.md wins any disagreement
- [ ] T091 Run all quickstart.md scenarios at 320, 390 and 1440 px and save evidence under `~/agent-runs/2026-10-30-feature-009/`
- [ ] T092 Measure startup against T003 with the same browser, and record against the 5% budget (SC-004)
- [ ] T092a Amend .specify/memory/constitution.md principle III with the owner-approved exception (agent-made pages survive session deletion and lose their chat link), bumping the version to 1.1.1 or as the governance rule requires, with a Sync Impact entry.
- [ ] T093 Run the gates: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, scripts/check-library-ui.mjs and the existing browser regressions; record existing failures separately from new ones
- [ ] T094 Check a standalone build: 50 MiB upload through `node .next/standalone/server.js`, and a live Electron check that the Library and opening a PDF in a new window work
- [ ] T095 Walk spec.md's acceptance scenarios and success criteria, and audit findings 1, 2, 4 and 5-14, and write the final Report in specs/009-library-canvas/progress.md, noting that finding 3 (backups) stays with the owner

---

## Dependencies

- Phase 1, then Phase 2, then stories.
- US1 needs Phase 2. US2 needs US1's store and routes.
- US3 needs Phase 2 and can run beside US2; T059 uses T023.
- US4 needs US3's store and pane, and US2's `library_read`.
- US5 needs only T024 from US1, and can run any time after Phase 1.
- Phase 8 needs the stories chosen for release.

### Parallel examples

- US1 tests: T012, T013, T014, T015 together.
- US2 tests: T027 to T034 together, then T035 before T036 to T041.
- US3: T057 beside T056 once T055 is done.
- US5: T078, T080 and T084 at any point.

## Implementation strategy

**MVP (stories 1-2, through T048)**: the Library replaces Settings → Files, uploads reach 50 MB and never overwrite, every field offers @, references reach the agent with labels, images go through the vision job, and prompts are correct in both modes. Pages do not exist yet. It ships without the editor decision being implemented, though Owner decisions 2 and 3 still apply.

**Then**: US3 and US4 together, because agent revision needs the pane and draft. US5 can land before or after them.

Implementation, commit, merge and deployment status are recorded separately. Nothing is pushed or deployed unless Oliver asks.

## Requirement traceability

| Requirement | Tasks in |
|---|---|
| FR-001, FR-002, FR-003, FR-013, FR-015 (uploads) | Phases 2-3 (US1) |
| FR-004, FR-005, FR-008, FR-009, FR-014, FR-015 (images) | Phase 4 (US2) |
| FR-006, FR-011 | Phase 5 (US3), T056a |
| FR-007, FR-016 | Phase 6 (US4) |
| FR-012, FR-017 | Phase 7 (US5) |
| FR-010 | T006, every UI phase, Phase 8 |
| SC-001, SC-003 | T095, Phase 4 tests |
| SC-002 | Phases 5-6 tests |
| SC-004 | T003, Phase 8 |
| SC-005 | Phase 7, T095 |
