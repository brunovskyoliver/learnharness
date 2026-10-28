# Feature Specification: Course track

**Feature Branch**: `claude/fervent-bohr-l648pg`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Course track. Evidence (hosted usage review 2026-10-28): the learner's goal was a specific course (Stanford CS229, 2018, a YouTube playlist). Research found its lecture-notes index and Problem Set 0, and the lesson plan has a 'Course lectures and assignments' topic that was never reached. Attach a syllabus (playlist or lecture-note index) to a lesson, map lectures and problem sets to plan topics, and show progress per lecture." Owner scope (2026-10-28): version 1 is the syllabus on the plan; no video or transcript processing.

## Clarifications

### Session 2026-10-28

- Q: What does version 1 cover? → A: The syllabus on the plan: items with links mapped to plan topics, progress per item. No video or transcript processing.
- Q: Who writes the syllabus? → A: The teacher, through a `course` tool, usually after research; the learner asks in chat for changes. No editing UI.
- Q: When is an item covered? → A: When every plan topic mapped to it has had at least one check. Items with no mapped topic in the current plan show "not in this lesson's plan" and are never covered.
- Q: Where does the course show? → A: A "Course" list in the plan view, and a line on the lesson's Home row.
- Q: Which item kinds? → A: Lecture, Problem set, Notes, Reading (fixed list, shown as a small label).
- Q: Where in the plan popup? → A: Below the diagram, under a "Course" heading; the popup scrolls.
- Q: How does the Home row show it? → A: Appended to the progress line: "2 of 11 topics left · next: … · Course: 3 of 25 covered".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the course mapped onto the lesson (Priority: P1)

A learner starts a lesson with the goal of following a course. Once the teacher has found the course's materials, the plan view shows a "Course" list: each lecture and problem set in order, with its link, the plan topics that cover it, and whether it is covered yet.

**Why this priority**: The hosted learner named a course; the lesson never connected back to it. Seeing lectures against the plan tells them what the lesson has done for the course and what is left.

**Independent Test**: In a review lesson with a plan and a recorded syllabus, open the plan view and check each item's link, mapped topics and covered state against the transcript.

**Acceptance Scenarios**:

1. **Given** a lesson with a recorded syllabus, **When** the learner opens the plan view, **Then** a "Course" list shows the course title (linked when known) and each item in order with its kind, title (linked when known), mapped plan topics and covered state.
2. **Given** an item whose mapped topics have all had a check, **Then** it shows as covered.
3. **Given** an item with no mapped topic in the current plan, **Then** it shows "not in this lesson's plan".
4. **Given** the teacher rewrites the plan, **Then** items follow the current plan: topics that no longer exist stop counting.
5. **Given** a lesson without a syllabus, **Then** the plan view shows no Course list.

---

### User Story 2 - See course progress from Home (Priority: P2)

The lesson's row on Home ("Waiting for you", feature 003) also says how much of the course is covered.

**Acceptance Scenarios**:

1. **Given** an unfinished lesson with a syllabus, **Then** its Home row's progress line ends with " · Course: {covered} of {items} covered".
2. **Given** a lesson without a syllabus, **Then** the row is unchanged.

---

### User Story 3 - The teacher records and updates the syllabus (Priority: P1)

When the learner's goal is a course, the teacher records its syllabus through the `course` tool and can replace it later when the learner asks or research finds more.

**Acceptance Scenarios**:

1. **Given** the teacher calls `course` with items whose mapped topics exist in the current plan, **Then** the syllabus is stored with the lesson and the plan view shows it.
2. **Given** a call that maps an item to a topic not in the current plan, or has no items, **Then** the teacher gets the problems back and nothing is stored.
3. **Given** a later call, **Then** it replaces the whole syllabus.

### Edge Cases

- Syllabus recorded before any plan exists: refused with the reason (topics must exist).
- Very long syllabi (e.g. 20 lectures + 5 problem sets): the list scrolls within the plan view; Home shows only the count.
- Links are shown as given; the app never fetches them.
- Practice sessions have no plan and no course.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The teacher MUST be able to record a lesson's syllabus: course title, optional course link, and an ordered list of items with title, kind, optional link and the plan topics that cover it.
- **FR-002**: Recording MUST validate that every mapped topic exists in the current plan and that there is at least one item; problems go back to the teacher and nothing is stored.
- **FR-003**: A new recording replaces the previous syllabus.
- **FR-004**: Covered state is derived at read time: covered when every mapped topic that still exists in the plan has had at least one check; items with no such topic show "not in this lesson's plan" (Principle II: nothing derived is stored).
- **FR-005**: The plan popup MUST show a "Course" heading and list below the diagram when a syllabus exists.
- **FR-006**: The lesson's Home row MUST show "Course: {covered} of {items} covered" when a syllabus exists.
- **FR-007**: Links open in a new tab; the app never fetches them.
- **FR-008**: Meets DESIGN.md, keyboard use, visible focus and 320/390/1440 px.

### Key Entities

- **Course syllabus** (stored with the lesson): course title, optional link, items.
- **Course item**: title, kind, optional link, mapped plan topic ids.
- **Item coverage** (derived): covered / not covered / not in this lesson's plan.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A review lesson modeled on the hosted CS229 lesson, with a syllabus of lectures and Problem Set 0 mapped to its plan, shows correct covered states for every item.
- **SC-002**: The learner reaches any item's source from the plan view in one action.
- **SC-003**: Startup cost stays within the 5% performance budget.

## Assumptions

- The teacher gets the syllabus from research or its own knowledge; the feature does not crawl course sites.
- Item kinds: Lecture, Problem set, Notes, Reading.
- The syllabus is stored on the lesson record (an optional field; older records unaffected).
