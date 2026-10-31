# Plan: Workspace navigation and command palette (014, 015)

## Structure

| Piece | Where | Note |
| --- | --- | --- |
| Tab rules, folder tree rows | `src/core/workspace-tabs.ts` | Pure |
| Palette entries, ranking | `src/core/command-palette.ts` | Pure, on `fuzzyScore` |
| Registry | `src/core/keyboard.ts` | `command-palette`, `focus-tabs`, `toggle-right-pane`; model selector moves |
| State | `components/workspace/workspace-context.tsx` | Provider in `AppShell`, one `SessionStateStore` |
| Strip | `components/workspace/tab-strip.tsx` | Rendered by `TopBar tabs`, Home, new session |
| Sidebar block | `components/workspace/sidebar-nav.tsx` | Replaces the single Library row; the frame and list are unchanged |
| Context view | `components/workspace/context-pane.tsx`, `context-slot.tsx` | On demand, inside `WorkspacePane` |
| Collapse | `components/workspace-pane.tsx`, `app/globals.css` | Width 0, inner column keeps its width |
| Palette | `components/command-palette.tsx` (host), `command-palette-dialog.tsx` (on demand) | |
| Route failure | `app/(app)/error.tsx` | This Next passes `retry`, per its docs |

## Design notes

- **One iframe.** The live demo is a fixed element in the transcript, placed over `[data-demo-slot]`. Collapse moves the slot off screen at the same size, so the demo neither reloads nor relays out. `useDemoPresentation` now also observes the pane, because a collapse moves the slot without resizing it.
- **One scroll owner.** The outline calls the existing `scrollSessionTarget` on the session's scroller.
- **Drag regions.** No band, gutter or `lh-drag` element changes.
- **Reserved band.** A small inline script, like the sidebar's, reserves the strip on Home and new sessions when saved tabs exist, so a reload doesn't shift them.

## Known limits

- Switching to a **different session** remounts `Chat`, as the sidebar does today. Draft and reading position return from their stores, but that session's demo document reloads, losing parameter state. Keeping several live sessions is a larger change with startup and streaming cost, and is left for the owner to decide.
- A focused demo iframe keeps its own keyboard events, so Mod+K doesn't reach the app from inside one. The same holds for every global shortcut today.
- `mod+\` needs a layout with that key; the palette's "Toggle right pane" is the other path. All new keys can be rebound in Settings.

## Constitution Check

- **I Owner decides**: pass. Blanket approval recorded; decisions in spec Clarifications.
- **II Teaching theory**: pass. No lesson, question or graph change; the outline shows only rendered turns already in the transcript, and palette entries post nothing.
- **III Learner data**: pass. Tabs hold no learner text; drafts and reading state keep their stores; collapse keeps editors mounted. Browser-checked.
- **IV Honest states**: pass. Loading, empty and failed are distinct; a pending tab shows; failed refreshes keep data.
- **V Consent before cost**: pass. No model calls; regression counts zero `/api/chat` POSTs. Closing a tab detaches and doesn't cancel.
- **VI Interface**: pass. Radix Dialog, shared tokens, no amber but focus; hidden scrollbars, Escape order, 44px and three widths browser-checked. DESIGN.md updated.
- **VII Boundaries and tenancy**: pass. Core stays pure; state keyed by account; catalog reads use the tenant-scoped API; sandbox untouched; one iframe.
- **VIII Performance**: pass; see progress.md for measured initial JS. No new dependency; palette, Radix dialog and context view load on demand. The formal throttled baseline remains the constitution's open TODO(PERF_BASELINE), so served-script size is the measure used.
