# Research: Home leads with what's waiting

Owner decisions are in spec Clarifications. Entries here are technical choices the spec constrains; each is reversible and open to review.

## R1. Where the waiting list comes from

- **Decision**: Extend the chat summary projection (`src/store/chats.ts` `readSummary`) with an optional `waiting` field computed by a new pure `waitingItemOf(messages)` in `src/core/waiting.ts`. It reuses `danglingQuestionOf` and `activeProblemOf` (`src/core/native-messages.ts`), which already drive `pendingQuestion` / `pendingProblem`.
- **Rationale**: The sidebar list already carries these booleans and is cached by file stamp, so the extra fields cost one projection per changed record and no new request.
- **Alternatives**: A separate `/api/waiting` route (one more request on Home load, duplicate scan of every record); deriving on the client (needs full transcripts).

## R2. Keeping answers off the client (Principle II)

- **Decision**: `waitingItemOf` is an allowlist. It copies only: tool call id, kind label, the question text (`input.question` for quiz/ask/explain/probe/recall; the problem's statement for practice) and the posted time (the assistant message timestamp). Nothing else from the tool input is read.
- **Rationale**: Quiz inputs can carry options with correctness and explanations. An allowlist cannot leak a field added later. `src/core/graph-source-excerpts.ts` uses the same pattern.
- **Kind labels**: The label logic in `components/question-dock.tsx` (`toolLabel`: quiz → "Lesson check" or "Prediction" for predict, explain → "Explain", recall → "Recall", others → "Question") moves to `src/core/waiting.ts` and is re-exported so the dock and the list agree. Practice → "Problem".

## R3. One list for sidebar and Home

- **Decision**: Lift the `/api/chats` fetch, event refresh and coalescing (`createSidebarRefresh`) out of `SessionsSidebar` into a `SessionListProvider` mounted in `AppShell`. Sidebar and Home both read it.
- **Rationale**: Principle VIII (no extra request at startup) and one source of truth: answering a check refreshes both.
- **Alternatives**: Home fetching on its own (duplicate request, can disagree with the sidebar for a refresh cycle).

## R4. Answer / Solve navigation

- **Decision**: The button links to `/chat/<id>?answer=<toolCallId>`. The chat page passes it down; on mount, when it matches the pending question or problem, the dock's existing `dock/<toolCallId>/expanded` session state is set true and the transcript jumps to the bottom. The param is then removed with `router.replace` so reload does not re-force it.
- **Rationale**: Reuses the dock's own expanded state; a stale id (already answered) is ignored, giving the normal session view.
- **Next.js**: `searchParams` is a Promise in this version, as `app/(app)/chat/[id]/page.tsx` already handles for `prompt`.

## R5. Graph as a section with Expand

- **Decision**: `GraphView` gains a `section` presentation: a relative container at a fixed height (420 px desktop, 260 px on phones, per the approved canvas), floating chrome scaled to the box. Expand switches the same mounted element to a fixed full-viewport layer (no remount, so camera, selection and search survive); Escape or Close returns and restores focus to Expand.
- **Rationale**: Owner chose the live graph at a fixed height. Switching CSS instead of remounting keeps the renderer and avoids re-layout.
- **Import notes**: The floating "Import notes…" button leaves the graph chrome and renders in the section header; `useNotesImport` state and `NotesImportErrors` render in the section.

## R6. Graph display settings into Settings

- **Decision**: Move the popover body (from the `SettingsIcon` "Graph display settings" control in `components/graph-view.tsx`) into `components/settings/graph-section.tsx`, registered in the Settings dialog. Saves go through the existing graph render-settings route; the dialog fires `notifySettingsSaved("graph")` and `GraphView` refetches on that signal.
- **Rationale**: Owner answer. The existing settings-signal pattern already keeps views live after saves.

## R7. Withdrawing one queued steer

- **Decision**: `cancelUserSteer(chatId, steerId)` in `src/server/jobs.ts`:
  1. Find the entry in `userSteers`. Not there: if the chat record holds a message with that id → `"delivered"`; else `"unknown"`.
  2. If the entry was handed to the current live agent: require `agent.steeringMode === "all"` (set in `src/agent/teacher-agent.ts`), read `agent.peekQueuedMessages()`; if the id is absent the agent already drained it → `"delivered"`. Otherwise `clearSteeringQueue()` and re-`steer()` every other message in the same order. This runs synchronously, so it cannot interleave with the agent's drain.
  3. Remove the entry from `userSteers` → `"cancelled"`.
- **Rationale**: pi-agent-core 1.4.0 exposes `peekQueuedMessages`, `clearSteeringQueue` and `steer`, but no single-item removal. Clear-and-restore keeps job-result steers that share the queue.
- **Route**: `DELETE /api/chats/[id]/steer/[steerId]`, `withTenant`, 200 / 404 / 409 (see contracts/steer-cancel.md).
- **Client**: `SessionCore.cancelSteer(id)` drops the row optimistically; on 409 it keeps the row until the card lands and shows "Already sent"; on network failure it restores the row with "Could not remove".

## R8. Scroll-to-latest on phones

- **Decision**: Below the `sm` breakpoint the `ConversationScrollButton` leaves its absolute `bottom-full` position and renders in a 48 px band inside `DockFooter`, above the shell and below queued rows. The dock's measured height (which drives the tail spacer) includes the band, so the transcript's end stops above it. The band exists only while the button is visible.
- **Alternatives**: Moving the button to the left edge (still overlaps prose at 320 px).

## R9. Dock smoke test

- **Known**: 001 recorded that `scripts/smoke-dock-ui.mjs` fails at the setup-focus-restore step (around line 131) on both unchanged code and 001's branch, in Chromium with `--no-sandbox`.
- **Decision**: Reproduce first on unchanged code (T001), then decide whether the defect is in the test (timing, focus assertion against headless behavior) or the app (focus not returned to the opener). Fix in the right place; record the cause in `progress.md`.
