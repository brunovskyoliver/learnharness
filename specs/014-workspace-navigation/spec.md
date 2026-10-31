# Feature Specification: Workspace navigation and command palette (014, 015)

**Status**: Implemented on `feat/014-workspace-navigation`, not merged or deployed. Features 014 and 015 share one spec because the palette opens what the tabs and panes show.

**Input**: Owner goal 2026-10-31: "Create unified navigation for lessons, practice, Library and folders; collapsible/resizable panels; contextual right pane; tabs for open notes/documents/sessions; Cmd/Ctrl+K command palette. Improve keyboard shortcuts, responsiveness, focus/accessibility and loading/error states. Retain drafts, scroll positions, demo state and Electron window behavior."

## Clarifications

The owner approved every recommended option and asked for no questions ("i approve it all", 2026-10-31). Each decision below was made under that approval and is the owner's to overturn.

- **Mod+K moves from the model selector to the palette.** The registry had `open-model-picker` on `mod+k` since 2026-09-17, a collision the brief did not name. The model selector moves to `mod+shift+k`, and the palette lists "Choose a model" in a session. A saved override still on `mod+k` loses to the palette; a learner's own rebinding of the palette still wins.
- **The page editor keeps Mod+K.** Its text handler already claims the key. The palette also stands down in the editor's toolbar and link field, in dialogs and in menus.
- **The strip sits under the 52px band**, never in it, so the band keeps the window drag region and native gutters unchanged. `electron/` is not touched.
- **Opening is what opens a tab**: visiting a session or opening an item in the pane. There is no separate "open in a tab".
- **PDF, image and other non-pane items get no tab.** They open in a browser tab or download, as in the Library. The reader arrives with 020.
- **At most 12 tabs.** The oldest not on screen makes room. A tab holds no learner text, so this loses nothing.
- **Selection**: one selected tab, the most recently activated of those on screen. A session and a page side by side both read as on screen (raised for the selected, raised one step lower for the other).
- **Closing** a tab does not delete, and a running turn carries on. Closing the session on screen goes to the nearest session tab, else Home. Closing the open item closes the pane. Closing the pane leaves its tab.
- **A deleted session's or item's tab goes**, except the one on screen: a new session reaches the list after its route, and the pane has its own words for a page deleted while open. A failed catalog check keeps every tab.
- **Keyboard**: Tab is replaced outside dialogs (docs/keyboard.md), so the strip has its own key, `mod+shift+e`. Arrows walk without activating, Enter activates, Delete closes, Escape goes back. Close buttons are out of the walk; Delete is their keyboard path. The sidebar's block is reached by search, Tab (rail), Tab.
- **Lessons and Practice narrow the session list**, sharing state with the existing filter, since the sessions live there. A second press clears.
- **Right pane precedence**: a page or demo holds the column as today; the context view shows only when asked for and with nothing else there.
- **Context view contents**: for a session, its outline and demos; for a Library place, location, counts, tags and recently opened. A page's context remains its existing Outline.
- **Collapse keeps everything mounted.** Any explicit open expands the pane again, including a question's automatic demo, because a question's demo hidden behind a collapse would have no visible way back.
- **Wide screens only.** From 768px collapse and context apply; below it the page stays a full-screen layer, the demo a sheet, and neither toggle shows.
- **Palette**: no cmdk (ROADMAP). With no query, grouped lists, each capped at 6 except actions. With a query, one ranked list, because Enter should take the best match of any type. Archived entries stay in the Archive view.
- **Tabs and tree state are per account in the browser**, through `SessionStateStore`, like the page pane's.
- **No route-level `loading.tsx`.** The transcript restores its reading position before first paint, and a skeleton route would interfere. A tab shows its own pending state instead. `app/(app)/error.tsx` keeps a failed surface inside the shell.

## Requirements

- **FR-001** The sidebar is extended, not replaced: Lessons, Practice, Library with a collapsible folder tree, above the date shelves.
- **FR-002** Tabs persist across reload per account, and are a roving-tabindex tablist.
- **FR-003** Switching tabs never loses a composer draft or reading position; those stay with their existing owners.
- **FR-004** Switching to a note, or collapsing the pane, never reloads the live demo: one iframe, same document.
- **FR-005** Widths keep their owners and keys (`lh:sidebar-width`, `lh-demo-panel-width`).
- **FR-006** The palette loads on demand and matches with `fuzzyScore` over sessions, items, folders and actions.
- **FR-007** The palette is a Radix Dialog with a combobox over a listbox: arrows, Enter, Escape, focus returned to the opener.
- **FR-008** Nothing in the palette or tabs calls a model or sends anything.
- **FR-009** Loading, empty and failed stay distinct in the tree, context view and palette; each source reports for itself; a failed refresh keeps the last good list.
- **FR-010** 320, 390 and 1440 with no page overflow, 44px coarse targets, hidden scrollbars, visible focus, Escape innermost first.

## Non-goals

Keeping a session's Chat mounted across session switches (see plan.md, Known limits). A key map editor beyond the existing one. Reordering or pinning tabs. Tabs on `/chat/new` drafts. A palette shortcut from inside a focused demo iframe.

## Rollback

All new state is browser-owned under the `__workspace` session-state key, and is ignored by an older build. The model selector's key returns with the build. No server or catalog data changes.
