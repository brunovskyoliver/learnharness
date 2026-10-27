# Ideas: better learning, background visuals, synced notes

Written 2026-10-27 at Oliver's request. Suggestions only; nothing here is approved or implemented. Each idea notes what already exists so it builds on current code.

## What exists today

- Background agents: Researcher, Demo builder, Figure maker, PDF reader (`components/activity-dock.tsx`), plus graph extractor and auditor on the cheap tier.
- Demo kit and demo workspace; Mermaid diagrams in responses.
- Knowledge graph of propositions and reasoning chains, with provenance back to sessions. No mastery or review data on nodes (`src/core/contracts/graph.ts`).
- Quiz answers carry the learner's confidence (0–100) and a graded result (`src/core/question-core.ts`).
- Coverage ledger fingerprints teacher prose so nothing is extracted twice (`src/core/coverage.ts`).
- Notes import: one-time file upload that extracts nodes and chains into the graph (`components/notes-import.tsx`, `app/api/graph/import`). Notes are not kept, re-synced or used as session context.

## 1. Background visuals the learner can pull in

The teacher shouldn't stop the lesson to build a picture. A background job builds it while the learner reads, then offers it quietly: a "Diagram ready" chip next to the paragraph it explains. It never opens on its own.

### Kinds of view, matched to the content

| Content shape | View | Cost |
|---|---|---|
| Process, algorithm, cause → effect | Flow diagram (Mermaid) | Cheap model |
| Formula with parameters | Function plot with sliders (demo kit) | Demo builder |
| Two or more ideas that get confused | Side-by-side comparison table | Cheap model |
| Builds on earlier ideas | Graph neighbourhood: prerequisites and what this unlocks | No model, graph query |
| History, sequence | Timeline | Cheap model |
| Worked example | Step-through: one step per click, with the reason for each step | Cheap model |
| Misconception | "What you said vs. what's true" split view | Cheap model |
| Long session | Live session map: sections, key claims, open questions; click jumps to the turn | Cheap model, incremental |

The graph neighbourhood and session map are the best first steps. The first needs no model call and the second reuses the coverage ledger's incremental pattern.

### How to judge when a view is needed

Combine signals into a "visual need" score per teacher message or concept. Build in the background once it crosses a threshold, within a per-session budget.

Strong signals (one is enough):
- A wrong quiz answer at high confidence (≥ 75). That points to a misconception, so build the comparison view.
- Two wrong attempts on the same practice problem, or a hint request.
- The learner says they're lost: "I don't get it", "what do you mean", "can you show", or rephrases the same question.

Medium signals (need two):
- "I don't know" or low confidence (≤ 25) on a quiz.
- The learner scrolls back to the same paragraph or stays on it for a long time. The reading-position tracking already exists.
- The concept has come up in three or more sessions (graph provenance count) and is still asked about.
- The teacher's prose describes a structure that has a shape (steps, a cycle, a comparison, a quantity changing). A cheap classifier labels this after each teacher turn.

Damping:
- Skip if a visual of the same kind for the same concept already exists in this session or the graph. Reuse it.
- Cap background builds per session (e.g. 3) and show the cost in the activity dock as today.
- Feedback loop: if the learner never opens the offered views, raise the threshold for them. If they open most, lower it.

### Open questions

1. ~~Should views also be offered after the session (on graph nodes), or only inline in lessons?~~ Answered: both.
2. ~~Does the budget come from the cheap tier only, or may the Demo builder run automatically?~~ Answered: the Demo builder may run automatically, within the per-session cap.

## 2. A learner model: knowing what you know

Most ideas below need this. The data is already collected and just isn't aggregated.

- **Mastery per graph node.** Link each quiz and practice problem to the graph nodes it tests (the extractor already sees the session). Combine correctness and confidence into a per-node score.
- **Calibration.** You give a confidence on every quiz answer. A small chart of "you said 80%, you were right 55% of the time" is direct feedback no other app gives. Wrong answers at high confidence get marked as misconceptions on the node.
- **Spaced review.** Due dates per node (a simple FSRS-style schedule) from those results. Home and the new-session starter chips (ticket `chat-ux/04`) then get "Review due: …" chips, which "weak topics" couldn't do before.
- **Prerequisite gaps.** After a wrong answer, check the premises in the node's chains. If a premise has low mastery, the teacher offers a short detour to it instead of repeating the same explanation.

## 3. Synced notes, so the teacher understands you

Goal: your own notes become context the teacher reads, in your words, kept up to date without re-uploading.

### Sync

- Pick one or more local folders (Obsidian vault, markdown folder, exported Apple Notes) in settings. A background watcher re-indexes changed files by content hash, the same fingerprint idea as the coverage ledger. Include/exclude patterns per folder.
- Hosted mode can't watch your disk. Options: upload a folder (re-upload diffs by hash), or a small sync from the Electron app.
- Indexing chunks each note by heading, embeds it, and links chunks to graph nodes they mention. The existing import extraction can keep feeding the graph.

### Use in sessions

- Before each turn, retrieve the few most relevant note chunks and give them to the teacher with their source path.
- The teacher reuses your terms, examples and earlier explanations ("In your note *Bayes.md* you used the medical-test example; building on that…").
- The UI says what was used: a small "Used 2 notes" chip on the response that opens the snippets. Context is never added silently.
- Contradictions: if your note conflicts with the lesson, the teacher points it out instead of quietly overriding it.

### About-me note

- One editable note: background, goals, what you already know, how you like explanations (e.g. "examples before formulas", "short answers"). It goes into every session.
- The teacher may propose an edit ("You seem comfortable with linear algebra; add that?"). Nothing changes without your approval.

### Write-back (opt-in)

- Export session summaries, key claims and your corrected misconceptions as markdown into a separate folder in your vault. Your own notes are never edited.
- Graph nodes link to the notes that mention them, so the graph also becomes a map of your notes.

### Open questions

3. ~~Which note sources matter first?~~ Answered: markdown (`.md`) files first. Obsidian vaults are covered since they are md folders.
4. Should note retrieval run in hosted mode at all, or stay local/Electron only? Deferred: Oliver decides later.
5. ~~Write-back: wanted, and if so, into which folder?~~ Answered: yes, into a `learning_summary` folder.

## 4. Other ideas

- **Select text, then act.** Select any lesson text: "Explain simpler", "Visualize this", "Quiz me on this", "Add to my notes". This is the most direct way to ask for a view, alongside the automatic signals.
- **Pacing chips** under a lesson turn: "Slower", "Another example", "Skip ahead", "Go deeper". These feed the about-me note over time.
- **Explain it back.** At the end of a section, you explain the idea in two or three sentences and the teacher grades it against the graph node's statement. This catches understanding a multiple-choice quiz misses.
- **Session goal.** At the start, state or pick a goal; the session map tracks it; the end-of-session recap checks it.
- **End-of-session recap card.** Key claims, what you got wrong and why, what's due next. Built in the background as the session settles.
- **Daily review queue on home.** Due nodes from section 2, a few minutes each, practice-mode questions.
- **Source-grounded lessons.** When the PDF reader or Researcher feeds a lesson, claims carry page or URL citations shown inline.
- **Weekly digest.** Topics learned, calibration trend, misconceptions fixed, what's overdue.

## Suggested order

1. Graph neighbourhood view and select-text actions (no new data, quick wins).
2. Link questions to nodes, then mastery and calibration (unlocks review, gap detection, smarter starters).
3. About-me note, then synced notes with "Used N notes" transparency.
4. Visual-need scoring with background builds and the offer chip.
5. Session map, recap card, spaced review queue.
6. Write-back, explain-it-back, digest.

## Decisions (Oliver, 2026-10-27)

- Notes sync starts with markdown (`.md`) files.
- Hosted vs local-only notes: deferred.
- The Demo builder may run automatically for background visuals, within the per-session cap.
- Views are offered both inline in lessons and on graph nodes after the session.
- Write-back goes into a `learning_summary` folder; Oliver's own notes are never edited.
