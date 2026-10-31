# Plan: Library folders

**Approach**: an optional `folders` array and `folderId` on items, in the existing catalog, under the existing tenant-scoped lock. No byte moves.

**Migration and rollback**: additive with the catalog version unchanged. Absent data reads as the top level. An older app ignores the fields and keeps them on rewrite, because it rewrites the parsed object. Rollback is deploying the older app; items already in folders then show flat.

**Contracts**: `POST /api/library/folders {name, parentId?}` 201/400/404/409. `PATCH /api/library/folders/:id {name}|{parentId}` 200/400/404/409. `DELETE /api/library/folders/:id` 200/404/409. `PATCH /api/library/items/:id {folderId}` 200/400/404. `POST /api/library/upload?folder=` and `POST /api/library/pages {folderId}` create inside a folder. `GET /api/library` adds `folders`.

**Accessibility**: every action is a named button; "Move to" is the keyboard and touch path; dialogs trap focus and return it; breadcrumbs are a `nav` with `aria-current`; coarse targets are 44 px.

**Dependencies**: none.

## Constitution Check

| Principle | Result |
| --- | --- |
| I Owner decides | Pass: blanket owner approval, recorded in the spec |
| II Teaching theory | Pass: untouched |
| III Learner data | Pass: no byte, version or tombstone changes; delete of a non-empty folder refused |
| IV Honest states | Pass: missing, empty and failed are distinct; refusals carry reasons |
| V Consent before cost | Pass: no model calls |
| VI DESIGN.md | Pass: shared tokens and primitives, DESIGN.md updated |
| VII Tenancy | Pass: all through the tenant-scoped store; test covers another tenant's id |
| VIII Performance | Pass: no new dependency; Library route only |
