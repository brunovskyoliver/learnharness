# Fix: practice-hint-in-card

## Changes
- `src/core/native-messages.ts`: `latestTutorReplyOf(messages, problemCallId)` — learner-facing prose (text and send_to_user) after the last practice-thinking for the problem.
- `components/practice-dock.tsx`: `tutorReply` block under the statement ("Tutor" label) and the placeholder switch.
- `components/chat.tsx`: computes the reply; Submit collapses the card and marks it to reopen when the turn ends with the same problem open and a reply present; `revealArrival`/`probeArrivalExpanded` return open; a check arriving while mounted calls `openCheck` (scroll + focus on fine pointers).
- `app/globals.css`: `.lh-check-reply` spacing.

## Tests
- `tests/practice-tutor-reply.test.ts` (3), `tests/reveal-arrival.test.ts` updated, `tests/e2e/study/lesson-check-thread.spec.ts` reveal helper now asserts arrival open.
- `npm test`: 4846 pass, 0 fail. lesson-check-thread: 3 failures, all pre-existing at fe682a3f (the 4th pre-existing one now passes); practice, review, setup-model-picker specs pass.

## Not done
- `impeccable` / `web-design-guidelines` pass on the new card block and a visual check of the reply in a live practice turn.
