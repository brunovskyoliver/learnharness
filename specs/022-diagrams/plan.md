# Plan: Diagrams (022)

## Constitution Check

| Principle | Result |
| --- | --- |
| I Owner decides | Pass under the standing no-questions approval. Decisions are in spec.md, Clarifications, and the new prompt wording is in progress.md for the owner to read. |
| II Teaching theory first | Pass. The graph is read only, a diagram is never evidence, and `tests/diagrams.test.ts` hashes `graph/` around every action. The tool refuses while a question or problem waits, and the prompt keeps answers out of diagrams. |
| III Learner data is never lost | Pass, with the same open **exception candidate** as 017 and 021: a deleted session's proposals and versions keep their content. Drafts are versioned before an approval. Append-only log, newer schema refused. Rollback run against the real pre-022 store. |
| IV Honest states | Pass. Loading, empty, failed, refused and conflict are distinct. Dangling links say so. A newer diagram says why it isn't searched. |
| V Consent before cost | Pass. No UI path sends a model call: "Ask the tutor" fills the composer. The tool's use on explicit request rests on the prompt fragment, as `plot`'s does. |
| VI Interface follows DESIGN.md | Pass. Existing Dialog, Popover, Button and token classes. React Flow's defaults overridden. Amber on Create, Approve and focus only. `impeccable` and `web-design-guidelines` run; `shadcn` skill not run (existing primitives only). |
| VII Boundaries and tenancy | Pass. Writes in `src/store`; core pure; routes through `withTenant`; cross-tenant 404s tested. |
| VIII Performance | Pass, measured in progress.md. |

## Module map

- `src/core/diagram.ts`: document, validation, edits, outline, scan text, comparison, proposal building. `src/core/diagram-svg.ts`: SVG and `escapeXml`.
- `src/store/library.ts`: catalog split, `isVersionedKind`, kind parameter on the page functions, `versionedInternals`. `src/store/diagrams.ts`: `DiagramStore`.
- `src/server/diagrams.ts`: handlers. `src/agent/tools/diagrams.ts`: `diagram_propose`. `src/agent/prompts/teacher/48-diagrams.md`, a line in `practice/20-library.md`.
- `components/diagram/`: `diagram-surface` (pane, header, full screen), `diagram-editor` (undo, tools, views, outline), `diagram-canvas` (the only React Flow import), `diagram-list`, `diagram-history` (undo), `diagram-versions` (History), `diagram-diff`, `diagram-proposal-dialog`, `diagram-proposals-line`, `diagram-link-dialog`, `new-diagram-dialog`, `diagram-export`, `diagram-api`, `diagram.css`.
- Reused unchanged in logic: `PageDraftController`, `usePageDraft` (takes an api now), `PaneHeader`, `SaveState`, `NoteConnectionsPanel`, `WorkspacePane`.

## Contracts

### Files (tenant-scoped, under `library/`)

```
catalog.json                     { version: 1, items, folders?, trash?, diagrams?: (LibraryItem | LibraryTombstone)[] }
pages/<id>/versions.jsonl        as pages, plus optional proposalId, editedByLearner; cause "proposal-approved"
pages/<id>/v{n}.md               DiagramDoc JSON
pages/<id>/draft.json            as pages
diagram-proposals/<id or new>/prp_*.json   DiagramProposal
search/...                       signature diagram:{head}:{size}; outline passages
```

### Document

`{ schema, form, nodes: [{ id, type: box|sticky|stroke, x, y, text, points?, links? }], edges: [{ id, from, to, label }], links? }`. Link: `{ kind: "note", target }`, `{ kind: "lesson", chatId, messageId, title }` or `{ kind: "idea", nodeId, name }`.

### Routes (`withTenant`, no-store)

| Route | Answers |
| --- | --- |
| `POST /api/library/diagrams` `{name, form, folderId?}` | 201, 400, 404 folder, 409 name |
| `GET /api/library/diagrams/:id` | PageState shape, 404, 409 `future_schema`/`damaged` |
| `PUT .../:id/draft` `{base, rev, content}` | `{rev}`, 400, 404, 409 stale or refused, 413 |
| `GET .../:id/versions`, `POST` (commit) | list; 200/201, as draft |
| `GET .../:id/versions/:n` | content, 404, 409 refused |
| `POST .../:id/restore` `{n}` | 201, 404, 409 |
| `GET /api/library/diagram-proposals?diagram=` | pending, without documents |
| `GET .../diagram-proposals/:id` | `{proposal, current: {content, expected, name} or null, targetGone?, refused?}` |
| `PUT .../:id` `{doc}` | Edit first; 400, 404, 409 decided |
| `POST .../:id/approve` `{expected, name?}` | 201; 400 without `expected` on an existing diagram; 404; 409 `stale`, `resolved`, `name_taken`, refused |
| `POST .../:id/reject` | 200, 404 |

Existing page routes refuse a diagram (404). `/items/:id/content` too. `PATCH /items/:id`, trash, marks and folders work unchanged.

### Tool

`diagram_propose { item?, baseVersion?, name?, form?, summary, nodes: [{id?, text, type?, links?}], edges: [{from, to, label?}] }`. Outcomes in `details`: `proposed`, `stale`, `failed`. `library_read` on a diagram returns `version: n`, then nodes and edges with ids, wrapped as `<library_item>` material. `page_revise` on one points to this tool.

## Migration

None. A catalog gains `diagrams` when the first diagram is made.

## Rollback

Run for real on 2026-11-01: this branch wrote data, the store at `01a6619` (the base) read and wrote it, and this branch read it again.

- The old app lists neither live diagrams nor their tombstones, doesn't tombstone them, keeps `diagrams` on rewrite, and can make pages. All confirmed.
- Back on this branch every diagram and the old app's new page are there.
- A trashed diagram shows in the old Trash under a blank kind label. **Restore there fails** with ENOENT and changes nothing, since it looks for bytes; forward again, it restores. **Delete for good there** would tombstone it and leave its folder on disk: costs disk, and it is what the learner asked for.
- Old app and a name: it can make a page named as a diagram. Both survive; `@` then resolves by the usual rule.

## Known limits

See progress.md, Report.
