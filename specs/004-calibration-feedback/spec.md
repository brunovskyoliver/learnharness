# Feature Specification: Calibration feedback

**Feature Branch**: `claude/fervent-bohr-l648pg`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Feature 004 — Calibration feedback: show the learner how well their confidence matches their results. Evidence (hosted usage review 2026-10-28, ~/agent-runs/2026-10-28-learnharness-usage/report.md): 61 of 63 quiz answers in the ML lesson were given at 95 or 100 confidence; 10 of the 12 wrong answers were at 95–100 (7 at 100). Accuracy at 100 was 85%, at 95 it was 81%. Confidence did not separate right from wrong, so the confidence control is being used as "submit". Quiz answers already carry confidence (four stops: Guessing 25, Unsure 50, Fairly sure 75, Certain 95; older answers keep exact percentages) and a graded result (src/core/question-core.ts). Goal: give the learner calibration feedback, e.g. "You said Certain 34 times and were right 29", and list the questions they got wrong while Certain so they can revisit them, so the confidence rating becomes meaningful. Derived at read time from answers (constitution Principle II), never stored on graph nodes; misconceptions are not a node category."

## Clarifications

### Session 2026-10-28

- Q: Where does the calibration feedback live? → A: A "Calibration" section on Home, between "Waiting for you" and the knowledge graph: one line per confidence level, then the confident misses.
- Q: Which answers do the counts cover? → A: All sessions, all time.
- Q: What does picking a confident miss do? → A: Its session opens scrolled to that check, showing the learner's answer and the explanation already given. No model call.
- Q: How does each confidence line read? → A: "{Level} · {n} answers · {r} right ({p}%)"; the percent is hidden when the level has fewer than 5 answers.
- Q: What shows with no graded answers yet? → A: The section is hidden entirely.
- Q: How many misses does the list show? → A: The newest 5, then a "Show all {n}" button that expands the list in place.
- Q: Names? → A: Section "Calibration"; list subheading "Wrong while Certain".
- Q: (implementation) Miss row button and empty sentence? → A: Button "Review"; empty: "None yet. Every answer you marked Certain was right."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See how well confidence matched results (Priority: P1)

After answering lesson checks, the learner sees, for each confidence level they used, how many answers they gave at that level and how many were right ("Certain: 34 answers, 29 right"). They can tell at a glance whether "Certain" really meant certain.

**Why this priority**: The hosted data shows confidence carried no signal (10 of 12 misses at the top level). Feedback is the only lever that gives the control a purpose.

**Independent Test**: With review data holding graded checks at several confidence levels, open the calibration view and compare its counts with the answers in the transcript.

**Acceptance Scenarios**:

1. **Given** graded check answers with confidence, **When** Home opens, **Then** the "Calibration" section shows one line per confidence level with at least one answer, in the order Guessing, Unsure, Fairly sure, Certain: "{Level} · {n} answers · {r} right ({p}%)", with the percent omitted when n < 5.
2. **Given** an answer given as "I don't know", **Then** it is not counted (it carries no confidence).
3. **Given** no graded answers with confidence yet, **Then** the "Calibration" section is not shown at all.
4. **Given** answers saved under the older slider (exact percentages such as 100), **Then** each is counted under the named level it is closest to.
5. The view is a "Calibration" section on Home, between "Waiting for you" and the knowledge graph.
6. The counts cover every graded answer in every session, all time.

---

### User Story 2 - Revisit the misses made while Certain (Priority: P2)

Below the counts in the same Home section, the learner sees the checks they answered wrong while Certain, newest first, each with its question in one line and the lesson it came from, and can open the lesson at that check.

**Why this priority**: A confident wrong answer is the strongest sign of a misunderstanding; listing them turns the numbers into something to act on.

**Independent Test**: With a review lesson containing a wrong answer at Certain, open the view and reach that question from its row.

**Acceptance Scenarios**:

1. **Given** wrong answers given at Certain, **Then** under the subheading "Wrong while Certain" the newest 5 are listed, each with its question text (one line, markdown stripped), the session title and when it was answered; with more than 5, a "Show all {n}" button expands the list in place.
2. **Given** the learner picks a listed miss, **Then** its session opens scrolled to that check, showing the learner's answer and the explanation already given. Nothing is sent to the model.
3. **Given** no misses at Certain, **Then** the subheading shows with "None yet. Every answer you marked Certain was right."
4. The list never shows the correct option or the explanation before the learner opens the session (answers already given are the learner's own history and may show there as today).

### Edge Cases

- Practice problems have no confidence and are not counted.
- Probe questions (before the plan) count like lesson checks if they carry confidence and a graded result; ungraded questions are skipped.
- A deleted session's answers disappear from the counts.
- Very few answers (fewer than 5 at a level): the counts still show, without the percent.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST derive, from saved answers at read time, per confidence level: number of answers and number right. Nothing new is stored on sessions or graph nodes (Principle II).
- **FR-002**: Confidence levels MUST use the existing four labels (Guessing, Unsure, Fairly sure, Certain); older exact percentages are counted under the nearest level.
- **FR-003**: "I don't know" answers and answers without a graded result MUST NOT be counted.
- **FR-004**: The learner MUST be able to see the list of checks answered wrong at Certain, with question text and session, and open its session at that check in one action.
- **FR-005**: With no counted answers the section is hidden; loading and failed states are visibly distinct (Principle IV), and a failed refresh keeps the last data.
- **FR-008**: Each level line MUST read "{Level} · {n} answers · {r} right ({p}%)", omitting "({p}%)" when n < 5. The misses list MUST show the newest 5 and a "Show all {n}" control when there are more.
- **FR-006**: No correct answer or explanation text appears in the counts or the list.
- **FR-007**: The view MUST meet DESIGN.md (Study ink), keyboard use, visible focus and 320/390/1440 px layouts.

### Key Entities

- **Calibration level**: a confidence label, the count of graded answers at that level, the count right. Derived.
- **Confident miss**: a graded wrong answer at Certain: session, question text, when answered, and where it is in the session. Derived.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the hosted ML lesson's data, the lesson checks alone give Certain 61 answers / 51 right, Unsure 1 / 0, and 10 misses at Certain (5 at 100, 5 at 95; the input's "7 at 100" was a counting error in the usage report, corrected 2026-10-28). With the 12 probe answers counted as research.md R2 specifies, Home shows "Guessing · 1 answer · 0 right", "Unsure · 7 answers · 2 right (29%)", "Certain · 66 answers · 55 right (83%)" and 11 misses. The one "I don't know" answer is not counted.
- **SC-002**: A learner reaches any listed confident miss in one action.
- **SC-003**: The counts match a hand count of the review data in 100% of cases.
- **SC-004**: Startup cost stays within the 5% performance budget (Principle VIII).

## Assumptions

- Only quiz-style checks carry confidence today; "graded" means the answer has a correct/incorrect verdict.
- Nearest-level bucketing uses the midpoints between the four stops (25, 50, 75, 95).
- Hosted and local modes behave the same; data is per tenant.
