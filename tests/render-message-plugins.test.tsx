/** Feature 024 (US4, owner Clarification Q3): a message that needs math or
 * code waits for its renderer and never shows raw `$…$`; a plain message
 * renders at once. Runs in its own process, so the renderers start unloaded. */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { MessageResponse } from "../components/ai-elements/message.tsx";
import { ReasoningContent, Reasoning } from "../components/ai-elements/reasoning.tsx";
import { loadRenderer } from "../components/ai-elements/markdown-plugins.ts";

const MATH = "The map $f(x) = x^2$ is smooth.";

/** Visible text outside rendered KaTeX and code: where a raw `$` would show. */
function proseText(root: { querySelectorAll(selector: string): ArrayLike<{ remove(): void }>; textContent: string | null }): string {
	for (const node of Array.from(root.querySelectorAll(".katex, code, pre"))) node.remove();
	return root.textContent ?? "";
}

test("server render: a math message has not appeared, with no raw dollars", () => {
	const html = renderToStaticMarkup(<MessageResponse>{MATH}</MessageResponse>);
	assert.match(html, /data-renderer-pending/);
	assert.match(html, /aria-busy="true"/);
	assert.doesNotMatch(html, /\$/);
	assert.doesNotMatch(html, /smooth/);
});

test("server render: a code message waits for its highlighter", () => {
	const html = renderToStaticMarkup(<MessageResponse>{"Run this:\n\n```py\nprint(1)\n```"}</MessageResponse>);
	assert.match(html, /data-renderer-pending/);
	assert.doesNotMatch(html, /print/);
});

test("server render: a plain message renders at once", () => {
	const html = renderToStaticMarkup(<MessageResponse>{"Plain words with `inline code` and `$HOME`."}</MessageResponse>);
	assert.doesNotMatch(html, /data-renderer-pending/);
	assert.match(html, /Plain words with/);
	assert.match(html, /\$HOME/); // inside inline code, as written
});

test("server render: reasoning with math waits too", () => {
	const html = renderToStaticMarkup(<Reasoning defaultOpen isStreaming={false}><ReasoningContent>{MATH}</ReasoningContent></Reasoning>);
	assert.doesNotMatch(html, /\$/);
	assert.doesNotMatch(html, /smooth/);
	assert.match(html, /aria-busy="true"/);
	const plain = renderToStaticMarkup(<Reasoning defaultOpen isStreaming={false}><ReasoningContent>{"Plain thoughts."}</ReasoningContent></Reasoning>);
	assert.match(plain, /Plain thoughts\./);
});

test("in the browser: math appears once its renderer arrives, never as raw dollars; a streamed reply holds its shown text", async () => {
	const dom = parseHTML("<html><body></body></html>");
	Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
	// The stylesheet import has no CSS loader under Node; its failure is logged, not thrown.
	const error = console.error; console.error = () => {};
	const { createRoot } = await import("react-dom/client");
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	try {
		// A plain streamed paragraph shows at once.
		await act(async () => root.render(<MessageResponse streaming>{"First paragraph.\n\nSecond"}</MessageResponse>));
		assert.match(host.textContent ?? "", /First paragraph\./);

		// The stream reaches its first formula: the shown text holds, no raw `$`.
		await act(async () => root.render(<MessageResponse streaming>{`First paragraph.\n\n${MATH}\n\nThird`}</MessageResponse>));
		assert.match(host.textContent ?? "", /First paragraph\./);
		assert.doesNotMatch(proseText(host.cloneNode(true) as unknown as HTMLElement), /\$/);

		// A message that never appeared yet: nothing, then rendered math.
		const other = document.createElement("div"); document.body.append(other);
		const otherRoot = createRoot(other);
		await act(async () => otherRoot.render(<MessageResponse>{MATH}</MessageResponse>));
		assert.doesNotMatch(proseText(other.cloneNode(true) as unknown as HTMLElement), /\$/);

		await act(async () => { await loadRenderer("math"); });
		assert.ok(host.querySelector(".katex"), "the streamed formula renders once the renderer arrives");
		assert.match(host.textContent ?? "", /smooth/);
		assert.ok(other.querySelector(".katex"));
		assert.doesNotMatch(proseText(host.cloneNode(true) as unknown as HTMLElement), /\$/);
		assert.doesNotMatch(proseText(other.cloneNode(true) as unknown as HTMLElement), /\$/);
		await act(async () => otherRoot.unmount());
	} finally {
		await act(async () => root.unmount());
		console.error = error;
	}
});
