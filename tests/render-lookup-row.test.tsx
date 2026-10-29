import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { LookupRow } from "../components/artifacts/lookup-row.tsx";

const model = { kind: "model", repo: "openai-community/gpt2", url: "https://huggingface.co/openai-community/gpt2", fields: [{ label: "Layers", key: "n_layer", value: 12 }], ms: 1200 };
const paper = { title: "Attention Is All You Need", authors: ["Vaswani", "Shazeer", "Parmar", "Uszkoreit"], year: 2017, arxivId: "1706.03762", pdfUrl: "https://arxiv.org/pdf/1706.03762", url: "https://arxiv.org/abs/1706.03762" };
const render = (tool: string, output: unknown, extra: Record<string, unknown> = {}) => renderToStaticMarkup(<LookupRow part={{ type: `tool-${tool}`, state: "output-available", toolCallId: "lookup1", output, ...extra } as never} />);
const documentOf = (html: string) => parseHTML(html).document;

describe("LookupRow", () => {
	it("uses the identical math-check row skeleton and leaves details selectable", () => {
		const doc = documentOf(render("hub_model", model));
		assert.equal(doc.querySelector("details")?.className, "group lh-reading my-1");
		assert.equal(doc.querySelector("summary")?.className, "flex cursor-pointer select-none list-none items-center gap-2 text-sm text-muted-foreground [&::-webkit-details-marker]:hidden");
		assert.equal(doc.querySelector("details > div")?.className, "mt-2 space-y-2 rounded-xl border bg-card p-3 text-sm");
		assert.equal(doc.querySelectorAll(".select-none").length, 1);
		assert.ok(doc.querySelector("summary svg")?.classList.contains("size-3"));
		assert.ok(doc.querySelector("summary svg")?.classList.contains("opacity-50"));
	});
	it("uses the approved source headlines", () => {
		for (const [tool, output, expected] of [
			["hub_model", model, "Hugging Face · gpt2 config"],
			["hub_search", { kind: "search", what: "models", query: "tiny llama", results: Array(3).fill({ id: "tiny", url: "https://huggingface.co/tiny" }), ms: 1 }, "Hugging Face · 3 models for 'tiny llama'"],
			["paper_search", { source: "arxiv", query: paper.title, results: [paper], ms: 1 }, "arXiv · Attention Is All You Need"],
			["paper_search", { source: "semantic-scholar", query: "LoRA", results: Array(4).fill(paper), ms: 1 }, "Semantic Scholar · 4 papers for 'LoRA'"],
			["paper_read", { title: paper.title, paper: { arxivId: paper.arxivId, url: paper.pdfUrl }, pages: [3, 4, 5], pagesUsedThisTurn: 3, cap: 10, ms: 1 }, "Read · Attention Is All You Need · pp. 3–5"],
		] as const) assert.equal(documentOf(render(tool, output)).querySelector("summary span")?.textContent, expected);
	});
	it("shows failures in destructive ink with a sans reason", () => {
		for (const [tool, headline] of [["hub_search", "Hugging Face · lookup failed"], ["hub_model", "Hugging Face · lookup failed"], ["paper_search", "Papers · search failed"], ["paper_read", "Read · failed"]]) {
			const doc = documentOf(render(tool!, undefined, { state: "output-error", errorText: "The service is unavailable." }));
			assert.equal(doc.querySelector("summary span")?.textContent, headline);
			assert.ok(doc.querySelector("summary span")?.classList.contains("text-destructive"));
			assert.match(doc.querySelector("details")?.textContent ?? "", /The service is unavailable/);
			assert.equal(doc.querySelectorAll(".font-mono").length, 0);
		}
	});
	it("renders model labels and raw key values with safe ink links", () => {
		const html = render("hub_model", model), doc = documentOf(html);
		assert.match(html, /Layers/); assert.match(html, /n_layer 12/); assert.match(html, /font-mono text-xs/);
		assert.match(html, /grid-cols-2/); assert.match(html, /Took 1\.2 s/);
		const link = doc.querySelector("a")!;
		assert.equal(link.textContent, "Open on Hugging Face");
		assert.equal(link.getAttribute("target"), "_blank");assert.equal(link.getAttribute("rel"), "noreferrer");
		assert.ok(link.classList.contains("decoration-foreground/40"));assert.match(link.getAttribute("aria-label")!, /Hugging Face/);
		assert.ok(!html.includes("amber"));
	});
	it("shows author metadata and individual paper page links", () => {
		const search = render("paper_search", { source: "arxiv", query: paper.title, results: [paper], ms: 1 });
		assert.match(search, /Vaswani, Shazeer, Parmar et al\./);assert.match(search, /Open-access PDF/);
		const read = documentOf(render("paper_read", { title: paper.title, paper: { url: paper.pdfUrl }, pages: [3, 4, 5], pagesUsedThisTurn: 3, cap: 10, ms: 1 }));
		assert.deepEqual([...read.querySelectorAll("a")].map(a=>a.getAttribute("href")), [3,4,5].map(page=>`${paper.pdfUrl}#page=${page}`));
		assert.match(read.documentElement.textContent ?? "", /3 of 10 pages this turn/);
	});
});


it("uses the approved arXiv count headline for zero or multiple results", () => {
	for (const count of [0, 2]) {
		const doc = documentOf(render("paper_search", { source: "arxiv", query: "LoRA", results: Array(count).fill(paper), ms: 1 }));
		assert.equal(doc.querySelector("summary span")?.textContent, `arXiv · ${count} papers for 'LoRA'`);
	}
});

it("uses raw tokenizer names and the existing Input/Output expanded content", () => {
	for (const encoding of ["o200k", "cl100k", "gpt2"]) {
		const output = { encoding, count: 1, tokens: [{ id: 15339, text: "hello" }] };
		const doc = documentOf(render("tokenize", output, { input: { text: "hello", encoding } }));
		assert.equal(doc.querySelector("summary span")?.textContent, `Tokenized · 1 tokens (${encoding})`);
		assert.match(doc.querySelector("details > div")?.textContent ?? "", /Input/);
		assert.match(doc.querySelector("details > div")?.textContent ?? "", /Output/);
		assert.deepEqual([...doc.querySelectorAll("pre")].map(el => JSON.parse(el.textContent!)), [{ text: "hello", encoding }, output]);
	}
});

it("reuses the generic row for failed or unfinished tokenization", () => {
	for (const extra of [{ state: "output-error", errorText: "Unavailable" }, { state: "input-available" }]) {
		const doc = documentOf(render("tokenize", undefined, extra));
		assert.equal(doc.querySelector("details")?.getAttribute("data-testid"), "tool-call-card");
		assert.equal(doc.querySelector("summary span")?.textContent, "tokenize");
	}
});

import { Chat } from "../components/chat.tsx";
import { ServerEventsProvider } from "../components/server-events.tsx";
import type { LhMessage } from "../src/core/index.ts";

function failedTranscript(tool: string, error: string): string {
	const messages = [
		{ id: "u1", role: "user", content: "Look up this source", timestamp: 1 },
		{ id: "a1", role: "assistant", content: [{ type: "toolCall", id: "lookup1", name: tool, arguments: { query: "attention" } }], timestamp: 2 },
		{ id: "r1", role: "toolResult", toolCallId: "lookup1", toolName: tool, content: [{ type: "text", text: error }], isError: true, timestamp: 3 },
	] as LhMessage[];
	return renderToStaticMarkup(<ServerEventsProvider><Chat chatId="lookup-test" title="Lookup" initialMessages={messages} /></ServerEventsProvider>);
}

it("shows unavailable lookup failures in the transcript while invalid inputs retain retry behavior", () => {
	for (const [tool, headline] of [["hub_search", "Hugging Face · lookup failed"], ["hub_model", "Hugging Face · lookup failed"], ["paper_search", "Papers · search failed"], ["paper_read", "Read · failed"]]) {
		const failed = failedTranscript(tool!, "The service is unavailable.");
		assert.ok(failed.includes(headline!));
		assert.ok(!failed.includes('data-testid="tool-retry"'));
		assert.ok(failedTranscript(tool!, `Invalid tool input for tool "${tool}": missing query`).includes('data-testid="tool-retry"'));
	}
	assert.ok(failedTranscript("tokenize", "The tokenizer is unavailable.").includes('data-testid="tool-call-card"'));
});

it("preserves rounded Hub download counts as supplied", () => {
	const html = render("hub_search", { kind: "search", what: "models", query: "gpt2", results: [{ id: "gpt2", downloads: "24.1M", url: "https://huggingface.co/gpt2" }], ms: 1 });
	assert.match(html, /24\.1M/);
	assert.doesNotMatch(html, /24,100,000/);
});

it("shows failed ML panel checks as quiet tool rows while malformed inputs retain retry behavior", () => {
	const failed = failedTranscript("ml_visual", "The panel failed its check and was not shown:\n- invalid evaluated values");
	assert.ok(failed.includes('data-testid="tool-call-card"'));
	assert.ok(!failed.includes('data-testid="tool-retry"'));
	assert.ok(!failed.includes('data-testid="demo-iframe"'));
	assert.ok(failedTranscript("ml_visual", 'Invalid tool input for tool "ml_visual": missing data').includes('data-testid="tool-retry"'));
});

it("shows the exact optional parameter count in the existing model field grid", () => {
	for (const params of [0, 124439808]) {
		const doc = documentOf(render("hub_model", { ...model, params }));
		const grid = doc.querySelector(".grid")!;
		assert.match(grid.textContent!, /Parameters/);
		assert.ok([...grid.querySelectorAll(".font-mono")].some(node => node.textContent === `safetensors.total ${params}`));
	}
	assert.doesNotMatch(render("hub_model", model), /Parameters|safetensors.total/);
});

import { readFileSync } from "node:fs";
it("scopes ink keyboard focus to ML lookup rows and the three ML settings toggles", () => {
	const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
	const rule = css.match(/\/\* Feature 008: ink focus[^]*?\n\}/)?.[0] ?? "";
	assert.match(rule, /--ring:\s*var\(--foreground\)/);
	for (const selector of ['[data-testid="lookup-row"]', '[data-tool="ml_visual"]', '[data-tool="tokenize"]', '[data-testid="toggle-tool-ml-visuals"]', '[data-testid="toggle-tool-model-hub"]', '[data-testid="toggle-tool-papers"]']) assert.ok(rule.includes(selector), selector);
	assert.doesNotMatch(rule, /toggle-tool-math-check|data-tool="plot"|:root/);
});

it("uses ink for page citations without changing other transcript links", () => {
	const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
	const rule = css.match(/\.lh-reading \.lh-prose a\[href\*="#page="\] \{[^}]+\}/)?.[0] ?? "";
	assert.match(rule, /color:\s*var\(--foreground\)/);
	assert.match(rule, /--ring:\s*var\(--foreground\)/);
	assert.doesNotMatch(rule, /text-decoration:\s*none|outline:\s*none/);
});
