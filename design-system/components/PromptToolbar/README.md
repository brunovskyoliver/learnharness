# PromptToolbar

Zone 4 of the prompt bar: model, thinking and usage on the left, one primary action on the right. Hand-written from `components/prompt-controls.tsx` and `components/stats-bar.tsx`.

- Triggers read in words: the model's name or "Choose a model", "Thinking: medium" or "Thinking". Never "—".
- Usage is the context ring plus a percentage, or "?" when the limit is unknown. Never 0%.
- With no provider key or no models, a setup button ("Add a provider key", "Set up your models") takes the triggers' place. Nothing floats over the transcript.
- Consumer provides: `controls` or `setup`, an optional `hint`, and exactly one action as `children`.
