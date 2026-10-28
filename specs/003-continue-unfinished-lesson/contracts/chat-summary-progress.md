# Contract: `progress` on the chat summary

`GET /api/chats` list items (`ChatSummary`) gain an optional field:

```ts
progress?: { total: number; left: number; next: string };
```

- Present only on teaching sessions whose plan has at least one current or upcoming topic.
- `next` is a plan topic title. No other plan or transcript content crosses this seam (FR-007).
- Derived on each summary rebuild; cached with the summary by file stamp. Never written to the record.

Example (hosted ML lesson, 2026-10-28):

```json
{ "progress": { "total": 11, "left": 2, "next": "Learning by gradient descent" } }
```
