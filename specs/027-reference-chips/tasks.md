---
description: "Tasks for feature 027, reference chips"
---

# Tasks: Reference chips

**Input**: specs/027-reference-chips/ (plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: included. The spec's Independent Tests and SC-001…SC-006 ask for byte-identity, keystroke, navigation and layout checks; the constitution requires browser regressions for UI work.

**UI tasks** (T013, T014, T018-T024, T026, T028-T030, T034, T037, T038, T045, T055, T058) are built with the `shadcn` skill (constitution VI).

**Gate 2**: approved ("go", 2026-11-08). Tasks marked **(owner)** use the wording or look approved under "Owner review at gate 2" in plan.md; implement exactly that version.

**Feature 026** is implemented before this feature on the same branch: mirrored items' @ name is `{linked folder}/{repo path}` (display name the file name) and removed entries read "Removed from the repo" (research R15, FR-020).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no dependency on an unfinished task.
- **[Story]**: US1, US2, US3 from spec.md.

---

## Phase 1: Setup

- [ ] T001 Read `node_modules/next/dist/docs/` on `useRouter` (push/back), `useSearchParams` and client navigation history; log any breaking change that affects R9 under Decisions in specs/027-reference-chips/progress.md
- [ ] T002 Measure the startup JS baseline at `adc0021` with `~/agent-runs/2026-11-07-unified-redesign/startup-js/startup-js.mjs` (next start, fresh data) for `/`, `/chat/new`, `/library`; save to `~/agent-runs/2026-11-08-reference-chips/startup-base.json`
- [ ] T003 [P] Add `seedReferenceLesson()` to tests/e2e/study/helpers.ts: the items and transcript listed in quickstart.md "Prerequisites" (nine kinds, a prefix name, a trashed item, a tombstone, the sent forms, the tutor citation and `@name`)

---

## Phase 2: Foundational (blocks every story)

- [ ] T004 [P] Write tests/reference-spans.test.ts: `referenceSpans` offsets index the raw text (including a decomposed-NFD paste); boundary rule; code and `<library_passage>` skipped; longest name wins ("Untitled note" vs "Untitled note 2"); live > old name > tombstone; and the invariant "distinct entries of `referenceSpans` deep-equal `parseReferences`" over every fixture in tests/library-refs.test.ts
- [ ] T005 Implement `referenceSpans(text, entries)` in src/core/library-refs.ts (same walk as `parseReferences`, NFC-to-raw offset map) and re-express `parseReferences` through it; export from src/core; tests/library-refs.test.ts, tests/library-references.test.ts and tests/references-handler.test.ts stay green unchanged
- [ ] T006 [P] Write tests/reference-forms.test.ts from contracts/recognition.md: all nine `tutorMessage` actions and all five `documentTutorMessage` actions (built by calling the real functions) form one chip with the right `range`, `quote` and `page`; mismatched `item`/`page` falls back to a whole-item chip plus a passage-only chip; a quote not after a blank line, a non-last reference on the line, and code are not forms
- [ ] T007 Implement `referenceForms(text, spans)` in src/core/library-refs.ts per contracts/recognition.md (page form, PDF form, passage-only)
- [ ] T008 [P] Write tests/library-href.test.ts: `parseLibraryHref` accepts `/library?item=ID`, with `page` (integer ≥ 1, else ignored) and `quote`, and an absolute same-origin URL; rejects other paths; `parseCitationHref` still requires `page`
- [ ] T009 Implement `parseLibraryHref` in src/core/document-anchors.ts and export it from src/core
- [ ] T010 [P] Write tests/reference-chip-target.test.ts for `chipTarget()`: `href` per state (`live`/`unknown` → `/library?item=ID[&page][&quote]` with `citationQuote`'s 200-character cut and `citationHref`'s encoding; `trashed` → `/library?view=trash&entry=ENTRY`; `deleted`/`removed` → null), `hint` ("· p. {n}" or the first non-empty passage line), and the accessible names in contracts/ui-contract.md §1
- [ ] T011 Implement `chipTarget()` and the accessible-name builder in src/core/reference-chips.ts (pure)
- [ ] T012 Create components/reference-catalog.ts: the live list from `GET /api/library` with the 30s TTL moved out of components/library/references-card.tsx, refreshed on `library-changed`; ids missing from it looked up once per TTL in `GET /api/library/trash` entries' `items`; state `live | trashed | deleted | removed | unknown` (a failed read is `unknown`, never `deleted`); `removed` from feature 026's flag when present
- [ ] T013 [P] Add `.lh-ref-chip`, `.lh-ref-chip-icon`, `.lh-ref-chip-hint`, `.lh-ref-chip[data-state="deleted"]`, `.lh-ref-field`, `.lh-ref-mirror` to app/paper.css per contracts/ui-contract.md §1 (paper tokens only, 150ms colour transition off under reduced motion, coarse-pointer 44px hit box); `tests/token-hygiene.test.ts` passes
- [ ] T014 Create components/reference-chip.tsx: `ReferenceChip` (icon map **(owner)**, name, hint, states, `data-ref-chip`, `data-source`, `aria-label`/`aria-description`, focus ring) rendering an `<a href>` for linkable states and a span for deleted/removed; no navigation logic yet
- [ ] T015 [P] Write tests/render-reference-chips.test.tsx (static render): each state and kind, hint truncation class, deleted text " · no longer in your Library", removed text " · Removed from the repo", accessible names
- [ ] T053 [P] Read feature 026's code in src/core/library-refs.ts and src/core/library.ts: how `nameTable` offers a mirrored item's path and old paths, what `LibraryReference.name` holds for a mirrored reference, the tombstone's `removedBecause`, and the "Removed from the repo" constant; log them under Decisions in progress.md; add the "/" fixtures from contracts/recognition.md to tests/reference-spans.test.ts and tests/reference-forms.test.ts (two `notes.md` paths, a "Lecture notes" page beside the path, an old path after a linked-folder rename, a removed entry, `@{path}, page {n}` PDF form)
- [ ] T054 Implement research R15 in components/reference-catalog.ts and src/core/reference-chips.ts: a tombstone with `removedBecause` is state `removed` (026's constant for the hint), a mirrored item's chip name is its display name, and `chipTarget()` never builds an @ name itself; extend tests/reference-chip-target.test.ts and tests/render-reference-chips.test.tsx for a mirrored live, renamed-folder and removed item

**Checkpoint**: recogniser, targets, catalog and chip exist; stories can start.

---

## Phase 3: User Story 1 - Jump from a sent reference to the source and back (P1) 🎯 MVP

**Goal**: chips in sent text and reference rows open the Library full view at the passage; the pill and browser Back return to the same message, scroll and chip.

**Independent Test**: spec US1 Independent Test; quickstart.md §3.

- [ ] T016 [P] [US1] Write tests/reference-return.test.ts: return point write/read/clear in sessionStorage `lh:reference-return` (shape per data-model.md, invalid JSON reads as none), the `history.state` nonce, and the pill's choice between `router.back()` and `router.push("/chat/{id}")`
- [ ] T017 [US1] Implement components/reference-return.ts: `saveReturnPoint`, `readReturnPoint`, `clearReturnPoint`, `useFocusReturn(chatId)` (focus `[data-ref-chip="{messageId}:{key}"]` with `preventScroll` after the reading anchor restores, then clear)
- [ ] T018 [US1] Add navigation to `ReferenceChip` and a `ReferenceLink` for row names in components/reference-chip.tsx: plain primary click → `saveReturnPoint` then `router.push(href)` with the nonce in `history.state`; Ctrl/Cmd/Shift-click and middle-click left to the browser (FR-018); no model call, no draft or pane change (FR-017)
- [ ] T019 [P] [US1] Add a `full` presentation to components/workspace-pane.tsx: no resize edge, no saved width, fills the content column, hidden scrollbars
- [ ] T020 [US1] In components/library/page-pane.tsx let PageSurface, PdfSurface, DiagramSurface and ReadOnlySurface take `full` (header's ✕ becomes the `← Library` toolbar word **(owner)**), and render the page "passage gone" line when `jumpMissed` **(owner)**; pages search the passage's first line through `jumpToText`
- [ ] T021 [US1] Create components/library/library-full-view.tsx: picks the surface by kind with a local `PagePaneApi` adapter (never the shared pane context, so the right pane, tabs and lesson state don't change), an image view (fit to column, name as alt) and an "other" view (`{Kind} · {size}` and Download); jump `{ page, quote, citation }` with `citation: false` for his own passages
- [ ] T022 [US1] In components/library/library-view.tsx render `LibraryFullView` while `?item=` is present and keep the address (no `router.replace` on this path), with the existing missing-item line; the list renders otherwise
- [ ] T023 [US1] Support `/library?view=trash&entry=ID` in components/library/library-view.tsx and components/library/library-trash.tsx: entry scrolled into view, 2s shelf landing (off under reduced motion), Restore focused
- [ ] T024 [US1] Add the Back pill to components/library/library-view.tsx per contracts/ui-contract.md §5: shows while a return point exists, across item/folder changes and a reload; cleared on use, on arriving back, and by a pathname effect in components/workspace/workspace-context.tsx when the route leaves `/library` (not on unmount: Next may keep the route mounted); polite live-region announcement; content top padding while shown; phone placement above the safe area
- [ ] T025 [US1] In components/chat.tsx call `useFocusReturn(chatId)`, triggered by the pathname becoming `/chat/{chatId}` (a cached route can reappear without remounting), so arriving from the pill or browser Back focuses the clicked chip at the saved reading position (components/session-reading-state.tsx unchanged)
- [ ] T026 [US1] Render chips in components/user-turn-text.tsx: `UserTurn` takes the message's `LibraryReference[]`, builds the catalog from them, uses `referenceSpans` + `referenceForms`, shows LEAD text, one chip, tail text **(owner: sent quote form)**; `<library_passage>` blocks become passage chips (removes "Sent from page {n}"); current names from reference-catalog; `copy` handler writes each chip's `data-source`
- [ ] T027 [US1] In components/chat.tsx pass each user message's `data-library-references` references to `UserTurn` and a stable chip key per message
- [ ] T028 [P] [US1] Render chips in the learner's answer text in components/answered-card.tsx (its references part)
- [ ] T029 [P] [US1] Render chips in `ThinkingCard`'s text in components/practice-cards.tsx (the thinking marker's references)
- [ ] T030 [US1] In components/library/references-card.tsx make each row's name a `ReferenceLink` (live, trashed; `data-ref-chip="{messageId}:row-{itemId}"` for focus return) or ink text (deleted, missing), wording and "Settings → Agent" unchanged (FR-012); use components/reference-catalog.ts; update tests/render-references.test.tsx
- [ ] T031 [US1] In components/transcript-passages.tsx skip clicks inside `[data-ref-chip]` so the chip's own navigation runs instead of the right-pane citation open
- [ ] T032 [US1] Write the US1 journeys in tests/e2e/study/reference-chips.spec.ts ("sent", "back"): scenarios 1-11, nine kinds (SC-003), scroll within one line height and focus on the chip (SC-002), Forward, Ctrl-click new tab without pill, copy across a chip, offline click shows the Library's failed state with a working pill; at 320, 390, 1440, light and dark

- [ ] T055 [US1] In components/user-turn-text.tsx (after T026) take mirrored references' catalog entries from components/reference-catalog.ts by id (live or removed, both carry `mirror`) with the reference's own name as fallback, per research R15, so `@{linked folder}/{repo path}` is one chip; add US1 scenarios 12 and 13 to tests/e2e/study/reference-chips.spec.ts (seed a mirrored item and a removed one through `seedReferenceLesson()`)
- [ ] T056 [US1] Add to tests/e2e/study/reference-chips.spec.ts: the other `/library?item=` links (components/notebook/links-panel.tsx, a card source link from src/core/cards.ts) and a pasted address land in the full view with no Back pill (FR-021); a citation click inside a Library page still opens the side pane

**Checkpoint**: US1 works on existing transcripts with no composer change.

---

## Phase 4: User Story 2 - Chips in the composer while writing (P2)

**Goal**: the five @ fields draw chips over the textarea; behaviour and sent text unchanged.

**Independent Test**: spec US2 Independent Test; quickstart.md §2.

- [ ] T033 [P] [US2] Write tests/reference-field.test.ts for the pure `chipDeleteRange(value, caret, key, forms)`: Backspace at a form's end and Delete at its start return its `range` (whole quote form included, LEAD words excluded); anywhere else, with a selection, while composing or with a modifier, null
- [ ] T034 [US2] Create components/reference-field.tsx: the mirror layer (`aria-hidden`, `pointer-events: none`, identical metrics, trailing zero-width space), transparent textarea text with `caret-color` ink, chip spans restyling only their own characters (`box-shadow` ground, `@` transparent with the icon over it, PDF ", page n" faint, page-form `>` lines as the chip's passage body **(owner)**), scroll sync, composition underline from `compositionupdate`, the metrics guard (R4) and the `field-sizing` fallback that turns the overlay off
- [ ] T035 [US2] Add Backspace/Delete removal to components/reference-field.tsx: `setSelectionRange(range)` then `document.execCommand("delete")` so one undo restores it; fall through when it returns false
- [ ] T036 [US2] Expose the loaded items from components/library/use-library-mention.ts (no extra fetch; still only after a trigger) for the field's spans
- [ ] T037 [US2] Use the field in components/composer.tsx (chat, Home and new-session composers) keeping every existing prop, handler order (@ list first, then Escape, then Enter) and class
- [ ] T038 [P] [US2] Use the field in the check answer fields in components/question-dock.tsx and the practice field in components/practice-dock.tsx
- [ ] T039 [P] [US2] Write tests/reference-chips-bytes.test.ts (SC-001): the draft set in contracts/recognition.md through the composer's value path with the overlay on and off; request bodies identical
- [ ] T040 [P] [US2] Update tests/render-composer.test.tsx and tests/composer-actions.test.tsx for the mirror (field markup, combobox attributes unchanged)
- [ ] T041 [US2] Add a keystroke benchmark to tests/reference-spans.test.ts: `referenceSpans` + `referenceForms` on a 4,000-character draft with 2,000 items under 1ms median; and confirm tests/startup-module-graph.test.ts passes with components/reference-field.tsx in the composer graph
- [ ] T042 [US2] Write the composer journeys in tests/e2e/study/reference-chips.spec.ts ("composer"): @ list insert, Ask… on page and PDF, type/paste/undo/redo/IME (CDP `Input.imeSetComposition`) value sequence equal to overlay-off, caret x within 1px of chip ends, Backspace + one undo, reload, send body, at 320, 390, 1440, light and dark

- [ ] T057 [US2] Add to the "composer" journeys in tests/e2e/study/reference-chips.spec.ts: inserting a mirrored item from the @ list draws one chip over the whole `@{linked folder}/{repo path}` token (path as typed), Backspace removes it whole, and the sent body equals overlay-off

**Checkpoint**: US1 and US2 independently working.

---

## Phase 5: User Story 3 - Chips in the tutor's replies (P3)

**Goal**: Library links and resolving `@name` in tutor prose render as chips that navigate like US1.

**Independent Test**: spec US3 Independent Test; quickstart.md §4.

- [ ] T043 [P] [US3] Write tests/chip-markdown.test.ts per contracts/recognition.md: `@name` → `[@name](/library?item=ID "lh-ref")` outside code, link labels/addresses, autolinks and raw HTML; label escaping; existing `/library?item=` links untouched; idempotent; a completed-prefix stream cut mid-name leaves text
- [ ] T044 [US3] Implement `chipMarkdown(markdown, catalog)` in src/core/reference-chips.ts
- [ ] T045 [US3] In components/ai-elements/message.tsx add a tutor components set (mdComponents + an `a` override rendering `ReferenceChip` for `parseLibraryHref` hrefs, keyed by link order within the message) and apply `chipMarkdown` to the tutor reply's content after `completedMarkdownPrefix`; add `lh-refs-ready` to the class when the catalog arrives; other MessageResponse users unchanged
- [ ] T046 [US3] **(owner)** Append the approved sentence to src/agent/prompts/shared/32-documents.md and update tests/prompt-overrides.test.ts if it pins the text
- [ ] T047 [US3] Write the tutor journeys in tests/e2e/study/reference-chips.spec.ts ("tutor"): citation chip with PDF icon, name and "· p. 3" opening page 3 with "Quote found on page 3."; `@name` in prose chips, in code stays text; streaming fixture shows unchanged line-box heights when a reference becomes a chip

- [ ] T058 [US3] Copy in tutor replies (FR-002): give each tutor chip a `data-source` equal to what that text rendered as before this feature (the link's label for a `/library?item=` link, `@name` for a chipped token) and reuse the T026 copy handler on the reply in components/ai-elements/message.tsx; test a selection across a chip in tests/e2e/study/reference-chips.spec.ts ("tutor")

**Checkpoint**: all three stories work.

---

## Phase 6: Polish and cross-cutting

- [ ] T048 [P] Add "Reference chip" to DESIGN.md under "Library, @ list, page pane and notes" and a Back pill line under Layout, per contracts/ui-contract.md §8
- [ ] T049 Measure startup JS after (same script and conditions as T002); record both in progress.md; any route over +5% gzip blocks done (SC-006)
- [ ] T050 Run the `shadcn`, `impeccable` and `web-design-guidelines` checks on the composer, a transcript with chips, the full view, Trash landing and the pill at 320, 390, 1440, light and dark, reduced motion on; fix findings in the files above
- [ ] T051 Run `node scripts/check-hosted-tenants.mjs` (chips and the full view resolve only the current tenant's Library), `node scripts/check-library-ui.mjs`, `node scripts/check-transcript-scroll-ui.mjs`, `node scripts/check-documents-ui.mjs`, `node scripts/check-streaming-ui.mjs` and the Study Playwright suite; record pre-existing failures separately
- [ ] T052 Full gate: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`; write the Report in specs/027-reference-chips/progress.md (what changed, how verified, what is left)

---

## Dependencies

- Feature 026 is implemented (its tasks done on this branch) before T053, T054, T055 and T057; if it is not, those four wait and the rest proceed.
- Phase 1 → Phase 2 → stories. T005 before T007; T009 before T011; T011 and T012 before T014; T053 before T054; T054 after T011 and T012.
- US1 (Phase 3) needs Phase 2 only. US2 (Phase 4) needs Phase 2 only (its chips are not links). US3 (Phase 5) needs Phase 2 and T018 (navigation) from US1.
- Within US1: T017 before T018, T025; T019 before T020 before T021 before T022; T022 before T023, T024, T056; T026 before T027, T055; T032, T055, T056 last.
- Within US2: T033 before T035; T034 before T035, T037, T038; T042 and T057 last.
- Within US3: T045 before T058.
- Phase 6 after the stories in scope.

## Parallel examples

- Phase 2: T004, T006, T008, T010, T013, T015 (tests and CSS) together; then T005/T007 (same file, in order), T009, T011, T012.
- US1: T016 and T019 together; T028 and T029 together after T014.
- US2: T033, T039, T040 together; T038 beside T037.
- US3: T043 beside T046's wording approval.

## Implementation strategy

- **MVP**: Phases 1-3 (US1). Every existing transcript gains chips, the full view and the return path, with no change to how he writes.
- **Increment 2**: Phase 4 (US2), the composer overlay, the riskiest part, gated by its own e2e and byte tests.
- **Increment 3**: Phase 5 (US3), after the owner approves the prompt sentence.
- Phase 6 closes each increment that ships (DESIGN.md, budget, UI checks, full gate).
