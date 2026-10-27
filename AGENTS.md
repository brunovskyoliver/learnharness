<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# No guessing

All design authority belongs to the human. **Never guess a design or implementation decision.** If anything is ambiguous — naming, behavior, data shapes, UX, defaults, scope boundaries, prompt wording — STOP and ask with the ask-user-question tool before proceeding. If you are "a little unsure," you are unsure: ask. A wrong guess is far more expensive than a question. Ask early, ask specific, one question per call.

Concretely: first investigate and plan rigorously (asking the user design questions along the way), get the plan approved by the user, and only then implement. Implementation should be mechanical execution of an approved plan — not interpretation.

# Scrolling

Hide scrollbar tracks and thumbs throughout the interface, including textareas, code, math, menus, dialogs and rendered demo documents. Keep wheel, touch, keyboard and programmatic scrolling functional. Preserve focus visibility, scroll anchors and access to content behind floating controls.

# Features and the constitution

Every new feature or bug fix follows the Spec Kit flow and the constitution in `.specify/memory/constitution.md`. Read it before planning; a plan passes its Constitution Check (principles I–VIII) before code changes. Start features with the `speckit-feature` skill and bugs with `speckit-bug-assess`. UI rules live in `DESIGN.md`; build UI with the `shadcn` skill and check it with `impeccable` and `web-design-guidelines` before calling it done.
