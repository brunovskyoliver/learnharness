# Data model: Home leads with what's waiting

No stored schema changes. Two projections change.

## WaitingItem (new, derived at read time)

Added to `ChatSummary` as `waiting?: WaitingItem` (absent when nothing waits). Computed by `waitingItemOf(messages)` in `src/core/waiting.ts`.

| Field | Type | Source | Rule |
|-------|------|--------|------|
| `toolCallId` | string | the pending tool call's id | identifies the item for `?answer=` |
| `kind` | `"Lesson check" \| "Prediction" \| "Question" \| "Explain" \| "Recall" \| "Problem"` | tool name (+ quiz type) | same labels as the prompt bar's turn strip |
| `action` | `"Answer" \| "Solve"` | `Solve` for practice problems, else `Answer` | |
| `teaser` | string | question text, or the problem statement | allowlisted; markdown kept, display-only math repair applied server-side; client strips it to one plain line |
| `postedAt` | ISO string | timestamp of the assistant message holding the call | falls back to `updatedAt` if absent |

Rules:
- At most one item per session (a session has at most one unanswered question or one active problem). For a practice session with both, the problem wins.
- Exactly the cases where `pendingQuestion` or `pendingProblem` is true produce an item; the booleans stay for compatibility.
- No other field of the tool input is read (Principle II).

Home list: every `ChatListItem` with `waiting`, sorted by `waiting.postedAt` descending.

## Queued steer (existing, in memory)

`UserSteerEntry { message: LhMessage; handedTo?: Agent }` in `state().userSteers` per chat.

States: `queued (handed or parked)` → `delivered` (agent drained it; it lands in the record) or → `cancelled` (new: removed from the registry and the agent queue; never delivered). `cancelled` is terminal and leaves no trace in the record.
