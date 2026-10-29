import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { LiveToolCard } from "../components/artifacts/live-tool-card.tsx";
import { toolActivityLabel } from "../src/core/pending.ts";

for (const [tool, label] of [
	["ml_visual", "Drawing a panel…"],
	["tokenize", "Tokenizing…"],
	["hub_search", "Looking up on Hugging Face…"],
	["hub_model", "Looking up on Hugging Face…"],
	["paper_search", "Searching papers…"],
	["paper_read", "Reading a paper…"],
]) it(`${tool} shows only its approved running label, spinner and shimmer`, () => {
	assert.equal(toolActivityLabel(tool!), label);
	const html = renderToStaticMarkup(<LiveToolCard part={{ type: `tool-${tool}`, state: "input-streaming", toolCallId: "c1", input: { text: "private text", query: "private query", repo: "private repo", path: "private path" } } as never} />);
	assert.ok(html.includes(label!));
	assert.ok(!html.includes("private"));
	const doc = parseHTML(html).document;
	assert.equal(doc.querySelector("details"), null);
	assert.equal(doc.querySelector("pre"), null);
	assert.ok(doc.querySelector('[data-testid="live-tool-card"]'));
	assert.ok(!html.includes("amber"));
});
