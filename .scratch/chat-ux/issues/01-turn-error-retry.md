# Failed turn: plain message and Retry

## Findings

- `components/chat.tsx:1617` renders `Something went wrong: {error.message}` in a red box. No retry, no `role="alert"`, no focus move. The raw message comes from the server's transient failure notice (`src/server/turn-runs.ts` `rememberTurnFailure`) or from a client network error.
- The server persists the learner's input write-ahead, then runs the turn. A failed settlement keeps the notice but not the unsaved reply, so the record ends at the learner's input.
- `{type: "continue"}` (`src/core/input-events.ts:171`, `inputAppends` → only pending dismissal conclusions) runs a turn on the existing record without appending a new user message. `continueIfOwed` deliberately never retries a failed turn automatically; an explicit learner click is the permission it waits for.
- Mid-stream network loss is already handled: `chat.tsx:939` re-checks the record and reattaches if the server turn is still running. Retry must stay hidden while `turnInFlight` is true.
- Model/key refusals (503 envelopes) already open setup and restore the draft; they never reach this banner.

## Proposed change

- Replace the box with an inline notice under the last turn: a plain sentence chosen by error class (network, provider/model failure, other), the raw text available on demand, and a Retry button that sends `{type: "continue"}` when no turn is in flight.
- `role="alert"`; focus moves to Retry only if focus was not in the composer (do not steal typing focus).

## Decisions (Oliver, 2026-10-27)

- Retry re-runs the model on the saved input via `{type: "continue"}`; no duplicate learner message.
- Plain sentence by error class; raw error text behind a Details toggle.

## Verification

- Unit: error classifier; Retry hidden while in flight; continue sent once.
- Browser: force a provider failure in review data, Retry produces one reply and no duplicated learner bubble; offline network error path; mobile 390px layout.
