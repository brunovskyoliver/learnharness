# Tasks: Page editor tools (010)

Approved plan: [plan.md](plan.md). Strings: [contracts/ui-contract.md](contracts/ui-contract.md). Each phase ends with its tests green, a commit and a push.

## Phase 1: US1 Formatting (P1)
- [x] T001 `components/library/page-slash.ts`: slash items, filter and trigger plugin (pure filter tested in tests/page-tools-ui.test.ts)
- [x] T002 `components/library/page-toolbar.tsx`:
  - toolbar with names and shortcuts;
  - text style menu;
  - table controls;
  - link popover (Mod-K) with Apply, Open link and Remove link.
- [x] T003 `page-editor.tsx`: placeholder decoration, Mod-Shift-M formula, slash plugin and menu, toolbar mounting, link openOnClick off kept
- [x] T004 `app/globals.css`: toolbar, menus, placeholder; coarse 44 px; wrap below 560 px
- [x] T005 Round trip: link and table edits change only their blocks (tests/page-editor-roundtrip.test.ts)
- [x] T006 Browser: `checkEditorTools` part 1, at 1440, 390 and 320 px

## Phase 2: US2 Tutor actions (P1)
- [x] T007 `components/chat.tsx` ChatActionsContext: `fillComposer`, `blockedReason`, `busy`
- [x] T008 `page-tutor-actions.ts`: message texts, quoting and blocked reasons (tests/page-tutor-messages.test.ts)
- [x] T009 Selection bubble with formatting and tutor actions; commit before sending; Library-view new session through Home's checks
- [x] T010 Browser: bubble, Ask… fills the composer, sends intercepted

## Phase 3: US3 Tutor changes (P2)
- [x] T011 Store and routes: `seen.json`, GET and PUT seen; cause `undo-agent` (tests/page-names-seen.test.ts)
- [x] T012 `page-blocks.ts`: split, compare, `revertTutorChanges` (tests/page-blocks.test.ts)
- [x] T013 Change bar, decorations, Previous and Next, Undo, Done; seen on Done and close
- [x] T014 Browser: two-place seeded revision, typing, undo

## Phase 4: US4 History (P2)
- [x] T015 `names.json`, PATCH route, names in the list
- [x] T016 History: Changes and Full text, name field, Copy this version
- [x] T017 Browser: compare and name across reload

## Phase 5: US5 Outline, word count, export (P3)
- [x] T018 Word count and outline from the document (pure parts in page-blocks.ts)
- [x] T019 Outline column and phone menu; Export menu; print root and CSS
- [x] T020 Browser: outline jump, copy, download

## Phase 6: US6 Images (P3)
- [ ] T021 `upload.ts` returns the item; SVG refused for pages
- [ ] T022 Paste, drop and Image button with progress line; link insert
- [ ] T023 Browser: paste a PNG, reload, delete the item, alt text shows

## Phase 7: Polish
- [ ] T024 DESIGN.md "Page editor tools" section
- [ ] T025 Gates: npm test, lint, typecheck, build; check-library-ui; impeccable and web-design-guidelines; startup budget
