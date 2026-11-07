/** Notebook's selection menu and sketches (feature 024, US4, T032): the
 *  sketch's stepper and finished state, the "played" hash, the autoplay
 *  pace; the menu's rows and names; the passage a selection hands over;
 *  underline and ink colours through the page's Markdown. */
import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Schema } from "@tiptap/pm/model";
import { renderToStaticMarkup } from "react-dom/server";
import { createPageCodec, parsePageMarkdown, serializePageJson } from "../components/library/page-markdown.ts";
import { INK_COLORS } from "../components/library/page-ink.ts";
import { noteText, rangeText } from "../components/notebook/nb-plugins.ts";
import { ACTIONS, INK_NAMES } from "../components/notebook/selection-menu.tsx";
import { Sketch, sketchHash, stepHoldMs, Stepper, type SketchPlayer } from "../components/notebook/sketch.tsx";
import { ASK_HINT, ASK_PLACEHOLDER } from "../components/notebook/use-threads.ts";
import { SKETCHING_LINE } from "../components/notebook/use-selection-runs.ts";
import { FAUX_SKETCH } from "../src/agent/subagents/notebook.ts";
import { anchorForSpan } from "../src/core/index.ts";

const player = (patch: Partial<SketchPlayer> = {}): SketchPlayer => ({ step: 0, count: 4, round: 0, liveStart: false, finished: false, go: () => {}, replay: () => {}, ...patch });

describe("the sketch (ui-contract \"Sketch\", §16)", () => {
	it("first paints finished: title, subtitle, every step drawn, the last caption and note, 4/4, See it larger", () => {
		const html = renderToStaticMarkup(<Sketch sketch={FAUX_SKETCH} />);
		assert.match(html, /class="nb-sketch-title nb-voice">How many ways to each cell\?</);
		assert.match(html, /class="nb-sketch-subtitle">Start top-left\. Move only right or down\.</);
		assert.match(html, /data-testid="nb-sketch-count">4\/4</);
		assert.match(html, /aria-live="polite" data-testid="nb-sketch-caption">The last cell adds its two neighbors: 3 \+ 3 = 6\.</);
		assert.match(html, /data-testid="nb-sketch-note">Above \+ left = this cell\.</);
		assert.equal((html.match(/<g data-step="\d"/g) ?? []).length, 4);
		assert.doesNotMatch(html, /opacity="0"/);
		assert.match(html, /<button type="button" class="nb-sketch-larger" data-testid="nb-sketch-larger">See it larger<\/button>/);
		// Drawn at 1.12px per unit, centred: 262 units wide.
		assert.match(html, /max-width:293\.44/);
	});

	it("names the stepper's buttons and disables the ends", () => {
		const first = renderToStaticMarkup(<Stepper player={player({ step: 0 })} />);
		assert.match(first, /aria-label="Previous step" aria-disabled="true"/);
		assert.match(first, /aria-label="Next step" aria-disabled="false"/);
		assert.match(first, /aria-label="Draw it again"/);
		assert.match(first, />1\/4</);
		const last = renderToStaticMarkup(<Stepper player={player({ step: 3 })} />);
		assert.match(last, /aria-label="Previous step" aria-disabled="false"/);
		assert.match(last, /aria-label="Next step" aria-disabled="true"/);
		assert.match(last, />4\/4</);
	});

	it("says a drawing that fails validation didn’t come through", () => {
		const html = renderToStaticMarkup(<Sketch sketch={{ ...FAUX_SKETCH, items: [{ step: 9, kind: "dot", cx: 1, cy: 1 }] }} />);
		assert.equal(html, '<p class="nb-sketch-failed" data-testid="nb-sketch-failed">The drawing didn’t come through.</p>');
	});

	it("remembers a drawing by a stable hash, and paces autoplay by its caption", () => {
		assert.equal(sketchHash(FAUX_SKETCH), sketchHash(structuredClone(FAUX_SKETCH)));
		assert.notEqual(sketchHash(FAUX_SKETCH), sketchHash({ ...FAUX_SKETCH, title: "Other" }));
		assert.equal(stepHoldMs(""), 1150);
		assert.equal(stepHoldMs("abcd"), 1150 + 88);
	});
});

describe("the selection menu (ui-contract \"Selection menu\")", () => {
	it("offers the four actions, in order, and eight inks named “{colour} ink”", () => {
		assert.deepEqual(ACTIONS.map((a) => a.label), ["Think about this", "Ask about this", "Visualize", "Make flashcards"]);
		assert.deepEqual(["default", ...INK_COLORS].map((c) => `${INK_NAMES[c as keyof typeof INK_NAMES]} ink`), ["Default ink", "Gray ink", "Brown ink", "Red ink", "Orange ink", "Green ink", "Blue ink", "Purple ink"]);
		assert.equal(ASK_PLACEHOLDER, "Ask about this passage…");
		assert.equal(ASK_HINT, "Enter to ask. Esc to cancel.");
		assert.equal(SKETCHING_LINE, "Sketching it…");
	});

	it("hands over the passage he selected as an anchor on the text he sees", () => {
		const schema = new Schema({ nodes: { doc: { content: "block+" }, paragraph: { group: "block", content: "inline*" }, bulletList: { group: "block", content: "listItem+" }, listItem: { content: "paragraph+" }, text: { group: "inline" } } });
		const p = (t: string) => schema.node("paragraph", null, [schema.text(t)]);
		const doc = schema.node("doc", null, [p("First line here."), schema.node("bulletList", null, [schema.node("listItem", null, [p("an item")])])]);
		const text = noteText(doc);
		// "line here." plus the next block: the span runs from "line" to "item", list marker inside.
		const from = 1 + "First ".length;
		const to = doc.content.size - 3;
		const span = rangeText(text, from, to)!;
		assert.equal(text.text.slice(span.start, span.end), "line here.\n\n- an item");
		const anchor = anchorForSpan(text.text, span.start, span.end);
		assert.equal(anchor.prefix, "First ");
		// A selection of only whitespace hands over nothing.
		const space = 1 + "First".length;
		assert.equal(rangeText(text, space, space + 1), null);
	});
});

describe("underline and ink colours keep the page's Markdown (codec, feature 024)", () => {
	const cycle = (md: string) => serializePageJson(parsePageMarkdown(md));

	it("reads <u> and <span data-color> as marks and writes them back byte for byte", () => {
		for (const md of ["a <u>b</u> c", 'x <span data-color="blue">blue **bold**</span> y', '**<span data-color="red">r</span>**', "<u>one</u> and <u>two</u>"]) {
			assert.equal(cycle(md), md);
		}
		const doc = parsePageMarkdown('x <span data-color="purple">p</span> <u>u</u>');
		const marks = (doc.content?.[0]?.content ?? []).map((n) => (n.marks ?? []).map((m) => `${m.type}${m.attrs?.color ? `:${m.attrs.color}` : ""}`).join(","));
		assert.deepEqual(marks, ["", "inkColor:purple", "", "underline"]);
	});

	it("leaves other HTML verbatim: uppercase <U>, an unknown colour, a span with other attributes", () => {
		for (const md of ["a <U>b</U> c", '<span data-color="pink">p</span>', '<span class="x">p</span>']) {
			assert.equal(cycle(md), md);
			assert.equal(parsePageMarkdown(md).content?.[0]?.content?.some((n) => n.type === "rawInline"), true, md);
		}
	});

	it("a colour or underline set in the editor saves and reloads as the same marks", () => {
		const codec = createPageCodec("hello world\n");
		const edited = structuredClone(codec.doc);
		edited.content![0]!.content = [
			{ type: "text", text: "hello " },
			{ type: "text", text: "world", marks: [{ type: "inkColor", attrs: { color: "blue" } }, { type: "bold" }] },
			{ type: "text", text: " ok", marks: [{ type: "underline" }] },
		];
		const out = codec.toMarkdown(edited);
		assert.equal(out, 'hello **<span data-color="blue">world</span>** <u>ok</u>\n');
		assert.equal(cycle(out.trim()), out.trim());
	});

	it("underline or colour around code keeps the page openable (code takes no other mark)", () => {
		assert.doesNotThrow(() => parsePageMarkdown("<u>`x`</u>"));
		assert.doesNotThrow(() => parsePageMarkdown('<span data-color="red">`x`</span>'));
	});
});
