/**
 * Ink-in for streaming tutor prose (feature 025, T028, research R9): the
 * rehype plugin wraps the streaming reply's last block in `span.nb-ink-word`
 * with Notebook's stagger; settled replies render without it, and a
 * re-render keeps the words already shown (same spans, same delays) so only
 * new words ink in.
 */
import React, { act } from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { parseHTML } from "linkedom";
import { AssistantResponse } from "../components/assistant-response.tsx";
import { UserTurn } from "../components/user-turn-text.tsx";
import { inkStepMs, inkWordsState, rehypeInkWords } from "../components/paper/rehype-ink-words.ts";
import type { Element, Root } from "hast";

const words = (html: string) => (html.match(/class="nb-ink-word"/g) ?? []).length;

describe("AssistantResponse: the tutor's voice", () => {
	it("settled prose is in the voice and never inks in", () => {
		const html = renderToStaticMarkup(<AssistantResponse source={"A settled reply.\n\nIts second paragraph."} />);
		assert.match(html, /class="[^"]*\blh-prose\b[^"]*\bnb-voice\b[^"]*\blh-voice\b/);
		assert.equal(words(html), 0, "history never animates");
	});

	it("a streaming reply inks in its last block only", () => {
		const html = renderToStaticMarkup(<AssistantResponse streaming source={"First paragraph stays.\n\nThe new words ink in\n\n"} />);
		const { document } = parseHTML(`<div>${html}</div>`);
		const paragraphs = [...document.querySelectorAll("p")];
		assert.equal(paragraphs.length, 2);
		assert.equal(paragraphs[0]!.querySelectorAll(".nb-ink-word").length, 0, "earlier blocks are plain");
		const spans = [...paragraphs[1]!.querySelectorAll(".nb-ink-word")];
		assert.deepEqual(spans.map((s) => s.textContent), ["The ", "new ", "words ", "ink ", "in"]);
		const step = inkStepMs(5);
		assert.deepEqual(spans.map((s) => s.getAttribute("style")), [0, 1, 2, 3, 4].map((i) => `animation-delay:${Math.round(i * step)}ms`));
	});

	it("streaming math and bold titles ink in whole and still render", () => {
		const html = renderToStaticMarkup(<AssistantResponse streaming source={"See **Loss surface** where $f(x) = x^2$ holds\n\n"} />);
		const { document } = parseHTML(`<div>${html}</div>`);
		const spans = [...document.querySelectorAll(".nb-ink-word")];
		assert.ok(spans.some((s) => s.querySelector("strong")?.textContent === "Loss surface"), "the bold run is one unit");
		assert.ok(spans.some((s) => s.querySelector(".katex")), "KaTeX renders inside its unit");
	});
});

describe("UserTurn: the learner's words", () => {
	it("has no raised block: sans graphite at the note size, a faint 12px \"You\" meta line", () => {
		const html = renderToStaticMarkup(<UserTurn text={"Why does $x$ shrink?"} />);
		const { document } = parseHTML(html);
		const row = document.querySelector('[data-testid="user-message"]')!;
		assert.ok(row, "the test id stays");
		for (const cls of ["lh-reading", "lh-user-turn", "font-sans"]) assert.ok(row.classList.contains(cls), cls);
		for (const cls of ["bg-shelf", "rounded-lg", "px-4", "py-3"]) assert.ok(!row.classList.contains(cls), `no raised block: ${cls}`);
		const label = row.firstElementChild!;
		assert.equal(label.textContent, "You");
		assert.ok(label.classList.contains("text-xs") && label.classList.contains("text-faint"), "the label is faint meta");
		assert.match(html, /Why does \$x\$ shrink\?/, "learner text stays plain ($ stays $)");
		assert.ok(!html.includes("nb-voice"), "his words are never in the voice");
	});
});

describe("rehypeInkWords", () => {
	const el = (tagName: string, children: Element["children"], className?: string[]): Element => ({ type: "element", tagName, properties: className ? { className } : {}, children });
	const text = (value: string) => ({ type: "text" as const, value });

	it("inks a bold run, inline code and inline math as one unit each; code blocks stay plain", () => {
		const tree: Root = { type: "root", children: [el("p", [text("Say "), el("strong", [text("Loss surface")]), text(" then "), el("code", [text("x^2")], ["language-math", "math-inline"]), text(" and "), el("code", [text("f()")])])] };
		rehypeInkWords(inkWordsState("t1"))(tree);
		const p = tree.children[0] as Element;
		const units = p.children.filter((c): c is Element => c.type === "element");
		assert.ok(units.every((u) => (u.properties.className as string[])[0] === "nb-ink-word"));
		assert.deepEqual(units.map((u) => u.children[0]!.type === "element" ? u.children[0]!.tagName : "text"), ["text", "strong", "text", "code", "text", "code"]);
		const block: Root = { type: "root", children: [el("pre", [el("code", [text("let a = 1")])])] };
		rehypeInkWords(inkWordsState("t2"))(block);
		assert.equal(JSON.stringify(block).includes("nb-ink-word"), false, "a code block is left alone");
	});

	it("keeps each word's first delay as the block grows, and starts over on a new block", () => {
		const state = inkWordsState("t3");
		const run = (blocks: string[]) => {
			const tree: Root = { type: "root", children: blocks.map((b) => el("p", [text(b)])) };
			rehypeInkWords(state)(tree);
			return ((tree.children.at(-1) as Element).children as Element[]).map((s) => s.properties.style);
		};
		const first = run(["one two"]);
		const second = run(["one two three four"]);
		assert.deepEqual(second.slice(0, 2), first, "earlier words keep their delays");
		assert.deepEqual(second.slice(2), ["animation-delay: 0ms", "animation-delay: 70ms"], "new words stagger from when they arrive");
		const next = run(["one two three four", "fresh"]);
		assert.deepEqual(next, ["animation-delay: 0ms"], "the new last block starts its own stagger");
		assert.equal(JSON.stringify(state), '"ink:t3"', "Streamdown's processor cache key stays one per reply");
	});
});

describe("Ink-in across re-renders (DOM)", () => {
	it("keeps the spans already shown, inks only new words, and drops the spans once settled", async () => {
		const dom = parseHTML("<html><body></body></html>");
		const names = ["window", "document", "Element", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"] as const;
		const originals = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
		Object.assign(globalThis, { window: dom.window, document: dom.document, Element: dom.window.Element, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
		const host = dom.document.createElement("div");
		dom.document.body.append(host);
		const root = createRoot(host);
		try {
			await act(async () => root.render(<AssistantResponse streaming source={"Gradient descent steps\n\n"} />));
			const before = [...host.querySelectorAll(".nb-ink-word")];
			assert.deepEqual(before.map((s) => s.textContent), ["Gradient ", "descent ", "steps"]);
			const delays = before.map((s) => s.getAttribute("style"));
			await act(async () => root.render(<AssistantResponse streaming source={"Gradient descent steps downhill each time\n\n"} />));
			const after = [...host.querySelectorAll(".nb-ink-word")];
			assert.equal(after.length, 6);
			for (let i = 0; i < 2; i++) assert.equal(after[i], before[i], `word ${i} keeps its span`);
			assert.deepEqual(after.slice(0, 2).map((s) => s.getAttribute("style")), delays.slice(0, 2), "and its delay");
			assert.equal(after[3]!.getAttribute("style"), "animation-delay:0ms", "the first new word inks in at once");
			// A new last block: the earlier one re-renders plain (Streamdown memoizes blocks on class and position).
			await act(async () => root.render(<AssistantResponse streaming source={"Gradient descent steps downhill each time.\n\nThen it stops\n\n"} />));
			assert.deepEqual([...host.querySelectorAll(".nb-ink-word")].map((s) => s.textContent), ["Then ", "it ", "stops"], "only the last block inks");
			await act(async () => root.render(<AssistantResponse source={"Gradient descent steps downhill each time."} />));
			assert.equal(host.querySelectorAll(".nb-ink-word").length, 0, "a settled reply is plain");
			assert.match(host.textContent ?? "", /Gradient descent steps downhill each time\./);
		} finally {
			await act(async () => root.unmount());
			names.forEach((name, i) => { const d = originals[i]; if (d) Object.defineProperty(globalThis, name, d); else delete (globalThis as Record<string, unknown>)[name]; });
		}
	});
});
