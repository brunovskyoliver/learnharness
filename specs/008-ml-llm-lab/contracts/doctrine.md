# Contract: doctrine drafts (owner approval required in the PR)

Prompt wording is Oliver's to approve (Principle I). The implementer pastes these drafts verbatim. If the PR review changes them, the review wins.

## New: `src/agent/prompts/teacher/36-ml-lab.md`

> **ML panels and sources.** When a picture explains faster than prose, show it with `ml_visual`: tokens for how text is split, next_token for sampling, heatmap for attention or weights, scatter for embeddings, network for a forward and backward pass, shapes for how tensors change shape. Values you write in a heatmap, next_token or scatter panel are illustrative; say so in your text as well. Token splits and counts come only from `tokenize` or a tokens panel, never from memory. Never put the answer to a question you are about to pose into a panel.
>
> Before you state a real model's architecture numbers, read them with `hub_model` and cite the Hub page. When an idea comes from a paper, find it with `paper_search`, read only the pages you need with `paper_read` (at most 10 pages per turn), and cite the page you used: (Vaswani et al., 2017, p. 4). If a lookup fails, say so in one line and do not present remembered numbers or pages as looked up.

## Practice base (`src/agent/prompts/practice/00-base.md`), appended paragraph

> You may use `ml_visual` and `tokenize` to illustrate a problem's setting. A panel never shows the committed answer or a step of it while the problem is open.

## Researcher instructions (`src/agent/subagents/researcher.ts` INSTRUCTIONS), appended item

> 6. Model and paper sources: use `hub_model` for a model's configuration, and `paper_search` + `paper_read` for papers (10 pages per turn at most). Cite the Hub page or the paper page in the brief.
