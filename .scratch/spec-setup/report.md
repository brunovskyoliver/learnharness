# Spec Kit setup, constitution and skills audit

Requested 2026-10-27 by Oliver: audit skills (installed and online), initialize Spec Kit, write a constitution from the project's rules and design choices, and make future features follow it and the UI skills. Specs for the planned features were cancelled by Oliver; the feature backlog stays in `.scratch/learning-ideas/ideas.md` and `.scratch/chat-ux/issues/`.

## What changed

- Spec Kit 1.1.0 initialized with `specify init --here --integration claude`, then `specify integration install codex --integration-options="--skills"`. Adds `.specify/`, `.claude/skills/speckit-*`, `.agents/skills/speckit-*`. Default integration: claude. No branch-creating git extension is installed, so feature creation never switches branches.
- Spec Kit `bug` extension installed (`speckit-bug-assess`, `-fix`, `-test`).
- `.specify/memory/constitution.md` v1.0.0: eight principles (owner decides; teaching theory first; learner data never lost; honest states; consent before cost; interface follows DESIGN.md; boundaries/tenancy/sandboxing; performance does not regress), stack constraints, workflow gates, governance.
- `AGENTS.md`: new "Features and the constitution" section pointing to the constitution, `speckit-feature`, `speckit-bug-assess`, DESIGN.md and the required UI skills.
- `CLAUDE.md` created with `@AGENTS.md`, so Claude Code loads the same rules as Codex.
- Global skills installed for Claude Code and Codex: `vercel-react-best-practices` (vercel-labs/agent-skills) and `accessibility` (addyosmani/web-quality-skills). Files in `~/.agents/skills/`, linked from `~/.claude-gw/skills/` (by the installer) and `~/.claude/skills/` (added by hand; the managed agent-config sync may not know about them). Both contain only SKILL.md and references, no scripts.

## Owner decisions

- Keyboard focus is always visible.
- DESIGN.md is the single UI source; stale docs yield to it.
- Permanent no-regression performance budget (5% on initial JS, cold sidebar readiness, startup).
- Required UI skills: `shadcn` (build), `impeccable` and `web-design-guidelines` (check). `frontend-design` and `ui-ux-pro-max` stay optional.
- Install: vercel-react-best-practices, accessibility, Spec Kit bug extension. Not installed: Spec Kit `assess`.

## Skills audit

Already installed and relevant: shadcn, impeccable, web-design-guidelines, tailwind-design-system, frontend-design, ui-ux-pro-max, tdd, diagnosing-bugs, domain-modeling, grill-with-docs, writing-for-agents, unslop, sol-loop, speckit-feature, obsidian-markdown, obsidian-cli, bagent-browser.

Online candidates not installed:

| Candidate | Why not now |
|---|---|
| vercel-composition-patterns | Maybe; useful for composer/dock refactors |
| clerk/skills clerk-nextjs-patterns | Only when hosted auth work starts |
| microsoft/playwright-cli | Overlaps puppeteer scripts and bagent-browser |
| jwynia electron-best-practices | Single author, Socket audit warned; read before use |
| wshobson rag-implementation | Leans on hosted vector DBs; reference for notes sync |
| agent-tutor-skill | Tiny repo; read as FSRS/mastery reference with ts-fsrs |
| next-best-practices, ai-sdk, ai-elements, webapp-testing | Retired, unused stack, or duplicate |
| Spec Kit github / qa / verify / claude-ask-questions | Externally visible, unverified or Claude-only |
| Spec Kit agent-context, worktree(s) | Would rewrite AGENTS.md or run `git worktree add` |

No reputable learning-science skill exists; use FSRS papers and ts-fsrs when the learner model is designed.

## Verification

- `specify init` was trial-run in a scratch repo first: it creates only the three directories and leaves AGENTS.md/CLAUDE.md alone. Scratch repo deleted.
- `.specify/integration.json` lists claude and codex. `.specify/extensions.yml` lists `bug`. Speckit skills present in both `.claude/skills` and `.agents/skills`.
- None of the new files are git-ignored. Nothing committed or pushed.

## Remaining

- TODO(PERF_BASELINE) in the constitution: fill in once `.scratch/performance-ui/plan.md` records final numbers.
- Code vs DESIGN.md conflicts to decide: sidebar group hairline (`components/sidebar.tsx:585`); monospace on names in delete dialogs and "I don't know" text.
- The other thread (t3-thread 2bdfedc6) also edits AGENTS.md; the new section is appended at the end.

## Stale docs removed (2026-10-27, Oliver chose option 1)

- Deleted `docs/plan.md` (2026-08 build plan), `docs/release-0.3.md` (historical release notes), `docs/archive/architecture-2026-09-08.md`. Links to them removed from `docs/architecture.md`, `docs/development.md`, `components/artifacts/index.ts`, `src/core/contracts/jobs.ts`.
- Rewrote stale passages to match DESIGN.md: graphite palette and Options popup in `docs/architecture.md`, `docs/development.md`, `docs/ui-review.md`; "Tab is dead" and the unstyled focus ring in `docs/keyboard.md`; matching comments in `components/enter-submits.ts`, `components/keyboard-shortcuts.tsx`, `src/core/question-core.ts` (reading-thinking field).
- Kept: vision, teaching-methodology, and the design records code still cites (pi-engine-swap, probe-teach-split, compaction-accounting, tool-content-recovery, enriched-markdown-research, hosting, desktop-release).
- `npx tsc --noEmit` passes. Deletions are staged (`git rm`); nothing committed.
- Not done: `docs/vision.md` links to a missing `vision-extensibility.md`.
