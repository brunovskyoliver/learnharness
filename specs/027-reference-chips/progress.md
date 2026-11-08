# Feature 027: Reference chips
Stage: implement
Updated: 2026-11-08T13:40:00Z

## Decisions
- Owner (with the request, 2026-11-08): clicking a chip opens the item in the Library's full view at the quoted passage or PDF page, highlighted; "← Back to {lesson}" and the browser's Back return to the same message and scroll position. Same for every file type.
- Owner (with the request): chips appear in the composer, in sent messages and in tutor replies. In the composer they are drawn over the existing text field (typing, paste, undo and IME unchanged); Backspace removes a whole chip; the "About this part of … >" form is one chip carrying the passage.
- Owner (with the request): a chip shows the kind icon, the name and a hint ("· p. 4" or the start of the quoted passage).
- Standing: chips are presentation only (constitution III, no format change, no migration); the "Used … / outline only / …" labels stay visible (IV); UI follows 025's paper system.
- Owner gate 1 (2026-11-08, "ok" = every recommendation):
  - Q1: tutor replies chip links to a Library item (today's page citations, extended to any item) and `@name` that resolves to an item; plain words stay text.
  - Q2: renamed shows the current name and opens normally; in the trash opens its Trash entry with Restore; deleted for good shows the name as written, faint, not a link, "· no longer in your Library".
  - Q3: the reference rows above a sent message stay; their names open like a chip (full view + Back pill) instead of the side pane.
  - Q4: Notebook out of scope; `[[…]]` links unchanged.
  - Q5: the Back pill stays until he goes back or leaves the Library; it persists while opening other items or folders there and survives a reload.
- Agent (assumption, recorded in spec): feature 026's git-mirrored items are treated like any item; a mirrored item removed upstream renders like the deleted case with "· Removed from the repo". Superseded by the gate-2 entry below.
- Agent (plan): technical choices R1-R14 in research.md. Items that need the owner at gate 2 are listed in plan.md, "Owner review at gate 2".
- Owner gate 2 (2026-11-08, "go" = every item in plan.md "Owner review at gate 2" and the analyze fixes):
  1. Composer quote form: icon + name head joined to the passage lines drawn under it (markers hidden); PDF hint is the literal ", page 4" drawn faint. Sent messages and tutor replies get the one-line chip. FR-008 and US2 scenario 2 reworded (analyze HIGH 1).
  2. Sent quote form: the chip carries the passage; the separate quoted block and "Sent from page {n}" are no longer shown (FR-010, US1 scenario 12).
  3. Kind icons: ui-contract §1 table as is.
  4. "← Library" replaces the pane's ✕ in the full view.
  5. Page passage gone: "That passage is no longer in this page. Showing it from the top." (FR-014).
  6. Prompt sentence for 32-documents.md as in ui-contract §3.
  7. Any `/library?item=` address means the full view; citation clicks inside pages keep opening the side pane (FR-021, T056).
  - Analyze HIGH 2: US1 scenario 3 uses the reader's existing line "That passage wasn't found on page {n}. The file may have changed. Showing the page anyway."
- Owner (with gate 2): feature 026 is implemented before this one on the same branch. Mirrored items' @ name is `{linked folder}/{repo path}` (display name = file name); removed entries read "Removed from the repo". Encoded as FR-020, US1 scenario 13, research R15, tasks T053-T055, T057.
- Agent (technical, R15): chips never build @ names; they reuse `nameTable`, so "/" in names needs no special case. Sent-message catalog takes mirrored entries by id from reference-catalog with the reference's name as fallback; T053 pins what 026 stores.

## Log
- 2026-11-08 specify: spec.md and checklists/requirements.md written from the owner's request and screenshot; five points left open for clarify.
- 2026-11-08 clarify: gate 1 answered "ok" (all recommendations). Encoded as a Clarifications session; FR-011, FR-012, FR-015 rewritten, FR-019 added, US1 scenarios 7-11, edge cases and assumptions updated; no "[Open" markers remain. Checklist 16/16 → 16/16.
- 2026-11-08 plan: plan.md, research.md (R1-R14), data-model.md, contracts/ui-contract.md, contracts/recognition.md, quickstart.md. Constitution Check I-VIII pass (I and VI conditional on the gate-2 items).
- 2026-11-08 tasks: tasks.md, 52 tasks in 6 phases: Setup 3, Foundational 12, US1 17, US2 10, US3 5, Polish 5. MVP = phases 1-3 (US1).
- 2026-11-08 analyze: read-only. 0 critical, 2 high, 5 medium, 3 low; FR coverage 19/19, SC 6/6. Before the pass, fixed: shadcn-while-building gate marked on UI tasks; the Back pill is cleared by a pathname effect, not unmount (Next keeps routes mounted); focus return triggers on pathname; row links get focus keys; hosted check added to T051. HIGH: (1) FR-008 / US2 scenario 2 vs R3, composer quote form can't be a one-line hint (owner item 1); (2) US1 scenario 3 quotes the highlights string, not the reader's miss line for his own passage. Checklist 16/16.
- 2026-11-08 gate 2: owner "go". Encoded in spec (Clarifications gate-2 session, FR-008, FR-010, FR-014 reworded; FR-020, FR-021 added; US1 scenarios 3 reworded, 12-13 added; US2 narrative and scenario 2; edge cases; assumptions), plan (gate-2 list approved, Constitution I pass, VIII task ref T002), research (approvals, R9 return-point fields aligned with data-model, every `/library?item=` caller, R15 for 026), contracts (approved markers, mirrored row, "/" fixtures), data-model, quickstart, tasks (T053-T058 added at the end of phases 2-5, 026 dependency). Cheap MEDIUM fixes: FR-014 vs the PDF reader (page opens, not top), R9 field drift, tutor-reply copy (T058), other `/library?item=` links (T056).
- 2026-11-08 analyze (rerun, read-only): 0 critical, 0 high, 2 medium, 3 low; FR coverage 21/21, SC 6/6; 58 tasks. MEDIUM, owner questions (not guessed): (M1) the composer draws no chip for a tombstone name although the server still resolves it and attaches a "no longer in your Library" reference (FR-003 vs ui-contract §1); (M2) two mirrored files with the same name (`week1/notes.md`, `week2/notes.md`) give identical chips and accessible names outside the composer. LOW: page highlight covers only the passage's first block (R9); FR-002 "exported" has no explicit test; `check-prerequisites.sh` resolves to 025 on this branch (analysis read 027 directly).

## Report
