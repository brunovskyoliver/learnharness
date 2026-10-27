<!--
Sync Impact Report
- Version change: template → 1.0.0 (initial ratification)
- Principles added: I Owner decides; II Teaching theory first; III Learner data is never lost;
  IV Honest states; V Consent before cost; VI Interface follows DESIGN.md;
  VII Boundaries, tenancy and sandboxing; VIII Performance does not regress
- Sections added: Technology and interface constraints; Development workflow and quality gates
- Templates: plan-template "Constitution Check" reads this file at runtime; no template edits.
- Sources: AGENTS.md, DESIGN.md, PRODUCT.md, docs/teaching-methodology.md, docs/vision.md,
  docs/development.md, owner rulings recorded in code comments (extracted 2026-10-27).
- Owner decisions 2026-10-27: visible keyboard focus always; DESIGN.md is the only UI source;
  permanent no-regression performance budget; required UI skills shadcn, impeccable,
  web-design-guidelines.
- Follow-up TODOs:
  - TODO(PERF_BASELINE): record final numbers from .scratch/performance-ui/plan.md once that work lands.
  - Resolve code vs. DESIGN.md conflicts: sidebar group hairline (components/sidebar.tsx:585);
    monospace on names in delete dialogs and "I don't know" text.
-->

# Brunovský's study Constitution

These rules bind every feature built in this repository from 2026-10-27 on, whether written by a
person, Claude Code or Codex. Spec Kit plans MUST pass the Constitution Check against each
principle below before implementation starts.

## Core Principles

### I. Owner decides (no guessing)

- All design authority belongs to Oliver. Agents MUST NOT guess naming, behavior, data shapes,
  UX, defaults, scope boundaries or prompt wording.
- Ambiguity is resolved with the ask-user-question tool, one question per call, options numbered
  with one marked recommended. Answers are recorded in the feature's spec (Clarifications) or
  ticket.
- Investigate and plan first, get the plan approved, then implement. Implementation is mechanical
  execution of the approved plan.
- Reversible, purely technical choices that the spec already constrains may be made by the agent
  and logged under Decisions in `progress.md`.

Rationale: a wrong guess costs more than a question; the codebase records hundreds of owner
rulings that guesses would silently override.

### II. Teaching theory first

Features that touch lessons, practice, questions or the graph MUST follow
`docs/teaching-methodology.md` and the decided parts of `docs/vision.md`:

- Teach the minimal tree, one reasoning step at a time, each step followed by a graded check.
  Never build on an unchecked step. No meta-narration; plan nodes are not lesson chapters.
- The system owns logistics (research, ordering, sources, visuals); the learner's effort goes into
  the material.
- The graph holds true propositions only. Learner understanding is derived from the event ledger at
  read time, never stored on nodes. Misconceptions are not a node category.
- Correct answers and explanations never reach the client before the learner answers. Quiz
  confidence is always sent on real answers and dropped on "I don't know".
- Practice problems never announce their target proposition; the next problem waits for the
  learner's explicit move-on.

Rationale: the product exists to make the goal understanding feel obviously true; features that
bypass the theory erode that.

### III. Learner data is never lost

- Accepted input is persisted write-ahead, before the turn runs. A refused gate persists nothing.
- Records are append-only where they are today (chat deliveries, graph ledgers). Chat records carry
  a schema version; future-version records are refused, never rewritten.
- Drafts, answer selections and reading positions survive navigation, reload and presentation
  changes. A reload that would lose a draft does not happen silently.
- The learner's own files are never edited. Write-back goes to a separate folder
  (`learning_summary` for notes summaries).
- Deleting a session removes its traces; shared graph nodes keep their identity. Golden fixtures in
  `tests/fixtures/golden-data/` change only in deliberate format updates.

### IV. Honest states

- No fake or phantom states. Missing models, keys or services produce an explicit refusal, never a
  silent fallback or default.
- Loading, empty, failed, running, interrupted and finished are visibly distinct. A failed refresh
  keeps the last good data. Errors read in plain words, with raw detail available on demand.
- Cost is computed at read time; unpriced runs say so, never show zero.
- Context added to a model call is labeled and visible to the learner (for example "Used 2 notes").
  Context is never dropped or injected silently.
- Unknown ids and invalid input get an honest 400/409, never a guessed value.

### V. Consent before cost

- Nothing that starts a paid model call or an externally visible action is sent automatically on
  the learner's behalf: no auto-send after setup, after reconnect or from a starter chip, and no
  automatic replay of a failed turn. Retry is an explicit click.
- Automatic background model work is allowed only within a budget the owner approved for that
  feature (for example the per-session cap on background visuals). It appears in the activity dock
  with cost and can be aborted.
- Turns and jobs are server-side objects. Closing or leaving a view detaches; only explicit stop
  cancels.
- BYOK: there are no factory model choices. Keys are never logged, printed or sent to the client
  beyond their mask.

### VI. Interface follows DESIGN.md

- `DESIGN.md` is the single source of UI rules. Other docs that disagree yield to it and are
  corrected.
- Build with the existing shadcn/Radix primitives and shared components (`TopBar`, `MenuShell`,
  shared tokens). No parallel custom components and no decorative libraries.
- No visible scrollbars anywhere, with every scroll method still working (see AGENTS.md). No
  structural separator lines; input, choice, selection, focus and resize boundaries remain.
- Keyboard focus is always visible. The whole app is usable by keyboard; Escape closes the
  innermost layer first; dialogs trap focus and return it to the opener. Pointer clicks do not
  leave focus on transcript controls.
- Respect reduced motion. Touch targets on coarse pointers are at least 44×44 px. Layouts work at
  320, 390 and 1440 px wide without page overflow.
- Every UI change uses the `shadcn` skill while building and is checked with the `impeccable` and
  `web-design-guidelines` skills before it is called done. Where DESIGN.md and a skill disagree,
  DESIGN.md wins.

### VII. Boundaries, tenancy and sandboxing

- `src/core` never imports server or store code; filesystem writes live only in `src/store`
  adapters. Lint boundaries stay green.
- Hosted mode: every mutable path and in-memory registry is tenant-scoped; access without a tenant
  is refused. Local and desktop behavior stays unchanged unless a spec says otherwise.
- Demos run in a sandboxed iframe (`allow-scripts`, no `allow-same-origin`). Bridge messages are
  validated by source window and payload. One live iframe serves every presentation; theme changes
  never reload it.
- Agent file tools stay confined to their allowed folders. Secrets stay out of source, fixtures,
  logs and chat.

### VIII. Performance does not regress

- Initial JavaScript, cold sidebar readiness and app startup MUST NOT regress by more than 5%
  against the recorded baseline, measured with the same throttled desktop and mobile benchmark.
  TODO(PERF_BASELINE): the baseline is the final result of `.scratch/performance-ui/plan.md`.
- Heavy libraries (math, diagrams, graph engine, account SDKs, editors) load on demand, not in the
  startup graph.
- Server-only benchmarks are reported separately and never presented as app speed.

## Technology and interface constraints

- Stack: Next.js (read `node_modules/next/dist/docs/` before using Next APIs), React, TypeScript,
  Tailwind CSS v4, shadcn/ui on Radix, Motion (demos and approved animations only), Lucide,
  Streamdown, KaTeX, Mermaid, sigma.js + graphology. New runtime dependencies need owner approval
  and a measured startup cost.
- Persistence is file-backed JSON/JSONL through store adapters. No database is introduced without
  owner approval.
- Theme: T3 Code's default web dark theme at the revision pinned in DESIGN.md. Saved custom
  backgrounds and reading preferences are preserved.
- Recommended skills when relevant: `accessibility` (WCAG 2.2, live regions),
  `vercel-react-best-practices` (rendering and bundle work), `tdd`, `diagnosing-bugs`,
  `writing-for-agents` (AGENTS.md and skills), `unslop` (user-facing prose).

## Development workflow and quality gates

- New features run through Spec Kit: `speckit-specify` → `speckit-clarify` → `speckit-plan` →
  `speckit-tasks` → `speckit-analyze` → `speckit-implement`, or the `speckit-feature` skill that
  chains them. Bugs use the `bug` extension (`speckit-bug-assess`, `-fix`, `-test`).
- Each feature keeps `specs/<NNN-name>/progress.md` with Stage, Decisions, Log and a final Report:
  what changed, how it was verified, what is left.
- Before a feature is done: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` pass;
  relevant browser regressions in `scripts/` pass; UI work is checked at 320, 390 and 1440 px.
  Pre-existing failures are recorded separately from new ones.
- Tests run without model requests. Browser regressions use isolated data, start their own server
  and intercept model submissions. Desktop window changes need a live Electron check.
- Implementation, commit, merge and deployment status are recorded separately. Agents do not push,
  deploy or publish unless Oliver asks in that thread.
- Evidence and one-off reports go under `~/agent-runs/<YYYY-MM-DD>-<topic>/`, never in build
  folders.

## Governance

- This constitution governs process and principles. `DESIGN.md` governs UI detail,
  `docs/teaching-methodology.md` governs pedagogy, and `AGENTS.md` carries the short runtime rules
  for agents; none of them may contradict this file.
- Amendments require Oliver's approval through a numbered question. Each amendment bumps the
  version: MAJOR for removing or redefining a principle, MINOR for a new principle or materially
  expanded rule, PATCH for wording.
- Every `plan.md` Constitution Check lists principles I–VIII with pass or a justified exception the
  owner approved. `speckit-analyze` treats a constitution conflict as CRITICAL.
- When a rule here turns out wrong in practice, stop and ask; do not work around it.

**Version**: 1.0.0 | **Ratified**: 2026-10-27 | **Last Amended**: 2026-10-27
