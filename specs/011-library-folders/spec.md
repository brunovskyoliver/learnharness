# Feature Specification: Library folders

**Feature Branch**: `feat/011-library-folders`

**Created**: 2026-10-31

**Status**: Draft

**Input**: Owner goal 2026-10-31, part 1, first slice: "Extend the existing Library with nested folders, breadcrumbs, ... rename/move ... Organize pages and uploads together. Use stable IDs and safe migrations; preserve page versions, @references and graph provenance. Prevent folder cycles, overwrite and cross-tenant access."

## Clarifications

### Session 2026-10-31

The owner approved every recommended option at once ("i approve it all", 2026-10-31) and asked not to be asked again during this goal.

- Q: How are folders stored? → A: In the catalog only. Bytes stay flat in `files/`.
- Q: Can two items in different folders share a name? → A: No. Item names stay unique across the Library, so `@name` stays unambiguous. Folder names are unique among siblings.
- Q: What does deleting a non-empty folder do? → A: Refuses, with a reason, until recoverable trash arrives in feature 012.
- Q: What do agents see? → A: `library_list` reports each item's folder path. Agent pages land at the top level. `@` works as before.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Keep items in nested folders (Priority: P1)

The learner creates folders inside folders and browses them from `/library`, seeing pages and uploads together at each level, with breadcrumbs back up.

**Why this priority**: Everything else in Library 2.0 sits on this structure.

**Independent Test**: Create "Physics" and "Physics/Waves", open each, and use the breadcrumbs. Reload and land in the same folder.

**Acceptance Scenarios**:

1. **Given** an existing Library, **When** the feature first runs, **Then** every item appears at the top level with its id, name, versions and references unchanged.
2. **Given** a folder, **When** the learner uploads a file or creates a page there, **Then** the item is in that folder.
3. **Given** a folder that was removed elsewhere, **When** its URL opens, **Then** the view says so plainly and offers the top level.

### User Story 2 - Move and rename (Priority: P1)

The learner moves an item or folder to another folder and renames folders.

**Independent Test**: Move a page with versions into a folder; its history, open pane and `@name` reference all still work.

**Acceptance Scenarios**:

1. **Given** a folder, **When** it is moved into itself or a descendant, **Then** the move is refused with a reason and nothing changes.
2. **Given** a sibling with the same name, **When** a folder is created, renamed or moved there, **Then** nothing is overwritten and the name clash is offered as in feature 009.
3. **Given** a page open in the pane, **When** it is moved, **Then** the pane, its draft and its version history are undisturbed.

### Edge Cases

- A move racing a delete of the target folder: refused with 404/409; the item stays where it was.
- A crash during a catalog write: the temp-and-rename write leaves the old catalog whole.
- A catalog item whose folder id no longer exists shows at the top level, and is never hidden.
- A catalog from a newer version is refused, never rewritten. An older one still reads without loss.
- A hosted request reaches only its tenant's folders; another tenant's folder id is a 404.
- Files added directly to `files/` keep arriving through reconciliation, at the top level.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Folders MUST have stable ids that survive rename and move, and items MUST keep their existing ids.
- **FR-002**: The system MUST refuse a folder move that would create a cycle.
- **FR-003**: Item bytes, page versions, derived text, tombstones and `@` resolution MUST behave as they did in feature 009.
- **FR-004**: The catalog migration MUST be additive, so that absence of folder data reads as the top level.
- **FR-005**: Every folder read and write MUST go through the tenant-scoped Library store.
- **FR-006**: Every move and folder action MUST be usable by keyboard and on coarse pointers.
- **FR-007**: Loading, empty, failed and refresh-failed states MUST stay distinct at every folder level.

### Key Entities

- **LibraryFolder**: id, name, parent folder id or none, created and updated times.
- **LibraryItem (extended)**: gains an optional folder id.

## Success Criteria *(mandatory)*

- **SC-001**: An existing catalog and its golden Library test fixtures read unchanged after the feature, with no item, version or reference altered.
- **SC-002**: No sequence of moves can produce a cycle (property test over random moves).
- **SC-003**: Layouts work at 320, 390 and 1440 px with no page overflow.
- **SC-004**: Initial JavaScript and sidebar readiness do not regress by more than 5%.

## Assumptions

- Drag and drop, tags, trash and bulk actions belong to features 012 and 013 (`specs/ROADMAP.md`).
