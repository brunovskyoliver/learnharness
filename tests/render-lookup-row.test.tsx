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
