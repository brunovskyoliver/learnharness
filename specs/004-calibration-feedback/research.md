# Research: Calibration feedback

## R1. Where the counts are derived
- **Decision**: Per chat in the summary projection (`calibrationOf(messages)` in `src/core/calibration.ts`), aggregated on Home by `mergeCalibration(chats)` over the shared `/api/chats` list.
- **Rationale**: Same seam as 002/003: cached by file stamp, no new request. Hosted data is small (one learner, ~10 misses).
- **Alternatives**: a `/api/calibration` route (extra request on Home); client derivation from transcripts (ships transcripts).

## R2. Which answers count
- **Decision**: `toolResult` messages whose `details` is a question answer with `correct` boolean, numeric `confidence`, `dontKnow` false and not `dismissed`. Covers teach-phase `quiz` and any probe answer that carries both fields; `explain`/ask answers have no `correct` and are skipped.

## R3. Level bucketing
- **Decision**: midpoints between the four stops (25/50/75/95): `< 37.5` Guessing, `< 62.5` Unsure, `< 85` Fairly sure, else Certain. Old exact values (e.g. 100) land on the nearest level.

## R4. Where a miss links
- **Decision**: `/chat/<id>#message-<messageId>`, the existing deep link (`messageAnchorId`, windowed transcript backfill). `messageId` = the assistant message carrying the check if it has prose, else the nearest earlier assistant message with prose (anchors exist only at a teacher message's first prose block). No transcript change.
- **Alternative**: a new anchor on the answered card by tool call id (needs transcript-window changes).

## R5. Percent
- **Decision**: `round(100 * right / answers)`, shown only when `answers >= 5`.
