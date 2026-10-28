# Contract: `waiting` on the chat list

`GET /api/chats` (unchanged route). Each `ChatListItem` may carry:

```json
{
  "waiting": {
    "toolCallId": "call_abc",
    "kind": "Lesson check",
    "action": "Answer",
    "teaser": "What happens to the loss if the learning rate is ten times too large?",
    "postedAt": "2026-10-28T09:14:00.000Z"
  }
}
```

- Absent when nothing waits. Present iff `pendingQuestion` or `pendingProblem` is true.
- Only these five keys. The projection never copies options, correctness flags, explanations, solutions, rubrics, signatures or hidden fields from the tool input. A unit test asserts the key set and that a quiz fixture's correct-answer data is absent from the serialized summary.
- Tenant-scoped exactly as the list is today.
