# Feature Specification: Quick plot in any session

**Feature Branch**: `claude/fervent-bohr-l648pg`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Quick plot in any session. Evidence (hosted usage review 2026-10-28): in a practice session the learner wrote 'please plot this graph in demo f(x,y)=x^2+3y^2x'. Practice has no demo tool, so the agent pointed to Desmos and posed a slicing problem instead. In lessons, demos from the demo builder took 10, 5 and 11 minutes. The learner wants to see a function without waiting minutes and without switching to a lesson. A plot built directly on the demo kit (2D/3D function, sliders for parameters, no builder agent), available in practice and lessons."

## Clarifications

### Session 2026-10-28

- Q: How is a quick plot triggered? → A: By the agent: teacher and practice agents get a `plot` tool; the learner asks in words and the plot appears in that reply. No learner-side command.
- Q: Who sets slider and axis ranges? → A: The agent, per plot; the tool rejects invalid ranges.
- Q: Which plots are in scope? → A: Explicit y = f(x) and z = f(x, y) with parameter sliders. Parametric, implicit and multi-curve plots stay with the demo builder.
- Q: Is a plot run in headless Chrome before it shows? → A: Yes, like builder demos (~2–4 s): rendered once, checked for errors and finite values; a failure returns to the agent as an error to fix.
- Q: When does the teacher use `plot` over `demo`? → A: For any explicit function of one or two variables with parameters; `demo` for processes to Step/Run, simulations or several linked views.
- Q: When may the practice agent plot? → A: Only on the learner's request, declining in one line when the plot would give away the current problem's answer. Never on its own initiative, never as a hint.
- Q: (implementation) The teacher doctrine's intro said "Two artifact tools, both fire-and-forget"; fix? → A: Reword to "Two background artifact tools, `demo` and `visual`, both fire-and-forget (same async discipline as research), and `plot`, which draws an explicit function in this reply."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ask for a plot and see it right away (Priority: P1)

In a lesson or a practice session, the learner asks to see a function ("plot f(x,y) = x² + 3xy²"). Within the same reply, an interactive plot appears in the conversation: a curve for one variable, a surface with a contour view for two. They can open it beside the conversation like any demo.

**Why this priority**: The hosted learner asked exactly this and got a link to another site. A plot that arrives in seconds keeps them in the app and in the flow.

**Independent Test**: In a review practice session and a review lesson, ask for a plot of a one-variable and a two-variable function; the plot appears in the reply and opens beside the conversation.

**Acceptance Scenarios**:

1. **Given** a practice or lesson session, **When** the learner asks for a plot of a function of one variable, **Then** the reply contains a line plot of it over a sensible range, drawn without the background demo builder.
2. **Given** a function of two variables, **Then** the reply contains a 3D surface and a contour view.
3. **Given** the plot, **Then** it can be opened beside the conversation, expanded and downloaded like other demos.
4. **Given** a function the plot cannot draw (bad syntax, undefined everywhere in range), **Then** the reply says so in words and nothing broken appears.
5. Plots are made by the agent through a `plot` tool when the learner asks; there is no learner-side plot command.

---

### User Story 2 - Change parameters and range (Priority: P2)

When the function has parameters (a, b, k…), each gets a slider; the learner can drag them and see the plot update. Axis ranges are set by the agent; to change them the learner asks.

**Why this priority**: Parameters are where intuition comes from (the hosted lesson's step-size demos were all about one parameter).

**Acceptance Scenarios**:

1. **Given** a function with named parameters, **Then** each has a slider whose minimum, maximum, step and default the agent chose for this plot.
2. **Given** the learner changes a slider, **Then** the plot redraws within a moment.

### Edge Cases

- Practice: the agent plots only on the learner's request and declines in one line when the plot would give away the current problem's answer (Principle II); it never plots unprompted or as a hint.
- Headless browser unavailable: the plot is refused with the reason in words, as the demo builder does today (Principle IV); nothing untested is shown.
- The headless check fails (runtime error, no finite values): the agent receives the error and may correct the expression; the learner sees no broken plot.
- Implicit equations (x² + y² = 1), parametric curves, inequalities and several curves on one plot are out of scope; the agent uses the demo builder for those as today.
- Very steep or singular functions: the plot clips to a visible range rather than flattening everything.
- Theme changes keep the plot's state (as demos do today).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A plot of an explicit function of one or two variables MUST appear in the conversation without the background demo builder, in the same reply that answers the request.
- **FR-002**: One-variable functions show a line plot; two-variable functions show a 3D surface and a contour view.
- **FR-003**: Named parameters get sliders; the plot updates as they move.
- **FR-004**: Plots behave like existing demos: sandboxed, open beside the conversation, expand, download, keep state across theme changes.
- **FR-005**: An unplottable function produces a plain-language message, never a broken frame.
- **FR-006**: Practice sessions can plot on the learner's request only; the practice agent never plots unprompted, as a hint, or in a way that reveals a problem's answer.
- **FR-008**: Every plot is rendered once in the headless browser before it is shown; errors or no finite values return to the agent and nothing is shown.
- **FR-009**: The teacher uses `plot` for explicit one- and two-variable functions and `demo` for processes, simulations and multi-view instruments.
- **FR-007**: Meets DESIGN.md, keyboard use, visible focus and 320/390/1440 px.

### Key Entities

- **Plot**: the function expression, its variables, parameters with ranges, the axis ranges, and the title. Stored with the session like a delivered demo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The hosted request "f(x,y)=x^2+3y^2x" in a practice session produces a surface and contour plot in the reply, with no background job.
- **SC-002**: A plot appears in the same reply, adding at most about 5 seconds for its check, versus 5–11 minutes for builder demos.
- **SC-003**: 100% of review-data plots render without console errors in the sandboxed frame.
- **SC-004**: Startup cost stays within the 5% performance budget; plotting code loads only when a plot is shown.

## Assumptions

- Plots reuse the existing demo kit (its 2D chart and 3D surface/contour panels) and the existing demo display.
- The agent writes the expression in the demo kit's expression language (JavaScript over the variables, parameters and Math functions); the learner's notation is the agent's to translate.
