# Plan: Integration polish (023)

## Constitution Check

| Principle | Result |
| --- | --- |
| I Owner decides | Pass under the standing no-questions approval. Decisions are in spec.md, Clarifications, and all owner-facing ones in docs/workspace-decisions.md. The 009-versus-goal question is decided narrowly and flagged first. |
| II Teaching theory first | Pass. No lesson, question or graph change. `page_revise` keeps its gate while a question or problem waits, held or not. |
| III Learner data is never lost | Pass. Proposals are apart from the page; refusals change nothing; his draft becomes his version before an AI version. Open **exception candidate**, as in 017, 021 and 022: a deleted session's proposals keep their content. |
| IV Honest states | Pass. Loading, failed, empty, blocked and decided are distinct. The row says waiting, never done. The tool tells the model the same. |
| V Consent before cost | Pass. No new model call. Accept, Reject and Edit first call nothing. |
| VI Interface follows DESIGN.md | Pass. Existing Dialog, Skeleton, token classes and shared comparison rows. Keyboard path closes the gap carried from 020. Checked at 320, 390 and 1440 and with reduced motion emulated. |
| VII Boundaries and tenancy | Pass. `src/core/page-proposals.ts` is pure, writes only in `src/store`, every route `withTenant`, by test and by the real-proxy regression. |
| VIII Performance | Pass, measured in progress.md. The line and dialog load on demand. |

## Design

- **Core**: `src/core/page-proposals.ts`: the record, `isHeldEditRequest`, `isHeldEditTurn`, `mergeProposal`.
- **Store**: `src/store/page-proposals.ts`, using `versionedInternals` under the Library's own lock, so the order of writes and crash repair are the page's. A crash after the version and before the status repairs through the version's `proposalId`.
- **Tool**: `pageTools` takes an optional `held`; the two registries wire it. Same input, same apply, no write.
- **Server and routes**: `src/server/page-proposals.ts`, `app/api/library/page-proposals/**`.
- **UI**: `page-proposals-line.tsx`, `page-proposal-dialog.tsx`, the transcript row, History's label. `PageDraftController.whileAccepting` holds writes and outside changes during Accept and then loads the new text, so his own decision never shows the conflict line.
- **Merge**: one changed region per side, by lines. Disjoint with a gap applies; anything else refuses. Deliberately no three-way merge library.

## Rollback

- A build without this feature never reads `library/page-proposals/`. Pending proposals sit unused, and the page and draft are as they were.
- Versions from an Accept carry cause `proposal-approved` and `proposalId`, already read by 022. On a pre-022 build these are extra fields on JSONL lines, and the text is an ordinary version.
- The catalog's version and shape are unchanged. `tests/data-preservation.test.ts` asserts it.
- To stop holding without a rollback: remove `pageProposals` from `src/server/library-tool-context.ts`. Tools then land directly as before, and waiting proposals can still be decided.

## Known limits

- Accept from a transcript row or the Library while the same page is open with typing goes through the store correctly, but that open tab shows the conflict line, as 022's diagrams do. From the page's own line it doesn't. His text is in History either way.
- Two far-apart typed edits around the tutor's change refuse, because only one region each is compared.
- A held edit in a turn whose model ignores the selection and rewrites the whole page shows as such in the comparison. Scope to the selection is the prompt's word, and the review is the safeguard.
- The Select text path moves by word and by pdf.js text run, which is close to a line. It doesn't offer character steps.
