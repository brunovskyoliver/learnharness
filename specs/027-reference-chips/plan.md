# Implementation Plan: Reference chips

**Branch**: `unified-redesign` (harness worktree; no branch of its own) | **Date**: 2026-11-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/027-reference-chips/spec.md`

## Summary

References to Library items (`@name`, the selection actions' quote forms, `<library_passage>` blocks, `/library?item=` links) render as chips: kind icon, name, hint. In the composer they are a mirror layer under a transparent-text textarea, so the field, its value and its undo stay the browser's own. In sent messages, check answers, thinking markers and tutor replies they are links that open the item in a new Library full view at the passage, with a "Back to {lesson}" pill that returns to the same message, scroll position and chip. One pure recogniser (`referenceSpans`) serves the server's resolver and every chip, so a chip appears exactly where an item is attached. No stored format changes; one prompt sentence is added (owner wording).

## Technical Context

**Language/Version**: TypeScript 5, React 19, Next.js 16 (app router; `node_modules/next/dist/docs/` read for `useRouter`, `useSearchParams`, history behaviour before implementing)

**Primary Dependencies**: existing only: Streamdown, lucide-react, Radix via components/ui, Tiptap (page editor, lazy), pdf.js (reader, lazy). No new runtime dependency.

**Storage**: none new. Return point in `sessionStorage` (per tab), never learner data.

**Testing**: `node --test` via `tsx` (tests/*.test.ts[x], pure and static-render), Playwright Study journeys (tests/e2e/study), browser regressions in scripts/, `tests/startup-module-graph.test.ts`, `tests/token-hygiene.test.ts`.

**Target Platform**: browsers (Chromium, Firefox, WebKit), Electron desktop, hosted (Clerk tenants).

**Project Type**: web app (Next.js) with a file-backed store.

**Performance Goals**: startup JS on `/`, `/chat/new`, `/library` within +5% gzip of `adc0021` (R13); composer keystroke cost: one `referenceSpans` pass per change, under 1ms for a 4,000-character draft and a 2,000-item list (pinned by a benchmark test).

**Constraints**: byte-identical sent and stored text (III); hidden scrollbars; reduced motion; paper tokens only; 44px coarse targets; 320/390/1440 layouts.

**Scale/Scope**: five composer fields, four transcript carriers, tutor replies, the Library route, one prompt file.

## Constitution Check

*Gate before Phase 0; re-checked after Phase 1.*

| Principle | Status | Notes |
|---|---|---|
| I Owner decides | Pass | Gate 1 and gate 2 answered (spec Clarifications). Every design point below was approved at gate 2 ("go", 2026-11-08). Technical choices are research R1-R15 and progress.md Decisions. |
| II Teaching theory first | Pass | No change to lessons, checks, graph or practice. Opening a chip starts no model call and changes no lesson state (FR-017). The prompt sentence only asks for links. |
| III Learner data is never lost | Pass | Presentation only: drafts, sent text, stored messages, exports unchanged (SC-001 test). Copy yields the underlying text. No migration. Golden fixtures untouched. |
| IV Honest states | Pass | Reference rows and their labels stay (FR-012). Deleted, trashed and removed states are said in words; a failed list read never claims an item is gone; a missed passage says so. |
| V Consent before cost | Pass | No model calls, no automatic sends. |
| VI Interface follows DESIGN.md | Pass | Paper tokens and existing components (`.nb-pill`, the pane surfaces, `WorkspacePane`, `.lh-tool`); DESIGN.md gains "Reference chip". Focus visible, Escape and focus return kept, hidden scrollbars, reduced motion, 44px, 320/390/1440. Every UI task is built with the `shadcn` skill (tasks.md marks them); `impeccable` and `web-design-guidelines` check the result in the polish phase. |
| VII Boundaries, tenancy | Pass | `src/core` stays pure (spans, forms, href parsing, chip markdown). No new route; existing tenant-scoped routes. |
| VIII Performance | Pass, measured | Composer gets only the mirror and spans (R13); navigation, catalog and full view load with their routes. Startup budget measured before and after (T002, T049). |

Post-design re-check: unchanged, all pass. No Complexity Tracking entries.

## Owner review at gate 2: approved

The owner answered "go" on 2026-11-08: every item below is approved as written, with the analyze fixes (FR-008 and US2 scenario 2 reworded to item 1; US1 scenario 3 uses the reader's existing miss line).

1. **Composer quote form** (R3): a textarea overlay can only restyle the characters it covers, so in the composer the "About this part of" chip is the icon + name head joined to the passage lines drawn under it (markers hidden), not a one-line hint; the PDF form's hint is the literal ", page 4" drawn faint. Sent messages and tutor replies get the one-line form.
2. **Sent quote form**: the chip carries the passage and the separate quoted block (and "Sent from page {n}") is no longer shown in the transcript; the full passage is the chip's description and what the Library highlights.
3. **Kind icons**: the table in contracts/ui-contract.md §1.
4. **Full view back word**: `← Library` in place of the pane's ✕.
5. **New line** for a page whose passage is gone: "That passage is no longer in this page. Showing it from the top."
6. **Prompt sentence** (32-documents.md): contracts/ui-contract.md §3.
7. **`/library?item=` everywhere means the full view**: a reload, a pasted address or a new tab show the item full instead of beside the list (citation clicks inside pages keep opening the right pane). FR-021.

Also encoded after gate 2: feature 026's mirrored items (@ name `{linked folder}/{repo path}`, display name the file name, "Removed from the repo"), FR-020 and research R15.

## Project Structure

### Documentation (this feature)

```text
specs/027-reference-chips/
├── spec.md
├── plan.md              # this file
├── research.md          # R1-R15
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── ui-contract.md   # look, strings, a11y, states
│   └── recognition.md   # pure functions and the byte-identity test
├── checklists/requirements.md
├── progress.md
└── tasks.md
```

### Source code

```text
src/core/
├── library-refs.ts          # + referenceSpans, referenceForms; parseReferences via spans
├── document-anchors.ts      # + parseLibraryHref
└── reference-chips.ts       # new: chipMarkdown, chipTarget helpers (pure)
src/agent/prompts/shared/32-documents.md   # + one sentence (owner wording)
components/
├── reference-field.tsx      # new, startup: mirror layer + Backspace/Delete rule
├── reference-chip.tsx       # new: ReferenceChip, ReferenceLink, kind icons, copy handler
├── reference-catalog.ts     # new: live list + trash lookup (TTL from references-card)
├── reference-return.ts      # new: return point read/write/clear, focus-return hook
├── composer.tsx             # uses reference-field
├── question-dock.tsx, practice-dock.tsx, home.tsx, new-session.tsx   # through Composer / the field
├── user-turn-text.tsx       # chips in sent text
├── answered-card.tsx, practice thinking card   # chips in other carriers
├── transcript-passages.tsx  # skip [data-ref-chip] clicks
├── ai-elements/message.tsx  # tutor components set with the `a` override, chipMarkdown
├── chat.tsx                 # passes references to UserTurn; focus return on arrival
├── workspace-pane.tsx       # + `full` presentation
└── library/
    ├── use-library-mention.ts   # exposes items/spans to the field
    ├── references-card.tsx      # row names open like a chip; TTL cache moves out
    ├── library-view.tsx         # full view for ?item=, trash ?entry=, Back pill
    ├── library-full-view.tsx    # new: chooses the surface, local pane adapter, image/other views
    ├── library-trash.tsx        # entry landing
    └── page-pane.tsx            # surfaces accept a `full` flag; page "passage gone" line
app/paper.css                # .lh-ref-chip*, .lh-ref-field, .lh-ref-mirror
DESIGN.md                    # Reference chip entry
tests/
├── reference-spans.test.ts, reference-forms.test.ts, chip-markdown.test.ts, library-href.test.ts
├── reference-chips-bytes.test.ts, render-reference-chips.test.tsx, reference-return.test.ts
└── e2e/study/reference-chips.spec.ts
```

**Structure Decision**: the existing single Next.js project. New startup code sits outside `components/library/` (the startup-graph test allows only `use-library-mention.ts` there); route-only code sits with the Library and chat.

## Complexity Tracking

None.
