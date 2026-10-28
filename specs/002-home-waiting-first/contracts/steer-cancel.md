# Contract: withdraw one queued steer

`DELETE /api/chats/{id}/steer/{steerId}` — wrapped in `withTenant`. No body.

| Status | Body | When |
|--------|------|------|
| 200 | `{ "ok": true }` | The steer was undelivered and is now removed from the registry and any live agent queue. It will never reach the agent or the record. |
| 404 | `{ "error": "unknown chat" }` | No such chat (for this tenant). |
| 404 | `{ "error": "unknown steer" }` | No queued steer and no delivered message with that id. |
| 409 | `{ "error": "already delivered" }` | The agent drained it, or the record already holds it. |
| 409 | `{ "error": "cannot withdraw" }` | The live agent does not use the all-at-once steering mode, so one message cannot be withdrawn safely. |

Client (`SessionCore.cancelSteer(id)`):
- Removes the row at once.
- 200 → done. 409 "already delivered" → the row stays until its card lands, with the note "Already sent". Other 409/404/network failure → row restored with "Could not remove".
- Never touches the composer draft.

Idempotence: a second DELETE after 200 answers 404 "unknown steer".
