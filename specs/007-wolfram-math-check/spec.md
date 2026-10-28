# Feature Specification: Wolfram math check through an MCP client layer

**Feature Branch**: `claude/fervent-bohr-l648pg`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "MCP client layer + Wolfram math check for LearnHarness's in-app agents. Source: ~/agent-runs/2026-10-28-mcp-tool-research/report.md (items 0 and 1, section 1 "The ChatGPT subscription is the model; pi is only the loop", section 3 Decisions). Server-run route: the model (ChatGPT subscription or any provider) chooses the tool via the pi-agent-core loop; the LearnHarness server executes it through @earendil-works/pi-mcp (approved dependency) against a fixed in-code server list, first entry Wolfram Cloud MCP at https://agenttools.wolfram.com/mcp (remote Streamable HTTP, free, no auth). Agents: practice (equivalence checks while grading a submitted step) and teacher (verify a computed correctAnswer/explanation before posing quiz/explain). Owner decisions: automatic calls with no per-call consent; each checked item labelled "Checked with Wolfram" and visible in the transcript; only the math expression leaves the server, never quiz or learner text; honest refusal when the server is unavailable; per-tenant scoping in hosted mode; abort follows the turn; change prompts/shared/15-accuracy.md "computations stay yours" (exact wording to be approved by Oliver). Open: hosted vs desktop availability given Wolfram's free-tier terms; whether WolframLanguageEvaluator is exposed or only WolframAlpha/WolframContext."

## Clarifications

### Decisions before this spec (Oliver, 2026-10-28, recorded in the research report)

- Route: server-run. The session's model (the ChatGPT subscription or any other provider) chooses the tool, and the LearnHarness server calls the MCP server. OpenAI-hosted MCP is not used.
- New runtime dependency `@earendil-works/pi-mcp`: approved. Its startup cost must still be measured.
- A compute tool is allowed. The accuracy doctrine's "computations stay yours" wording changes. Oliver approves the new wording.
- The math check runs automatically with no per-call consent. Each checked item is labelled "Checked with Wolfram" and the call is visible in the transcript.
- MCP servers come only from a fixed list in code. Adding one takes a spec.

### Session 2026-10-28

- Q: How does the teacher's pre-question check appear in the transcript? → A: Hidden until the learner answers the question it belongs to, then shown in full (Oliver).
- Oliver delegated the remaining choices to the agent ("I fully support your judgment"). Agent decisions:
  - Q: Hosted, desktop or both? → A: Both. The hosted app has one learner, which fits personal use. If Wolfram limits or blocks the server, checks fail honestly (FR-008).
  - Q: Which Wolfram tools? → A (revised during planning, after a live probe on 2026-10-28): the model gets no raw Wolfram tool. A single `math_check` tool runs one fixed, server-written equality check through WolframLanguageEvaluator. The model supplies only `lhs`, `rhs` and optional `assumptions`, each validated against a strict character whitelist (no strings, semicolons or assignments). WolframAlpha was dropped: it returned "No Results Found" for an integral and a sum, and gave no verdict when expressions differed. WolframContext is document retrieval, which this feature doesn't need. The evaluator template returned a clear agreed/disagreed/undecided in every probe case. Wolfram's approval recommendation targets free-form code, which the model never writes here.
  - Q: Per-turn limit? → A: 5 checks per turn per agent.
  - Q: Doctrine wording? → A: As drafted in FR-011.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Practice accepts a correct step written differently (Priority: P1)

In a practice session the learner submits a step in a different but equivalent form. For example, the gradient as `X^T(Xθ − y)/m` while the committed answer uses the per-example sum. Before giving a verdict, the practice agent checks whether the two expressions are equal. The learner gets "right" plus a note that the forms are equivalent, not a false "wrong" or a hint. When the step really is wrong, the check helps the agent find the first place it diverges, and the doctrine's one-nudge rule still applies.

**Why this priority**: Practice grading is where a wrong verdict costs most. The hosted "one complete training step" problem took 5 hints. A false "wrong" on an equivalent form erodes trust and wastes the learner's effort.

**Independent Test**: In a review practice session with a committed algebraic answer, submit an equivalent form and then a non-equivalent one. The first gets "right" with the label. The second gets "wrong" with one localized nudge. The transcript shows each check.

**Acceptance Scenarios**:

1. **Given** an active practice problem, **When** the learner submits an expression equivalent to the committed answer, **Then** the verdict is correct and the reply carries the "Checked with Wolfram" label.
2. **Given** a non-equivalent submission, **Then** the verdict is wrong, the nudge follows practice doctrine (no correction revealed), and the check's outcome is visible in the transcript. Its expressions appear once the problem is concluded.
3. **Given** a submission that is prose with no expression to check, **Then** no check runs and grading proceeds as today.

---

### User Story 2 - Teacher checks computed answers before posing them (Priority: P2)

Before posing a quiz or explain check whose correct answer comes from a computation (a derivative, an integral, a numeric value, a simplification), the teacher verifies that computation. If the check disagrees, the teacher fixes the question before posing it. After the learner answers, the revealed explanation or committed answer carries "Checked with Wolfram".

**Why this priority**: 61 of 63 hosted answers were given at 95–100% confidence. The learner trusts the key, so the key must be right. This story ranks below story 1 because a wrong key is rarer than a misgraded equivalent form.

**Independent Test**: In a review lesson, prompt a teaching step that leads to a computed quiz. The check runs before the quiz is posed. After answering, the explanation shows the label. Stub the check to disagree: the posed quiz uses the corrected value.

**Acceptance Scenarios**:

1. **Given** a quiz whose answer is a computation, **When** the teacher poses it, **Then** a check ran first and its result agreed with the committed answer.
2. **Given** the check disagrees, **Then** the teacher does not pose the original answer. It corrects the question, or if it can't resolve the disagreement, it says plainly that it is unsure (accuracy doctrine).
3. **Given** the learner has answered, **Then** the revealed explanation shows "Checked with Wolfram".
4. **Given** the check runs before the question, **Then** the check row stays hidden until the learner answers that question. After that it appears in full, with expression and result. Nothing the learner can see reveals the answer before they answer.

---

### User Story 3 - Honest states when the check can't run (Priority: P3)

When the math service is unreachable, slow, rate-limited or returns something unusable, the agent continues without the label and says in one line that the check wasn't possible. No item is labelled checked unless a check actually agreed.

**Why this priority**: Principle IV. Without it, the label could become a fake state.

**Acceptance Scenarios**:

1. **Given** the service is down, **When** the agent tries a check, **Then** the transcript shows the failed check in plain words, no label appears, and the turn continues.
2. **Given** the learner presses Stop during a check, **Then** the check is cancelled with the turn.
3. **Given** the service gives an answer that neither confirms nor refutes (ambiguous parse, no result), **Then** the item is treated as unchecked.

### Edge Cases

- **Expression extraction:** only the mathematical expression is sent, never quiz text, the learner's prose or any of the learner's thinking. The agent writes the expression itself. The learner's own formula counts as an expression.
- **No checkable math:** conceptual questions and proofs in words make no call.
- **Equivalence under assumptions:** if the expressions are equal only for some values (for example, `sqrt(x^2) = x` only for x ≥ 0), the agent says what the condition is and doesn't simply mark the answer right.
- **Agreement isn't proof:** numeric agreement on sampled points and symbolic agreement are reported for what they are. Only symbolic equality, or an exact match of a computed value, earns the label.
- **Many checks in one turn:** a per-turn limit applies (see Assumptions). Checks over the limit are refused with a reason the agent can see.
- **Hosted tenants:** a tenant's checks never share state, history or connection identity with another tenant.
- **Provider independence:** the tool behaves the same whichever model provider runs the session.
- **Server availability by mode:** the check runs in hosted and desktop mode alike. A block or rate limit from Wolfram on the hosted server is an ordinary honest failure.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST connect to MCP servers only from a fixed list defined in code. The first and only entry in this feature is Wolfram Cloud.
- **FR-002**: The math check MUST appear to agents as an ordinary tool, executed by the LearnHarness server, with the same argument healing, settings filtering and error handling as native tools. The MCP connection behind it (fixed server list, per-tenant connection, timeout, one reconnect after a dropped connection) is reusable by later MCP-backed tools.
- **FR-003**: The practice agent and the teacher MUST have the math check. The prober, the researcher and other background jobs do not have it in this feature.
- **FR-004**: No raw Wolfram tool is exposed to any agent. The only agent-facing tool is `math_check`. It runs one fixed, server-written equality check through Wolfram's evaluator, from validated `lhs`, `rhs` and optional `assumptions`.
- **FR-005**: A check MUST send only a mathematical expression or query. Quiz text, learner prose and learner thinking MUST NOT be sent.
- **FR-006**: Every check MUST be visible in the transcript with its expression and outcome, subject to two answer-hiding rules (Principle II). A teacher or practice pre-question check stays hidden until its question is answered or its problem concluded (User Story 2 scenario 4). A practice grading check shows its outcome at once, but its expressions, which contain the committed answer, stay hidden until the problem is concluded.
- **FR-007**: "Checked with Wolfram" MUST appear only on items whose check agreed (symbolic equality or exact computed match). It MUST never appear for failed, ambiguous or skipped checks.
- **FR-008**: Unavailable, slow, rate-limited or malformed responses MUST produce a plain-language failure the agent can act on and the learner can see. No silent fallback.
- **FR-009**: An in-flight check MUST be cancelled when the turn is stopped. Leaving the view detaches as with other turns.
- **FR-010**: In hosted mode, connections and any server state MUST be scoped per tenant. A request without a tenant MUST be refused.
- **FR-011**: The practice doctrine MUST tell the agent to check equivalence before giving a verdict on a submitted expression. The teacher doctrine MUST tell it to check computed answers before posing them. The accuracy doctrine (`prompts/shared/15-accuracy.md`) and the job doctrine's "never for math" line (`prompts/teacher/40-jobs.md`) MUST be reworded to allow this. Draft for 15-accuracy, replacing "Thinking — derivations, computations, reasoning — stays yours.": "Thinking stays yours: do the derivation and the reasoning yourself. When a result is a computation (a derivative, an integral, a simplification, a numeric value) and a math check is available, check the result before it becomes a quiz answer or a verdict. A check verifies your work; it does not replace it." Draft for 40-jobs, replacing "Never for internal reasoning or math": "Never for internal reasoning or math; computations go to the math check, if you have it." The plan may adjust the phrasing to fit each file.
- **FR-012**: Practice answers and quiz answers MUST still never reach the learner's view before the learner answers (Principle II).
- **FR-013**: The math check MUST appear in the existing agent tool toggles in Settings, on by default, and can be turned off like research or demo.
- **FR-014**: Adding the MCP client MUST NOT increase initial JavaScript, sidebar readiness or app startup by more than 5% (Principle VIII). The client is server-only.
- **FR-015**: The label MUST follow DESIGN.md, be readable at 320, 390 and 1440 px, and be announced to screen readers as text.

### Key Entities

- **MCP server entry**: one item in the fixed in-code list, with name, endpoint, transport, which agents may use it, which of its tools are exposed, and the per-turn call limit.
- **Math check**: one call, with the expression or query sent, the outcome (agreed, disagreed, inconclusive, failed), the raw result available on demand, and the question or problem it relates to. It is stored in the transcript like other tool calls.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a review practice session, 5 out of 5 equivalent-but-differently-written answers to committed algebraic answers are graded correct. 5 out of 5 non-equivalent ones are graded wrong.
- **SC-002**: No "Checked with Wolfram" label appears on any item whose check failed, was inconclusive or did not run. Verify with a stubbed unavailable server and a stubbed inconclusive result.
- **SC-003**: A check adds no more than about 5 seconds to a reply in the normal case. The first check after the server starts may take up to about 8 seconds, because it opens the connection (measured 2026-10-28: 3.5–4.5 s per check, 3 s to connect).
- **SC-004**: With the service unreachable, lessons and practice continue with a one-line notice. No turn fails because of the check.
- **SC-005**: Startup and initial JavaScript stay within the 5% performance budget.
- **SC-006**: Tests run without network or model requests, using a stubbed MCP server.

## Assumptions

- Wolfram Cloud MCP at `https://agenttools.wolfram.com/mcp` stays free and needs no authentication, per Wolfram's support page as of 2026-10-28. If that changes, the server becomes unavailable and is reported honestly (FR-008).
- The per-turn limit is 5 checks per turn per agent.
- A self-hosted SymPy fallback is out of scope. It is a later spec if Wolfram proves unreliable.
- Further MCP servers (lecture transcripts, code runner, papers) are out of scope. This feature's client layer should make them straightforward to add.
- The researcher's codemode idea from the report is out of scope.
