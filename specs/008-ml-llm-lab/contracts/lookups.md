# Contract: Hugging Face and paper lookups

Teacher and researcher only. `hub_search` and `hub_model` sit under "Model hub" (`model_hub`); `paper_search` and `paper_read` sit under "Papers" (`papers`). Tool descriptions are drafts that need owner approval in the PR.

## `hub_search`

- Input: `{ kind: "models" | "datasets" | "papers", query: string 1–100, limit?: 1–10 (default 5) }`.
- Route: MCP `huggingface` server, search tool per T002's probe. Fallback: Hub REST `/api/{models|datasets}?search=` (Decision log).
- Model text: a numbered list of `id · task · downloads` (models), `id · downloads` (datasets) or `title · arXiv id` (papers).
- Details: `HubLookup` (search). Row: "Hugging Face · {n} {kind} for '{query}'" ("Hugging Face · 3 models for 'tiny llama'").
- Draft description: "Search the Hugging Face Hub for models, datasets or papers by name or topic. Only the query leaves the server. At most 5 Hub lookups per turn."

## `hub_model`

- Input: `{ repo: string matching ^[\w.-]+(/[\w.-]+)?$ }`.
- Route: `config.json` over HTTPS, plus a card summary over MCP when available.
- Model text: `repo`, then each whitelisted field as `label (key): value`, then the parameter count if known, then the URL.
- Details: `HubLookup` (model). Row: "Hugging Face · {short repo} config" ("Hugging Face · gpt2 config").
- Draft description: "Read a model's configuration and card on the Hugging Face Hub before you state its architecture numbers (layers, hidden size, heads, vocabulary, context length, parameter count). Cite the Hub page. If the lookup fails, say so and don't present remembered numbers as looked up."

## `paper_search`

- Input: `{ query: string 1–200, limit?: 1–10 (default 5) }`.
- Route: Semantic Scholar first, then arXiv.
- Details: `PaperSearch`. Row: "Semantic Scholar · {n} papers for '{query}'" or, for one exact title hit, "arXiv · {title}".
- Draft description: "Find research papers on Semantic Scholar and arXiv: title, authors, year, ids, abstract, and whether an open-access PDF exists. Only the query leaves the server."

## `paper_read`

- Input: `{ paper: string (arXiv id like 1706.03762, or a pdfUrl from this turn's search), pages: string ("3-5", "4", "1,7") }`.
- Cap: at most 10 pages per turn. A request that would pass the cap reads none of its pages, and the refusal states the cap and how many pages are left.
- Model text: pages as `--- p. {n} ---\n{text}`, then a citation hint: `Cite as ({first author} et al., {year}, p. {n}) linking {url}#page={n}`.
- Details: `PaperRead`. Row: "Read · {title} · pp. {range}".
- Draft description: "Read pages of an open-access paper PDF so you can explain from the source and cite the page. At most 10 pages per turn: read the method or the figure you need, not the whole paper. If no open-access PDF exists, work from the abstract and say the full text wasn't available."

## Failures (all four)

These are error results in plain words (Principle IV). Rows read "Hugging Face · lookup failed", "Papers · search failed" or "Read · failed", in destructive ink, with the reason in the expanded panel in the interface font (not mono). Aborts follow the turn (`signal`). In hosted mode, connections and any cache are tenant-scoped.

## Rows (UI)

These rows use one shared component, `components/artifacts/lookup-row.tsx`, built on the same skeleton as `math-check-card.tsx`. See ui-contract.md.
