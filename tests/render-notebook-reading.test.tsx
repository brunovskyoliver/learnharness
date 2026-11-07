/** Notebook's corner hint and AI marks (feature 024, US2; ui-contract "Chrome", "Reading and threads"). */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { InkDot, ReadingMarks } from "../components/notebook/blot.tsx";
import { CornerHint, costLabel, refusalLine } from "../components/notebook/corner-hint.tsx";
import { InkText } from "../components/notebook/ink-text.tsx";
import { DEFAULT_SHARED, NotebookContext, type NotebookShared, type ReadingStatus } from "../components/notebook/nb-shared.tsx";
import { DETACHED_LINE } from "../components/notebook/margin.tsx";
import { createFauxCore, fauxAssistantMessage } from "@earendil-works/pi-ai";
import { streamNotebookReply } from "../src/agent/subagents/notebook.ts";

const base = (reading: ReadingStatus, mac = true): NotebookShared => ({
	...DEFAULT_SHARED, mac, noteId: "lib_a", preferences: { ...DEFAULT_SHARED.preferences, appearance: "light" }, reading,
});
const hint = (reading: ReadingStatus, mac = true) => renderToStaticMarkup(<NotebookContext.Provider value={base(reading, mac)}><CornerHint /></NotebookContext.Provider>);

describe("corner hint", () => {
	it("idle: the shortcut hint", () => {
		assert.match(hint(null), />⌘K finds a note</);
		assert.match(hint(null, false), />Ctrl\+K finds a note</);
	});

	it("running: what it does, its cost (or that it isn't known), Stop", () => {
		const html = hint({ state: "running", runId: "nbr_1", phase: "reading" });
		assert.match(html, /Reading…/);
		assert.match(html, /cost not known/);
		assert.match(html, /data-testid="nb-hint-stop"[^>]*>Stop</);
		assert.match(hint({ state: "running", runId: "nbr_1", phase: "writing" }), /Writing…/);
		assert.match(hint({ state: "running", runId: "nbr_1", phase: "drawing" }), /Drawing…/);
		assert.equal(costLabel(0.0123), "$0.0123");
		assert.equal(costLabel(null), "cost not known");
	});

	it("refused: says why, in the hint (no toast)", () => {
		const models = hint({ state: "refused", reason: "models" });
		assert.match(models, /No model set up\./);
		assert.match(models, /Open Study’s settings/);
		assert.equal(refusalLine({ state: "refused", reason: "key", provider: "anthropic" }), "Your Anthropic key is missing");
		assert.equal(refusalLine({ state: "refused", reason: "key", provider: "acme" }), "Your acme key is missing");
	});

	it("failed: says so, with Try again", () => {
		const html = hint({ state: "failed", retry: () => {} });
		assert.match(html, /That didn’t come through\./);
		assert.match(html, />Try again</);
	});
});

describe("ink", () => {
	it("new text inks in word by word; existing text is plain", () => {
		const fresh = renderToStaticMarkup(<InkText text="What would have to be true?" animate />);
		assert.equal((fresh.match(/class="nb-ink-word"/g) ?? []).length, 6);
		assert.match(fresh, /animation-delay:0ms/);
		assert.match(fresh, /animation-delay:70ms/);
		const still = renderToStaticMarkup(<InkText text="What would have to be true?" animate={false} />);
		assert.doesNotMatch(still, /nb-ink-word/);
		assert.match(still, /What would have to be true\?/);
	});

	it("renders its Markdown subset: math, code, bold and italic (real-model pass: `$\\theta$` showed raw)", async () => {
		// The reply as a faux model streams it, through the real streaming path.
		const faux = createFauxCore({ tokensPerSecond: 1000, tokenSize: { min: 2, max: 4 } });
		faux.setResponses([fauxAssistantMessage("If you resolve gravity at angle $\\theta$, is it **always** $g\\sin\\theta$? Check `F=ma` *first*.", { stopReason: "stop" })]);
		const text = await streamNotebookReply({
			context: { note: "On a ramp the acceleration is g.", instruction: "", reviewer: null, threads: [] }, engine: { model: faux.getModel(), streamFn: faux.streamSimple } as never,
			signal: new AbortController().signal, onUsage: () => {}, onDelta: () => {}, conversation: [{ author: "user", text: "Why?" }], quote: "the acceleration is g",
		});
		for (const animate of [true, false]) {
			const html = renderToStaticMarkup(<InkText text={text} animate={animate} />);
			assert.equal((html.match(/class="nb-math"/g) ?? []).length, 2, "two formulas");
			assert.match(html, /class="katex"/);
			assert.doesNotMatch(html, /\$\\theta\$|\$g/, "no raw dollar math");
			assert.match(html, /<strong>always<\/strong>/);
			assert.match(html, /<code class="nb-code">F=ma<\/code>/);
			assert.match(html, /<em>first<\/em>/);
			assert.doesNotMatch(html, /\*\*|`/);
		}
		const words = renderToStaticMarkup(<InkText text="A $\\theta$ here." animate />);
		assert.equal((words.match(/class="nb-ink-word"/g) ?? []).length, 3, "a formula inks in as one word");
		const display = renderToStaticMarkup(<InkText text="So $$a = g\\sin\\theta$$ holds." animate={false} />);
		assert.match(display, /nb-math nb-math-display[\s\S]*katex-display/);
	});

	it("leaves prices, lone markers and unclosed math as text", () => {
		const html = renderToStaticMarkup(<InkText text="It costs $5 and $10, 2 * 3 = 6, and $x is open." animate={false} />);
		assert.doesNotMatch(html, /katex|<em>|<strong>/);
		assert.match(html, /It costs \$5 and \$10, 2 \* 3 = 6, and \$x is open\./);
	});

	it("paragraphs become blocks", () => {
		const html = renderToStaticMarkup(<InkText text={"One.\n\nTwo."} animate={false} />);
		assert.equal((html.match(/class="nb-words"/g) ?? []).length, 2);
	});

	it("a fresh dot splats, glints and drips; an old one is still", () => {
		assert.match(renderToStaticMarkup(<InkDot fresh />), /nb-ink-dot nb-fresh[\s\S]*nb-ink-sheen[\s\S]*nb-ink-drip/);
		assert.doesNotMatch(renderToStaticMarkup(<InkDot />), /nb-fresh|nb-ink-drip/);
	});

	it("reading marks: pencil under each line and the blot after the last", () => {
		const html = renderToStaticMarkup(<ReadingMarks lines={[{ x1: 0, x2: 300, top: 0, bottom: 20 }, { x1: 0, x2: 120, top: 29, bottom: 49 }]} />);
		assert.equal((html.match(/class="nb-pencil-stroke"/g) ?? []).length, 2);
		assert.match(html, /left:130px;top:39px/);
		assert.equal(renderToStaticMarkup(<ReadingMarks lines={[]} />), "");
	});

	it("a thread whose words are gone says so", () => {
		assert.equal(DETACHED_LINE, "The words this was about are gone.");
	});
});
