# Brunovský's study

A learning application for guided lessons, practice, and a persistent knowledge graph.

The learner reads explanations, experiments with demos, and answers questions. The interface must keep the relevant explanation, visualization, and answer accessible together. Lessons and practice retain their existing question mechanics and saved history.

Primary surfaces: home and knowledge graph, chains, new lesson/practice, session transcript and questions, demo workspace, background activity, settings and setup. Hosted authentication and the Electron shell remain supported.

Local review examples are available through `npm run dev:review`. They cover lesson/demo exploration, a knowledge check, active practice and practice history. Existing data and edits are preserved; the examples are optional and do not seed hosted tenants. See [docs/ui-review.md](docs/ui-review.md).

The approved 2026-10-27 direction A uses a shared graphite theme, consistent sidebar icons and headers, an integrated composer with anchored Options, and searchable settings with grouped controls and a live reading preview. Reading preferences, lesson/practice mechanics and saved pane widths remain supported. Model configuration belongs behind Options. Legacy arbitrary HTML remains sandboxed and supports whole-demo expansion; individual graph focus requires the demo kit or an explicit adapter. Appearance updates preserve the live demo's parameters, simulation history and camera.
