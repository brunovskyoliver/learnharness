# Starter prompts on new sessions

## Findings

- `components/new-session.tsx:176`: the composer offers only "What do you want to learn?" / "What do you want to practice?".
- The graph contract has no mastery, review or due data (`src/core/contracts/graph.ts` `GraphNode`: name, statement, aliases, createdAt, provenance). "Weak" or "due" topics cannot be derived without new data.
- Available today: recent sessions (sidebar summaries with titles), graph nodes with `createdAt`, chains, and the session list per node via provenance.

## Proposed change

- Up to four chips above the composer when the draft is empty, built from data that already exists. Tapping a chip fills the composer (does not send), so the learner can edit first.

## Decisions (Oliver, 2026-10-27)

- Up to four chips from the most recently created graph topics: "Go deeper: <name>" (lesson) or "Practice: <name>" (practice). Tapping fills the composer; the learner presses Send.
- Empty graph: lesson "How does gradient descent work?", "Explain Bayes' theorem with an example", "What is Kant's categorical imperative?"; practice "Practice derivatives", "Practice probability basics", "Practice logic proofs".

## Verification

- Unit tests for chip selection with empty, small and large graphs; browser at 1440/390/320px; keyboard reachable; chips disappear when typing.
