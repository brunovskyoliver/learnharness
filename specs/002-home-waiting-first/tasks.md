# Tasks: Home leads with what's waiting

**Input**: Design documents from `specs/002-home-waiting-first/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/chat-summary-waiting.md, contracts/steer-cancel.md, quickstart.md

**Tests**: Included where the spec or constitution requires proof: the waiting projection's allowlist (Principle II), the cancel route's states (Principle IV), render tests for changed surfaces, and the dock smoke test (US6).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US6)

## Phase 1: Setup

- [ ] T001 Record baseline in specs/002-home-waiting-first/progress.md: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` results (pre-existing failures listed separately) and `node scripts/measure-session-performance.mjs` numbers
- [ ] T002 Reproduce the dock smoke test failure on unchanged code with `node scripts/smoke-dock-ui.mjs` (Chromium, see the script header); record the failing step and output in specs/002-home-waiting-first/progress.md

## Phase 2: Foundational (blocks US1, US2, US3)

- [ ] T003 Create `waitingItemOf(messages, updatedAt)` and the kind-label helper in src/core/waiting.ts per data-model.md: returns `{ toolCallId, kind, action, teaser, postedAt }` or null; `kind` is one of "Lesson check" | "Prediction" | "Question" | "Explain" | "Recall" | "Problem"; `action` is "Solve" for practice problems, else "Answer"; reads only the question text (`input.question`) or the problem statement, never any other input field; "For a practice session with both, the problem wins"; `postedAt` falls back to `updatedAt`. Reuse `danglingQuestionOf` / `activeProblemOf` from src/core/native-messages.ts. Export from src/core/index.ts
- [ ] T004 Move the turn-kind label logic out of components/question-dock.tsx into src/core/waiting.ts and import it back so the prompt bar and the list use one mapping
- [ ] T005 Add `waiting?: WaitingItem` to `ChatSummary` in src/core/contracts/chat.ts (doc comment: allowlisted, absent when nothing waits)
- [ ] T006 Compute `waiting` in `readSummary` in src/store/chats.ts beside `pendingQuestion` / `pendingProblem`
- [ ] T007 [P] Unit tests in tests/waiting.test.ts: each tool kind's label and action; problem wins over question; answered question → null; dismissed problem → null; serialized item has exactly the five keys and a quiz fixture's correct-answer and explanation text never appear (contracts/chat-summary-waiting.md)
- [ ] T008 Lift the `/api/chats` fetch, event-driven refresh and `createSidebarRefresh` coalescing out of `SessionsSidebar` (components/sidebar.tsx) into a `SessionListProvider` + `useSessionList()` in components/session-list.tsx, mounted in `AppShell`; sidebar reads from it with no behavior change (loading, error + "Try again", seeded `initialChats`)

**Checkpoint**: `npm test` and `node scripts/smoke-sidebar-ui.mjs` pass; sidebar unchanged visually.

## Phase 3: User Story 1 — See and answer what is waiting (P1) 🎯 MVP

**Goal**: Home opens with the composer, then "Waiting for you" with Answer/Solve rows.

**Independent Test**: Review data with two pending checks and one open problem; reach and answer each from Home only.

- [ ] T009 [US1] Create `WaitingSection` in components/waiting-section.tsx from `useSessionList()`: items = chats with `waiting`, sorted by `waiting.postedAt` descending; heading "Waiting for you" (22px, 600) with "{n} open" in meta; rows on `bg-card` (10px radius): kind in `text-primary` meta, then session title · time in muted meta, teaser one line via the existing `Teaser`/`teaserText` from components/question-dock.tsx at reading size, quiet `PrimaryAction` ("Answer"/"Solve") from components/prompt-controls.tsx linking to `/chat/<id>?answer=<toolCallId>`; phone layout stacks teaser (two lines max) above meta + button (canvas HomePhone)
- [ ] T010 [US1] States in components/waiting-section.tsx: loading skeleton rows; empty = heading + "Nothing is waiting. Every check is answered and every problem solved."; failed = words + "Try again"; a failed refresh keeps the last list
- [ ] T011 [US1] Rebuild the page layout in components/home.tsx: drop the absolute full-bleed `<main>` and floating dock; a scrolling column (`max-w-[52rem] px-4`, hidden scrollbar) with header (sidebar toggle + drag strip kept), h1 "What do you want to learn?" (title serif 30px), the existing `Composer` + `ComposerActions` (teach/practice, picks, setup gates unchanged), `WaitingSection`, then the graph section from US2 (temporarily the existing `GraphView`/`MinimalHome` in a fixed-height box)
- [ ] T012 [US1] Read `answer` in app/(app)/chat/[id]/page.tsx (Promise `searchParams`, like `prompt`) and pass it to the chat; in components/chat.tsx, when it equals the pending question's or active problem's `toolCallId`, set that dock's `dock/<toolCallId>/expanded` session state to true, jump to the bottom, then `router.replace` without the param; a stale id is ignored
- [ ] T013 [P] [US1] Render tests in tests/render-waiting-section.test.tsx: order newest first, labels/actions, link hrefs, quiet button (no amber fill), empty sentence, failed state; and a test that `?answer` with a stale id leaves the dock collapsed (tests/dock-summary.test.tsx or a new pure helper test)

**Checkpoint**: US1 works with the graph still in its old component inside a box.

## Phase 4: User Story 2 — The knowledge graph as a section (P1)

**Goal**: Live graph at a fixed height with Expand; Import notes in the section header.

**Independent Test**: Home with and without nodes; Expand/Escape; import notes from the header; rendering off shows the minimal summary.

- [ ] T014 [US2] Add a `section` presentation to `GraphView` in components/graph-view.tsx: relative container 420px tall (260px below `sm`), 10px radius, `bg-card`; chrome scaled to the box; an "Expand" button switches the same mounted element to a fixed full-viewport layer (no remount; camera, selection, search kept), Escape/Close returns and focuses Expand; reduced motion skips the transition
- [ ] T015 [US2] Remove the floating "Import notes…" button from the graph chrome in components/graph-view.tsx; expose the import trigger, progress and `NotesImportErrors` so the section header renders "Import notes" (upload icon + label, `prompt-secondary` style) and errors under it
- [ ] T016 [US2] Replace the empty-graph `Empty`/`EmptyMedia` placeholder in components/graph-view.tsx with one sentence: "Start a session or import notes to build your graph."
- [ ] T017 [US2] Create the "Knowledge graph" section in components/home.tsx: header (h2 22px/600, node/link count in meta when present, Import notes) then `GraphView section` or, with rendering off, `MinimalHome` (components/minimal-home.tsx) in the same section; mobile graph search still hides the header correctly
- [ ] T018 [P] [US2] Update graph render/SSR tests (tests/*graph*.test.tsx) for the section mode, the moved Import notes and the one-sentence empty state

## Phase 5: User Story 3 — A calmer sidebar (P2)

**Goal**: Search with filter inside + one New menu; amber dots; wrapping titles; serif shelves; Settings only at the bottom.

**Independent Test**: Compare with the canvas Sidebar artboard; create a lesson and a practice from New; filter to Practice.

- [ ] T019 [US3] Header in components/sidebar.tsx: remove the separate filter, New practice and New lesson icon buttons; move the filter trigger inside the Search field's right end (`aria-label="Filter sessions"`, visibly on — raised-2 fill and foreground ink — while not "All"); add a labelled "New" button (plus icon) opening a `MenuShell`/Radix menu with "Lesson" (`newSession()`, keeps `data-testid="new-session"`) and "Practice" (`/chat/new?mode=practice`, keeps `data-testid="new-session-practice"`); keyboard and Escape per DESIGN.md
- [ ] T020 [US3] Rows in components/sidebar.tsx: replace `MessageCircleQuestionIcon` with a 7px `bg-primary` round dot (`role="img"`, `aria-label="Waiting for you"`); keep `SessionStatus` for busy/compacting; titles wrap (`min-h-9`, no `truncate`, `py-2`, line-height 20px)
- [ ] T021 [US3] Date shelves in components/sidebar.tsx: label in the title serif (`font-title`, 17px, 500), count stays sans meta
- [ ] T022 [US3] Create components/settings/graph-section.tsx holding the display controls moved from the "Graph display settings" popover in components/graph-view.tsx; register it in components/settings/settings-dialog-content.tsx (searchable, deep-linkable); saves go through the existing graph render-settings route and call `notifySettingsSaved("graph")`; `GraphView` refetches settings on that signal; remove the gear and popover from the graph chrome
- [ ] T023 [P] [US3] Update tests/*sidebar*.test.tsx and scripts/smoke-sidebar-ui.mjs for the New menu, filter-in-search, dot, wrapping titles and serif shelves; add a settings render test for the Graph section

## Phase 6: User Story 4 — Take back a queued message (P2)

**Goal**: × removes an undelivered steer; the agent and transcript never see it.

**Independent Test**: Long turn, queue two, remove one; only the other is delivered.

- [ ] T024 [US4] Implement `cancelUserSteer(chatId, steerId): "cancelled" | "delivered" | "unknown" | "unsupported"` in src/server/jobs.ts per research R7 (registry lookup; record check for delivered; live agent: require `steeringMode === "all"`, `peekQueuedMessages()`, absent → delivered, else `clearSteeringQueue()` and re-`steer()` the rest in order; remove the entry); export from src/server/index.ts
- [ ] T025 [US4] Add `DELETE` in app/api/chats/[id]/steer/[steerId]/route.ts wrapped in `withTenant`, mapping to contracts/steer-cancel.md: 200 `{ ok: true }`, 404 "unknown chat" / "unknown steer", 409 "already delivered" / "cannot withdraw"
- [ ] T026 [P] [US4] Tests in tests/steer-cancel.test.ts: parked steer cancelled; handed steer removed from a fake agent queue while a job steer and another user steer stay in order; drained → delivered; unknown → 404; second DELETE → 404; non-"all" mode → unsupported
- [ ] T027 [US4] `cancelSteer(id)` in components/session-core.ts: drop the row at once; 409 "already delivered" → keep the row with note "Already sent" until the card lands; other failure → restore the row with "Could not remove"; never touch the composer draft
- [ ] T028 [US4] Remove control in components/queued-steers.tsx: × button per row (`aria-label="Remove queued message: {text}"`, 44px on coarse pointers, ink-2 → foreground on hover); wire `onRemove` from components/chat.tsx; update the header comment (cancel route now exists)
- [ ] T029 [P] [US4] Update tests/render-queued-steers.test.tsx for the button and the two notes

## Phase 7: User Story 5 — Scroll-to-latest on phones (P3)

**Independent Test**: At 320 and 390 px, scrolled up, the button covers no text.

- [ ] T030 [US5] In components/chat.tsx `DockFooter`: below `sm`, render `ConversationScrollButton` in a 48px band above the shell (below queued rows) instead of `absolute bottom-full`; include the band in the measured dock height that drives the tail spacer; band exists only while the button shows; desktop placement unchanged
- [ ] T031 [US5] Add a 320/390 px overlap check to scripts/check-turn-navigation-ui.mjs (or the dock smoke helpers): the button's rect intersects no transcript text node's rect

## Phase 8: User Story 6 — Dock smoke test passes (P3)

- [ ] T032 [US6] Root-cause the T002 failure (setup-focus-restore step) and fix it where it belongs: scripts/smoke-dock-ui.mjs if the test is wrong for this environment, or the setup dialog's focus return (components/setup-dialog.tsx / components/modal-focus.ts) if the app is; record cause and fix in progress.md
- [ ] T033 [US6] Run `node scripts/smoke-dock-ui.mjs` three times in a row; record results

## Phase 9: Polish & cross-cutting

- [ ] T034 Update DESIGN.md: Home order and waiting rows, graph section and Expand, sidebar header/rows/shelves, Settings only in the sidebar footer, queued-row remove, phone scroll band; update docs/ui-review.md review routes if Home checks change
- [ ] T035 Review UI against `shadcn`, `impeccable`, `web-design-guidelines` checklists (skills unavailable here: manual substitute, per plan) at 320, 390, 1440 px; hidden scrollbars; visible focus; 44px coarse targets
- [ ] T036 Gates: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `node scripts/smoke-sidebar-ui.mjs`, `node scripts/smoke-dock-ui.mjs`; new failures vs pre-existing listed separately in progress.md
- [ ] T037 Performance: `node scripts/measure-session-performance.mjs` within 5% of T001; record in progress.md
- [ ] T038 Final Report in specs/002-home-waiting-first/progress.md: what changed, how verified, what is left

## Dependencies & execution order

- Phase 1 → Phase 2 → stories. T008 (shared list) blocks US1 and US3; T003–T006 block US1.
- US1 and US2 both edit components/home.tsx: do US1 (T011) before T017.
- US3 T022 and US2 both edit components/graph-view.tsx: do US2 before T022.
- US4, US5, US6 depend only on Phase 1 and are independent of each other and of US1–US3 (US4 and US5 both touch components/chat.tsx: sequence T028 before T030).
- Polish after all stories.

## Parallel examples

- Phase 2: T007 alongside T008 once T003 lands.
- US4: T026 (server tests) alongside T027–T028 (client) after T024.
- Independent streams after Phase 2: {US1 → US2 → US3-T022}, {US4}, {US5}, {US6}.

## Implementation strategy

MVP = Phase 1, Phase 2 and US1 (Home leads with what's waiting, graph temporarily boxed). Then US2 (graph section), US3 (sidebar), then the 001 leftovers US4–US6, each a shippable increment with its own test.
