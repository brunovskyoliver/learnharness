# Feature Specification: Continue an unfinished lesson from Home

**Feature Branch**: `claude/fervent-bohr-l648pg`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Feature 003 — Continue an unfinished lesson from Home. Evidence (hosted usage review 2026-10-28, ~/agent-runs/2026-10-28-learnharness-usage/report.md): the learner's ML lesson plan has 11 topics; 8 were visited by 2026-10-26 21:09 and Probability, Classification and the course mapping were never reached; there have been no lesson turns since 2026-10-27. Feature 002's "Waiting for you" list on Home shows unanswered checks and open practice problems, but an unfinished lesson plan with no pending question appears nowhere, so the stall went unnoticed. Goal: Home shows lessons whose plan still has unvisited topics, with progress (e.g. "3 of 11 topics left") and the next topic, and a way to resume the lesson. Plan blocks already store per-topic status (src/core/plan-blocks.ts)."

## Clarifications

### Session 2026-10-28

- Q: What does resume do? → A: The lesson opens at the bottom with "Continue with <next topic>" in the composer, not sent.
- Q: A lesson with topics left and an unanswered question? → A: One row, merged: it stays in "Waiting for you" with its Answer button and gains the progress line.
- Q: Can an unfinished lesson be hidden from Home? → A: No. It stays until every topic is reached or the lesson is deleted.
- Q: Where on Home do lessons with topics left (and no pending question) appear? → A: Inside "Waiting for you", after the Answer/Solve rows, with kind label "Lesson", the progress line and a "Continue" button.
- Q: Does the topic currently being taught count as left? → A: Yes; next is the current topic. (Asked with the Oct 26 plan snapshot as the example. The live derivation on 2026-10-28 gives "2 of 11 topics left · next: Learning by gradient descent": the learner went on to Probability and Classification, then returned to gradient descent on Oct 27.)
- Q: The lesson already has an unsent composer draft when Continue is pressed? → A: The draft stays untouched and "Continue with …" is not inserted.
- Q: Do Continue rows count toward the heading's "{n} open"? → A: Yes, one total over every row in the list.
- Q: (implementation) The app has no lesson-complete signal; with the current topic counted as left, no lesson reaches 0 left. When does a lesson stop getting a Continue row? → A: Once every plan topic has had at least one check. Until then, left = topics never checked + the current topic.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See unfinished lessons on Home and resume one (Priority: P1)

A learner opens Home some days after their last lesson. In "Waiting for you", after the questions and problems, they see each lesson whose plan still has topics left: kind "Lesson", the lesson title, how many topics are left out of the total, the next topic's name, and how long ago they last worked in it. A "Continue" button takes them back into that lesson, ready to carry on.

**Why this priority**: The hosted usage shows a lesson idle since 2026-10-27 with "Course lectures and assignments" never reached and nothing on Home pointing back to it. Feature 002 only surfaces lessons that are mid-question.

**Independent Test**: With review data holding one lesson whose plan has topics left and no pending question, open Home and resume that lesson using only the new entry.

**Acceptance Scenarios**:

1. **Given** a lesson whose plan has topics left and no unanswered question, **When** Home opens, **Then** "Waiting for you" lists it after every Answer/Solve row, with kind "Lesson", its title, "{n} of {total} topics left · next: {next topic}", the time since the lesson was last active and a "Continue" button.
2. **Given** the learner presses Continue and the lesson's composer is empty, **Then** the lesson opens at the bottom of its transcript with "Continue with {next topic}" in the composer, not sent. Nothing reaches the model until the learner sends it.
3. **Given** the learner presses Continue and the lesson's composer already holds a draft, **Then** the lesson opens at the bottom with the draft untouched and nothing inserted.
4. **Given** Continue rows and Answer/Solve rows, **Then** the heading's "{n} open" counts every row.
5. **Given** a lesson where every plan topic has had at least one check, **Then** it is finished and gets no Continue row or progress line.
6. **Given** a lesson with no plan yet (still measuring, or never planned), **Then** it gets no Continue row.
7. **Given** a practice session, **Then** it never gets a Continue row or a progress line (practice has no plan).

---

### User Story 2 - Progress stays true as the lesson moves (Priority: P2)

After the learner works through another topic and returns to Home, the count and the next topic have moved on. When the last topic is reached, the lesson leaves the list.

**Why this priority**: A progress line that lags or lies erodes trust in the whole section (Principle IV).

**Independent Test**: Answer a check on the next topic in a review lesson, return to Home, and confirm the count dropped and the next topic changed.

**Acceptance Scenarios**:

1. **Given** the learner reaches a new topic in the lesson, **When** they return to Home, **Then** the count of topics left and the next topic reflect it.
2. **Given** the teacher rewrites the plan mid-lesson, **Then** the count and next topic follow the current plan, not the old one.

### Edge Cases

- A lesson that has topics left **and** an unanswered question: one row in "Waiting for you" with its Answer button, carrying the same progress line. It gets no separate resume row.
- The topic currently being taught counts as left. "Next topic" is the current topic when there is one, otherwise the first unfinished topic in plan order. Unfinished means the plan view shows the topic as current or upcoming; a topic revisited later is current again. Hosted example: "2 of 11 topics left · next: Learning by gradient descent".
- Lessons the learner has abandoned on purpose: they stay on Home until every topic is reached or the lesson is deleted. There is no hide action in this feature.
- The session list fails to load: the section says so in words with a way to try again, and a failed refresh keeps the last list (same as feature 002).
- Many unfinished lessons: Continue rows are ordered by most recently active first, after all Answer/Solve rows (which keep feature 002's newest-posed-first order).
- Nothing waiting and no unfinished lesson: feature 002's empty sentence stays as is.
- Deleting a lesson removes it from the list.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: "Waiting for you" MUST list every lesson whose current plan has at least one unfinished topic and that has no unanswered question, as a "Lesson" row after all Answer/Solve rows, most recently active first.
- **FR-002**: Each Continue row MUST show the kind "Lesson", the lesson title, "{n} of {total} topics left · next: {next topic}", the time since the lesson was last active and a "Continue" button. The current topic counts as unfinished; next topic is the current topic, else the first unfinished topic in plan order.
- **FR-003**: Progress MUST be derived from the lesson's transcript and current plan each time the list is built; nothing new is stored on the lesson or the graph (Principle II: understanding derived at read time).
- **FR-004**: Continue MUST open the lesson at the bottom of its transcript. If the lesson's composer is empty it MUST hold "Continue with {next topic}", unsent; if it already holds a draft, the draft stays untouched and nothing is inserted (Principle III). Nothing is sent to the model on its own (Principle V).
- **FR-004a**: A lesson that also has an unanswered question MUST appear once, as its "Waiting for you" row with the Answer button, and that row MUST show the same progress line.
- **FR-005**: Lessons with no plan, finished lessons (every plan topic has had at least one check), and practice sessions MUST NOT get a Continue row or a progress line.
- **FR-005a**: The heading's "{n} open" MUST count every row in the list, Continue rows included.
- **FR-006**: Loading, empty, failed and populated states MUST be visibly distinct; a failed refresh keeps the last list.
- **FR-007**: The entry MUST NOT reveal any question content, answers or explanations; it shows plan topic titles only.
- **FR-008**: The new entries MUST meet DESIGN.md (Study ink), keyboard use, visible focus and 320/390/1440 px layouts.

### Key Entities

- **Lesson progress**: for one lesson, the total number of plan topics, the number unfinished (current included), the next topic's title, and when the lesson was last active. Derived, never stored.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the hosted ML lesson's data as of 2026-10-28 (current topic "Learning by gradient descent", "Course lectures and assignments" never reached), Home shows "2 of 11 topics left · next: Learning by gradient descent", within the same load time as Home today.
- **SC-002**: A learner reaches an unfinished lesson from Home in one action.
- **SC-003**: After progress in a lesson, the count on Home is correct on the next visit in 100% of review-data cases.
- **SC-004**: Home's startup cost stays within the 5% performance budget (Principle VIII).

## Assumptions

- "Topic" means a node of the lesson's plan; "finished" means the lesson has moved past it (it is visited and not the current topic), using the same derivation the plan view already uses.
- Row visuals reuse feature 002's waiting row (quiet button, amber only on the kind label) per DESIGN.md.
- Only teaching sessions have plans; follow-up practice sessions are out of scope.
- "Last active" is the session's last update time (`updatedAt`), the same time the sidebar shows.
- Hosted and local modes behave the same; the list is per tenant like the session list.
