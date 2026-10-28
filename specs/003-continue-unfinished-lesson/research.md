# Research: Continue an unfinished lesson from Home

Technical choices the spec leaves open. Each is reversible and listed for Oliver's review.

## R1. Where progress is derived

- **Decision**: In the chat summary projection (`readSummary` in `src/store/chats.ts`), next to `waiting`, by a pure `lessonProgressOf(tree, messages)` in `src/core/lesson-progress.ts`.
- **Rationale**: The summary already has the record's `tree` and messages in hand, is cached by file stamp, and feeds both sidebar and Home through one `/api/chats` read (feature 002). No new request.
- **Alternatives**: a new `/api/lessons/progress` route (extra request on Home, Principle VIII); client-side derivation (would ship transcripts to the list).

## R2. What "unfinished" means

- **Decision**: Reuse `derivePlanStatusesLh` + `derivedNodeStatus` (the plan view's rule). Unfinished = status `current` or `upcoming`. Next = the current topic, else the first `upcoming` topic in `tree.nodes` order. Finished (owner, during implementation): every plan topic has had at least one check → no progress.
- **Rationale**: Owner answer (current counts as left) and one derivation shared with the plan view, so Home and the plan never disagree. A topic revisited later is `current` again (hosted case: gradient descent revisited on Oct 27).
- **Evidence**: hosted ML lesson → total 11, current `training` ("Learning by gradient descent"), `course` never reached → "2 of 11 topics left · next: Learning by gradient descent".

## R3. Which sessions qualify

- **Decision**: `kind !== "practice"`, a tree with at least one node, and `left > 0`. Lessons whose plan was never written (still probing) have no tree and get nothing.

## R4. How Continue reaches the session

- **Decision**: Link to `/chat/<id>?continue=1`. The server page recomputes the progress from the record at open time and passes `initialContinueDraft = "Continue with {next topic}"`. The client applies it once after the session state hydrates, only when the saved composer text is empty (after trimming), then jumps to the bottom and removes `continue` from the URL with `history.replaceState` (same pattern as 002's `clearAnswerParam`).
- **Rationale**: Computing the topic at open time keeps the draft true even if the list was stale. No topic title in the URL. The `?prompt=` parameter is not reused because it auto-sends on empty chats.
- **Alternatives**: put the topic in the URL (stale, longer URLs); write the draft from Home into the session's local state store (couples Home to the store's key scheme).

## R5. Row shapes

- **Decision**: The Lesson row reuses 002's `waiting-row` grid: kind "Lesson" in the kind slot, "{title} · {ago since updatedAt}" in the meta slot, the progress line in the teaser slot (same size as a teaser), and a quiet "Continue" link. A waiting row whose lesson has progress gains a second, small muted line under its teaser with the same progress text.
- **Order**: Answer/Solve rows newest-posed first (unchanged), then Lesson rows by `updatedAt` newest first. Heading count = all rows.
