/** Feature 024 (US4, owner decision 2026-11-09): math stays eager and is
 * server-rendered; code shows plain at once and is highlighted once the
 * on-demand highlighter arrives. No message waits or hides. Runs in its own
 * process, so the highlighter starts unloaded. */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { MessageResponse } from "../components/ai-elements/message.tsx";
import { loadCodeHighlighter } from "../components/ai-elements/markdown-plugins.ts";

const MATH = "The map $f(x) = x^2$ is smooth.";
const CODE = "Run this:\n\n```py\ndef area(r):\n    return 3.14 * r * r\n```\n\nThen read on.";

test("math is server-rendered as KaTeX, with no raw dollars", () => {
	const html = renderToStaticMarkup(<MessageResponse>{MATH}</MessageResponse>);
	assert.match(html, /class="katex"/);
	assert.match(html, /smooth/);
	const prose = html.replace(/<span class="katex">[\s\S]*?<\/annotation>/g, "");
	assert.doesNotMatch(prose, /\$/);
});

test("a code message is server-rendered at once, as plain code", () => {
	const html = renderToStaticMarkup(<MessageResponse>{CODE}</MessageResponse>);
	assert.match(html, /Then read on\./);
	assert.match(html, /data-testid="md-code"/);
	assert.match(html, /def area/);
	assert.doesNotMatch(html, /style="[^"]*--shiki-dark:/); // highlighted tokens carry their colours inline
});

test("in the browser: code shows plain at once, then highlighted in place", { timeout: 60_000 }, async () => {
	const dom = parseHTML("<html><body></body></html>");
	Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
	const { createRoot } = await import("react-dom/client");
	const { flushSync } = await import("react-dom");
	const host = document.createElement("div"); document.body.append(host);
	const root = createRoot(host);
	const pre = () => host.querySelector("[data-testid=md-code] pre");
	const highlighted = () => Array.from(pre()?.querySelectorAll("span") ?? []).some((span) => (span.getAttribute("style") ?? "").includes("--shiki-dark:"));
	try {
		// The first render kicks the download; the message is already there.
		// Committed synchronously, before the download can answer.
		flushSync(() => root.render(<MessageResponse>{CODE}</MessageResponse>));
		assert.match(host.textContent ?? "", /Then read on\./);
		const plain = pre()?.textContent;
		assert.match(plain ?? "", /return 3\.14 \* r \* r/);
		assert.equal(highlighted(), false, "plain before the highlighter arrives");

		await act(async () => { await loadCodeHighlighter(); });
		for (let i = 0; i < 200 && !highlighted(); i++) {
			await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
		}
		assert.ok(highlighted(), "highlighted once the highlighter arrives");
		// Same text, same lines: highlighting only colours it.
		assert.equal(pre()?.textContent, plain);
		assert.match(host.textContent ?? "", /Then read on\./);
	} finally {
		await act(async () => root.unmount());
	}
});
