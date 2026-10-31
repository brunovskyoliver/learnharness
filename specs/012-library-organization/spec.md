# Feature Specification: Library organization and views (012, 013)

**Status**: Implemented. Features 012 and 013 share one spec because their UI shares the Library toolbar and row menu.

**Input**: Owner goal 2026-10-31, part 1: tags, favorites, pins, recent items, archive, recoverable trash, sorting, filters, list/grid views, bulk actions, context menus, drag and drop.

## Clarifications

Owner approved all recommendations ("i approve it all", 2026-10-31).

- Trash keeps everything until the learner deletes it for good. No automatic purge, since constitution III forbids silent loss.
- `DELETE /api/library/items/:id` stays a permanent delete for API compatibility. The UI uses `POST /api/library/trash`.
- A trashed item reads as deleted to `@` references, and as live again once restored.
- Document bytes leave `files/` while trashed, so agent file tools can't read them.
- Drag and drop uses native events; dnd-kit is not adopted.

## Requirements

- **FR-001** Marks never change content or `updatedAt`.
- **FR-002** Trash preserves bytes, versions and drafts; restore never overwrites.
- **FR-003** A folder goes to the trash as one entry with its subtree and comes back in place.
- **FR-004** Opening an item never rewrites the catalog.
- **FR-005** An older app can read and rewrite the catalog without losing trash entries or showing them.
- **FR-006** Every drag has a keyboard and touch path through Move to….
- **FR-007** A bulk action reports each failure by name and keeps the rest.

## Contracts

`POST /api/library/trash {itemId}|{folderId}` 201/400/404. `GET /api/library/trash`. `POST /api/library/trash/:id` restore 200/404. `DELETE /api/library/trash/:id` purge 200/404. `PATCH /api/library/items/:id {marks}` and `PATCH /api/library/folders/:id {marks}` 200/400/404. `POST /api/library/items/:id/opened` 200/404. `GET /api/library` adds `recentIds`.

## Rollback

All catalog additions are optional fields, with the version unchanged. After a rollback marks are ignored, trashed items stay invisible with their bytes safe, and a later upgrade finds them again.

## Constitution Check

I pass (blanket approval recorded). II untouched. III pass (FR-002, FR-005). IV pass (distinct states; failures named). V pass (no model calls). VI pass (Radix menus, tokens, DESIGN.md updated). VII pass (tenant-scoped store; cross-tenant test). VIII pass (no new dependency; Radix menus already in `radix-ui`, Library route only).
