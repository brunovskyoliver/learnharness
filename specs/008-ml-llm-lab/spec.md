# Feature Specification: ML and LLM learning lab

**Feature Branch**: `claude/confident-edison-h092l5`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Feature 008: ML/LLM learning lab. Owner (Oliver) is learning machine learning, AI and LLMs. Three parts in one feature, owner request 2026-10-28: (A) new demo-kit visualization panels the teacher/practice agents can fill: attention/matrix heatmap (values on hover; attention weights, weight matrices, confusion matrices), token strip (text split into colored tokens with ids) backed by a real deterministic tokenizer tool (never invented splits), next-token probability bars with temperature / top-k / top-p sliders (sampling intuition), embedding scatter in 2D/3D with labels (vector arithmetic like king − man + woman), network view (layers and neurons with weight-colored edges, stepping forward/backward pass), tensor shape tracer (shapes through a transformer block e.g. (batch, tokens, width)). (B) Hugging Face Hub as a second server in the feature-007 MCP client layer: search papers/models/datasets, read model cards and config.json so lessons cite real numbers (layers, hidden size, heads, vocab, parameter counts). (C) arXiv / Semantic Scholar paper lookup feeding the existing PDF reading so explanations cite the original paper's pages (MCP or plain HTTP to be decided in research). Context: existing demo kit panels chart/plot3d/flow/table/readouts/note (src/demo-kit), quick plot tool (005), research subagent with web search, pdf_read tool, MCP client layer with fixed server list (src/agent/mcp/servers.ts, 007). Owner asked for designs (canvas) and the Spec Kit chain through analyze; implementation will be done later by another agent, so NO code in this feature's branch now."

## Clarifications

### Session 2026-10-28 (Oliver, numbered questions)

- Q: How do the agents produce the new panels? → A: **Both routes.** The same panel types are available as (1) one inline tool that renders a single panel in the same reply, checked in the headless browser like quick plots (feature 005), and (2) panel types in the demo kit that the background demo builder can compose into multi-panel demos.
- Q: What about numbers no real model computed (next-token probabilities, embeddings, attention)? → A: **Labelled illustrative.** The agent may write illustrative values, but those panels always carry the label "Illustrative numbers". Values that are computed (tokenizer output, a network's forward and backward pass computed by the panel) or fetched (Hugging Face configs) are shown without that label.
- Q: Which tokenizers? → A: **OpenAI encodings and GPT-2.** o200k (GPT-4o and later), cl100k (GPT-4, GPT-3.5) and GPT-2's BPE, run on the LearnHarness server. Oliver asked whether this needs compute. It doesn't: tokenizing is a lookup over a fixed vocabulary, a few milliseconds of ordinary CPU, with no model and no GPU. The new runtime dependency this needs is approved with this answer ("go with the recommended option"). Its startup cost must still be measured (Principle VIII).
- Q: How does LearnHarness access Hugging Face? → A: **Anonymous only.** No token and no setting. If Hugging Face limits or refuses anonymous calls, lookups fail honestly. A token field would be a later spec.
- Q: Should the agent read paper PDFs automatically? → A: **Automatically, within a cap.** Open-access PDFs may be read without asking, up to a cap per turn. Each read shows as a visible row, and citations link to the page.
- Q: Which agents get the Hugging Face and paper tools? → A: **Teacher and researcher.** Practice gets the visual panels but not the lookups.
- Q: Page cap? → A: **10 pages per turn** per agent. Past the cap, the agent says which pages it skipped.

### Session 2026-10-28 (speckit-clarify)

- Q: Can the learner type their own text into the token strip and re-tokenize it? → A: **Yes, editable text.** The strip has a text field. Edits re-split live, after a short pause, through the server tokenizer, with no model call.
- Q: What are the three Settings → Agent toggles called? → A: **ML visuals** ("Shows tokens, attention, sampling, networks and shapes as interactive panels"), **Model hub** ("Looks up model configs, datasets and papers on Hugging Face") and **Papers** ("Finds papers on arXiv and Semantic Scholar and cites their pages").
- Q: What exact words label agent-written numbers? → A: **"Illustrative numbers"**, as muted meta text in the panel header, never amber.
- Q: Which size and call limits apply? → A: **The proposed ones.** Heatmap ≤ 64×64 cells; token text ≤ 2,000 characters; next-token bars ≤ 30 tokens; embedding scatter ≤ 200 points; network view ≤ 5 layers × 8 neurons; shape tracer ≤ 24 steps. Per turn per agent: 5 Hub lookups, 5 paper searches, 10 PDF pages. Going over is refused with the limit stated, never silently cut.
- Q: What wording do the lookup rows use? → A: **Source · what.** "Hugging Face · gpt2 config", "Hugging Face · 3 models for 'tiny llama'", "arXiv · Attention Is All You Need", "Semantic Scholar · 4 papers for 'LoRA'", "Read · Attention Is All You Need · pp. 3–5". Failures: "Hugging Face · lookup failed", "Papers · search failed", "Read · failed".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See how text becomes tokens (Priority: P1)

While learning how LLMs read text, the learner asks "how does GPT-4o split 'unbelievably tokenized'?". The teacher calls the tokenizer and shows a token strip in the same reply: the text split into coloured chips, each with its token id, the encoding named, and the token count. The learner can switch the same text between the encodings to compare them. Every split is the tokenizer's real output, never the model's guess.

**Why this priority**: Tokenization is the first thing to understand about LLMs. It's the one panel backed entirely by real computation, so it proves the inline route and the real-versus-illustrative rule end to end.

**Independent Test**: In a review lesson, call the tokenizer on a fixed string with each encoding. The strip shows exactly the ids and splits the reference tokenizer produces. Switching encoding re-splits without a new model call.

**Acceptance Scenarios**:

1. **Given** a lesson, **When** the teacher shows a token strip for a text and encoding, **Then** the reply contains the strip with every token, its id, the encoding name and the token count, and the values equal the reference tokenizer's output.
2. **Given** the strip is shown, **When** the learner switches encoding or edits the text, **Then** the strip shows the new split (after a short pause for typing), with no model call.
3. **Given** text with spaces, line breaks, emoji or non-Latin script, **Then** whitespace is visible inside its chip and multi-byte pieces are shown honestly (for example as a byte marker), never dropped.
4. **Given** text longer than the limit, **Then** the tool refuses with the limit stated, and the agent can shorten it.

---

### User Story 2 - Watch sampling and attention (Priority: P1)

The learner studies how a model picks the next token. The teacher shows next-token probability bars for a prompt, labelled "Illustrative numbers", with temperature, top-k and top-p sliders. Moving temperature reshapes the distribution live. Top-k and top-p grey out the tokens they cut, and a sample button draws a token from what remains. For attention, the teacher shows a heatmap of attention weights between the prompt's tokens. The learner hovers or focuses a cell to read its exact value, with the row and column labels highlighted.

**Why this priority**: Sampling and attention are the two LLM ideas that are hardest to grasp from prose and easiest from a live picture.

**Independent Test**: Render each panel from fixed data. Moving a slider changes the bars as computed from the stated logits. Top-k = 3 leaves exactly three active bars. Each heatmap cell exposes its value to hover, keyboard focus and screen readers. Both panels show the illustrative label when their data is agent-written.

**Acceptance Scenarios**:

1. **Given** next-token bars from given logits, **When** the learner changes temperature, **Then** the probabilities are recomputed from those logits and still sum to 100%.
2. **Given** top-k or top-p is set, **Then** the cut tokens are visibly excluded, the remaining probabilities are renormalised, and the sample button draws only from them.
3. **Given** a heatmap, **When** the learner hovers or focuses a cell, **Then** its row label, column label and exact value are shown, and the colour scale has a legend with its range.
4. **Given** the panel's numbers were written by the agent, **Then** "Illustrative numbers" is visible on the panel. It never appears on computed or fetched values.

---

### User Story 3 - Step through a small network, embeddings and shapes (Priority: P2)

The learner studies backpropagation. The teacher shows a network view: a small network (inputs, hidden layers, outputs) with edges coloured by weight. The learner steps the forward pass layer by layer and sees each neuron's value, then steps the backward pass and sees each gradient. The panel computes these values itself from the given weights and inputs. When the learner studies embeddings, an embedding scatter places labelled words in 2D or 3D and can draw a vector-arithmetic arrow (king − man + woman → nearest point). When the learner studies the transformer block, the shape tracer shows a tensor's shape at each step, for example (batch, tokens, width) → (batch, heads, tokens, head width), with the dimension that changed highlighted.

**Why this priority**: These cover backprop, embeddings and transformer plumbing, the core of an ML curriculum. They come after story 1 and 2 because they are larger panels.

**Independent Test**: For a fixed 2-3-1 network with given weights, the forward and backward values shown match a reference computation to 4 significant digits. A scatter with an arithmetic expression draws the arrow to the stated nearest label. A shape trace shows each step's shape in order, with the changed dimension marked.

**Acceptance Scenarios**:

1. **Given** a network with weights, inputs, an activation and a loss, **When** the learner steps forward and then backward, **Then** each step reveals one layer's values or gradients, computed by the panel, and the step can be undone.
2. **Given** an embedding scatter with points and an arithmetic expression, **Then** the result vector and its nearest labelled point are shown, and every point's label stays readable (labels may hide on overlap and show on hover or focus).
3. **Given** a shape trace, **Then** each step shows the operation name and the resulting shape, and the dimension that changed is highlighted in words, not colour alone.

---

### User Story 4 - Lessons cite real model numbers (Priority: P2)

When the teacher says "GPT-2 small has 12 layers and a hidden width of 768", it looks the model up on Hugging Face first and cites it. The transcript shows a quiet lookup row ("Hugging Face · openai-community/gpt2 · config"), expandable to the fields used and a link to the model page. The teacher can also search models, datasets and papers on the Hub. The background research job can use the same lookups in its reports.

**Why this priority**: The learner trusts the numbers in a lesson. Real configs replace remembered ones. This story depends on the MCP layer from feature 007 and a live service, so it follows the offline panels.

**Independent Test**: With a stubbed Hub server, ask for a model's architecture. The reply's numbers equal the stubbed config's values, and the transcript shows the lookup row with those fields. With the server unreachable, the teacher says the lookup failed and doesn't state the numbers as checked.

**Acceptance Scenarios**:

1. **Given** the teacher states a model's architecture numbers, **Then** a Hub lookup ran in the same turn, and the lookup row shows the source fields and a link to the model page.
2. **Given** a model search, **Then** the results row lists the models found (name, task, downloads) and is expandable.
3. **Given** Hugging Face is unreachable or rate-limits anonymous use, **Then** the row reads as a failure in plain words, and the teacher doesn't present remembered numbers as looked up.
4. **Given** a background research job, **Then** it can use the same lookups, and its brief cites the Hub page.

---

### User Story 5 - Explanations cite the original paper's pages (Priority: P3)

When the teacher explains scaled dot-product attention, it finds "Attention Is All You Need" through arXiv or Semantic Scholar, reads the relevant pages of the open-access PDF (up to 10 pages per turn), and cites them ("Vaswani et al., 2017, p. 4"), with a link that opens the paper at that page. The transcript shows a search row and a read row ("Read · Attention Is All You Need · pp. 3–5").

**Why this priority**: Citing the source deepens a lesson but isn't needed to teach it. It depends on the most external services.

**Independent Test**: With stubbed paper search and a fixture PDF, ask about a paper's method. The reply cites page numbers that exist in the fixture and contain the cited content. The read row shows the pages read. An 11th page in the same turn is refused with the cap stated.

**Acceptance Scenarios**:

1. **Given** a paper search, **Then** the row lists title, authors, year and source (arXiv id or Semantic Scholar id), plus whether an open-access PDF exists.
2. **Given** an open-access PDF, **When** the teacher reads pages, **Then** the read row lists the pages, and citations in the reply link to the paper at those pages.
3. **Given** the cap of 10 pages per turn is reached, **Then** further reads are refused with the cap stated, and the agent says which pages it skipped.
4. **Given** a paper with no open-access PDF, **Then** the agent works from the abstract and says the full text wasn't available.

---

### User Story 6 - Composed ML demos (Priority: P3)

For a larger idea, the teacher asks the background demo builder for a demo that combines panels, for example a token strip linked to an attention heatmap over the same tokens, plus a temperature slider driving next-token bars. The demo opens in the workspace like other demos.

**Why this priority**: Composition reuses the panels from stories 1–3, so it adds little once they exist.

**Independent Test**: A demo-kit spec with two linked new panels renders, passes the kit's self-test, and keeps parameter values through theme changes and presentation switches.

**Acceptance Scenarios**:

1. **Given** a demo-kit spec using the new panel types, **Then** it validates, renders in the sandbox, and passes the headless check.
2. **Given** two panels share the same tokens, **When** the learner focuses a token in one, **Then** the other highlights the same token.

### Edge Cases

- **Invalid panel data**: mismatched lengths (labels versus matrix size), non-finite numbers, empty data or oversized inputs are refused with a reason the agent can act on. Nothing unchecked is shown (Principle IV).
- **Size limits**: each panel has a maximum size, for example matrix cells, tokens, network neurons, scatter points and trace steps (see Assumptions). Over the limit is refused, never truncated silently.
- **Illustrative label**: it can't be removed by the agent when the panel's numbers are agent-written. Computed panels (token strip, network view) never carry it, because their values come from computation.
- **Answer hiding**: a panel posed alongside a question must not reveal that question's answer. The doctrine tells the agent this; the panels add no reveal state.
- **Learner's own text**: the tokenizer runs on the LearnHarness server only. No text leaves the server for tokenization.
- **What leaves the server**: Hub lookups send only model, dataset or paper names and search queries. Paper searches send only search terms. Never learner prose, answers or thinking.
- **Hosted tenants**: Hub and paper connections and any caches are tenant-scoped, with no shared history.
- **Rate limits**: anonymous Hub use and arXiv's and Semantic Scholar's public limits can refuse calls. Each refusal is an honest failure row, and the turn continues.
- **Stop**: in-flight lookups and reads are cancelled with the turn.
- **Reduced motion**: panel animations (stepping, slider transitions) keep the state change without the motion.
- **Small screens**: every panel works at 320, 390 and 1440 px with no page overflow. Large heatmaps and strips scroll inside their frame, with hidden scrollbars and keyboard access.
- **Theme**: panels follow the demo theme bridge. Data colours stay legible in light and dark demo backgrounds.

## Requirements *(mandatory)*

### Functional Requirements

**Panels (part A)**

- **FR-001**: The demo kit MUST gain six panel types: heatmap, token strip, next-token bars, embedding scatter, network view and shape tracer, each with a validated data shape and size limits.
- **FR-002**: One inline tool MUST let the teacher and the practice agent render any one of these panels in the same reply. Like quick plots, the result is validated, rendered and checked in the headless browser before it shows, and it becomes a demo in the transcript (card, workspace, expand, download). A failed check returns the reason to the agent and shows only a quiet tool row.
- **FR-003**: The background demo builder MUST be able to use the six panel types in composed demos. Panels in one demo that share the same tokens or labels MUST highlight together on hover and focus.
- **FR-004**: The token strip MUST get its tokens from the tokenizer tool (FR-007), never from text the agent writes. The strip shows each token as a chip with its id, makes whitespace visible, names the encoding and shows the count. It switches between the supported encodings, and the learner can edit the text. Edits re-tokenize through the server tokenizer after a short pause, with no model call. The learner's edited text stays local to that panel and is not sent to any model.
- **FR-005**: The next-token bars MUST take tokens with logits (or probabilities). They MUST recompute the shown distribution from those values for temperature, top-k and top-p, renormalise after cuts, mark cut tokens as excluded in text and visually, and provide a sample action that draws only from the remaining tokens.
- **FR-006**: The heatmap MUST show row and column labels, a colour-scale legend with its numeric range, and each cell's exact value on hover, on keyboard focus and to screen readers. It MUST support a diverging scale (for signed weights) and a sequential scale (for probabilities and counts).
- **FR-007**: A tokenizer tool MUST tokenize text with o200k, cl100k or GPT-2's BPE on the LearnHarness server and return the tokens, ids and count. Its output MUST equal the reference tokenizer's for the same text and encoding.
- **FR-008**: The embedding scatter MUST place labelled points in 2D or 3D, optionally draw one vector-arithmetic expression over named points, and show the result's nearest point by a stated distance (cosine or Euclidean, named on the panel).
- **FR-009**: The network view MUST take layer sizes, weights, biases, inputs, an activation, a target and a loss. It MUST compute the forward and backward pass itself and step through them one layer at a time, forwards and backwards, showing values and gradients and colouring edges by weight. Step controls are buttons with names and keyboard access.
- **FR-010**: The shape tracer MUST show an ordered list of steps (operation and resulting shape with named dimensions). It MUST highlight the dimensions that changed from the previous step in text, not colour alone.
- **FR-011**: Panels whose numbers the agent wrote (next-token bars, heatmap, embedding scatter) MUST always show the label "Illustrative numbers". Computed panels (token strip, network view) and the shape tracer, whose shapes the agent states as structure rather than measurements, MUST NOT carry it. A heatmap or scatter built from fetched or computed data in a later feature may drop the label only through its own spec.

**Hugging Face Hub (part B)**

- **FR-012**: Hugging Face's MCP server MUST be added to the fixed server list from feature 007, used anonymously, with no token and no setting.
- **FR-013**: The teacher and the researcher MUST get Hub lookups: search models, datasets and papers on the Hub, and read a model's card and configuration. Which Hub tools are exposed, and in what form (raw MCP tools or LearnHarness-shaped tools), is decided in planning, following 007's rule that agents see only what the spec exposes.
- **FR-014**: Every Hub lookup MUST appear in the transcript as one quiet row in the tool-row register, on the reading edge: "Hugging Face · {what}" (for example "Hugging Face · gpt2 config", "Hugging Face · 3 models for 'tiny llama'"), expandable to the fields used and a link to the Hub page. Failures read "Hugging Face · lookup failed", with the reason in the expanded panel.
- **FR-015**: The teacher doctrine MUST say to look up a model's numbers before stating them as fact and to cite the Hub page. When the lookup fails, it says so instead of presenting remembered numbers as looked up.

**Papers (part C)**

- **FR-016**: The teacher and the researcher MUST be able to search papers on arXiv and Semantic Scholar (title, authors, year, ids, abstract, open-access PDF link). Whether this goes through an MCP server or plain HTTPS is decided in planning.
- **FR-017**: The teacher and the researcher MUST be able to read pages of an open-access paper PDF automatically, up to 10 pages per turn per agent. Reads over the cap are refused with the cap stated.
- **FR-018**: Each paper search and read MUST appear as a quiet row on the reading edge, named by source: "arXiv · {title}" or "Semantic Scholar · {n} papers for '{query}'" for searches, and "Read · {title} · pp. {pages}" for reads. Each row expands to the results or the pages read, with links that open the paper at the cited page. Failures read "Papers · search failed" or "Read · failed", with the reason in the expanded panel.
- **FR-019**: Citations in replies MUST name the paper and page, and link to that page.

**Shared**

- **FR-020**: Settings → Agent MUST gain three toggles, on by default, after Math check: "ML visuals" ("Shows tokens, attention, sampling, networks and shapes as interactive panels"; panels and tokenizer), "Model hub" ("Looks up model configs, datasets and papers on Hugging Face") and "Papers" ("Finds papers on arXiv and Semantic Scholar and cites their pages"). Turning one off removes its tools from every agent.
- **FR-021**: All external lookups MUST carry the turn's abort signal and a timeout, and they MUST fail honestly (Principle IV). In hosted mode they are tenant-scoped (Principle VII).
- **FR-022**: Only names, ids and search terms MUST leave the server for lookups. Learner prose, answers and thinking MUST NOT.
- **FR-023**: Every new UI element MUST follow DESIGN.md and the feature's design canvas, work at 320, 390 and 1440 px, be fully usable by keyboard, respect reduced motion and keep scrollbars hidden.
- **FR-024**: Initial JavaScript, sidebar readiness and startup MUST stay within the 5% budget (Principle VIII). The tokenizer and the lookup clients are server-only, and the panel code loads with the demo kit, not at app startup.
- **FR-025**: Per-turn limits MUST apply to Hub lookups and paper searches (see Assumptions), with refusals the agent can see.

### Key Entities

- **Panel spec**: one of the six panel types with its validated data, an optional title and caption, and whether its numbers are illustrative.
- **Token sequence**: the text, the encoding, and the ordered tokens (id, text or bytes).
- **Hub lookup**: what was asked (search or model read), the fields returned and used, the Hub link, and the outcome.
- **Paper record**: the title, authors, year, arXiv or Semantic Scholar id, abstract, and an open-access PDF link if one exists.
- **Paper read**: the paper, the pages read, and the turn's page count against the cap.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 20 reference strings (including whitespace, emoji and non-Latin script) across the three encodings, the token strip's ids match the reference tokenizer 60 out of 60 times.
- **SC-002**: For the reference 2-3-1 network, the forward and backward values match a hand-checked computation to 4 significant digits at every step.
- **SC-003**: Next-token probabilities sum to 100% (±0.1) at every slider position tried. Top-k = k leaves exactly k active tokens.
- **SC-004**: Each of the six panels renders, passes the headless check, and shows no page overflow at 320, 390 and 1440 px.
- **SC-005**: No panel with agent-written numbers appears without "Illustrative numbers". No computed panel shows it.
- **SC-006**: With Hugging Face, arXiv and Semantic Scholar all unreachable, lessons continue with one-line notices, and no turn fails because of a lookup.
- **SC-007**: An inline panel appears in the reply within about 3 seconds of the tool call in the normal case (the quick plot check takes about 1.5 s).
- **SC-008**: Startup and initial JavaScript stay within the 5% budget.
- **SC-009**: Tests run without network or model requests, using stubbed lookup servers and fixture PDFs.

## Assumptions

- Hugging Face's MCP server (hf.co/mcp) accepts anonymous connections with a default tool set, per Hugging Face's announcement. This environment's network couldn't reach it on 2026-10-28. Planning MUST include a live probe (as in 007) before implementation, and adjust which tools are exposed to what the server actually offers anonymously.
- arXiv's API and Semantic Scholar's public API are free with shared, unauthenticated rate limits. Exact limits and terms are confirmed in the live probe.
- Size and per-turn limits are as clarified (Session 2026-10-28, speckit-clarify). Paper reads are capped by pages (10 per turn per agent), not by calls.
- Hosted and desktop both get the feature, as in 007.
- A real model running in the browser (for real logits, attention or embeddings), a Hugging Face token, and in-browser Python are out of scope. They are later specs.
- The practice agent gets the panels and the tokenizer, not the lookups.
