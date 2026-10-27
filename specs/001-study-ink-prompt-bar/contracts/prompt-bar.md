# UI contract: prompt bar

Stable hooks other code and tests rely on. Kept unless noted.

- Test ids kept: `composer`, `dock-shell`, `question-dock`, `question-dock-bar`, `teach-check-reveal`, `lesson-question`, `confidence-segments`, `practice-dock`, `practice-dock-bar`, `practice-problem-content`, `practice-thinking-field`, `practice-send`, `next-problem-button`, `stats-bar`, `stats-model`, `stats-thinking`, `stats-summary`, `stats-context`, `stats-cost`, `setup-cta`, `setup-cta-keys`, `queued-steers`, `user-message`, `phase-divider-*`.
- New test ids: `turn-strip`, `answer-well`, `practice-skip`, `stats-usage-percent`.
- Accessible names: Send, Stop, Submit answer, Submit (practice, was "Submit thinking"), Next problem, Skip, Model selector, Thinking level, Collapse question/problem.
- Keyboard: unchanged (Enter, Shift+Enter, ⌘/Ctrl+Enter, Escape layering, ↑/↓ rows including "I don't know", ←/→ confidence, Tab rows↔thinking, Shift+Tab thinking cycle, ⌘K model menu).
- Events: Skip dispatches the same confirm as `lh:kbd-abort-turn` in problem mode.
