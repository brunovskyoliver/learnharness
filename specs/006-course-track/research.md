# Research: Course track

## R1. Storage: the transcript, like the plan
- **Decision**: the syllabus is the arguments of the latest successful `course` tool call (`latestCourse(messages)`), mirroring how the client derives the plan from the latest `plan_init`. No record field, no migration; re-calls replace; history stays.

## R2. Validation in the tool
- `courseInputProblems(input, tree)`: needs a saved plan; 1–100 items; every topic slug exists in the current tree; kinds `lecture | problem-set | notes | reading`; links `http(s)` only. Problems → `invalidInputResult`.

## R3. Coverage
- Plan-view statuses (`derivePlanStatusesLh`); a topic is checked when visited or current. Item: mapped topics ∩ current tree; empty → "not-in-plan"; all checked → "covered"; else "not-covered". Counts for Home: covered / all items.

## R4. Display
- Plan popup: "Course" heading (course title linked) then an ordered list: kind label, item title (linked, new tab), "Topics: …" titles, state ("Covered", "Not yet", "Not in this lesson's plan").
- Home: `progressLine` appends " · Course: {covered} of {items} covered" when the summary carries `course`.
