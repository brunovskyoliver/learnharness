# Data Model: Continue an unfinished lesson from Home

No stored data changes. One derived value is added to the chat summary.

## LessonProgress (derived, `src/core/lesson-progress.ts`)

| Field | Type | Rule |
|-------|------|------|
| `total` | number | `tree.nodes.length` (≥ 1) |
| `left` | number | count of nodes whose plan-view status is `current` or `upcoming` (≥ 1) |
| `next` | string | title of the current node; else the first `upcoming` node in `tree.nodes` order |

`lessonProgressOf(tree, messages)` returns `null` when there is no tree, the tree has no nodes, or the lesson is finished: every plan topic has had at least one check (owner, 2026-10-28).

`continueDraft(progress)` returns `` `Continue with ${progress.next}` ``.

## ChatSummary (edited, `src/core/contracts/chat.ts`)

- `progress?: LessonProgress`: present only for teaching sessions (`kind !== "practice"`) where `lessonProgressOf` is non-null. Absent otherwise.

## Row selection (client, `components/waiting-section.tsx`)

| Session state | Row |
|---------------|-----|
| `waiting` present | Answer/Solve row; plus progress line if `progress` present |
| no `waiting`, `progress` present | Lesson row with Continue |
| neither | no row |
