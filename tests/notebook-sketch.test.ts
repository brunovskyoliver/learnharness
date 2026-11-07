/** Feature 024 sketches: schema validation and the pure SVG renderer. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderSketchSvg, sketchLabel, validateSketch, type Sketch } from "../src/core/notebook-sketch.ts";
import { FAUX_SKETCH } from "../src/agent/subagents/notebook.ts";

const base = (over: Record<string, unknown> = {}) => ({
	title: "Heat flow",
	w: 200,
	h: 120,
	steps: [{ caption: "Hot side." }, { caption: "Cold side.", note: "Heat moves." }],
	items: [{ step: 0, kind: "dot", cx: 20, cy: 20 }],
	...over,
});

const problemOf = (raw: unknown) => {
	const result = validateSketch(raw);
	assert.equal(result.ok, false, "expected a refusal");
	return (result as { problem: string }).problem;
};

describe("validation", () => {
	it("accepts the faux 3x3 grid and every primitive kind", () => {
		const grid = validateSketch(FAUX_SKETCH);
		assert.ok(grid.ok);
		assert.equal(grid.sketch.steps.length, 4);
		const all = validateSketch(base({
			items: [
				{ step: 0, kind: "grid", x: 0, y: 0, cols: 2, rows: 2, cell: 20 },
				{ step: 0, kind: "text", x: 50, y: 50, text: "x", size: "l", voice: false, anchor: "start" },
				{ step: 0, kind: "line", x1: 0, y1: 0, x2: 100, y2: 100 },
				{ step: 1, kind: "arrow", x1: 0, y1: 0, x2: 100, y2: 100, curve: 0.3 },
				{ step: 1, kind: "rect", x: 10, y: 10, w: 30, h: 20, r: 4 },
				{ step: 1, kind: "circle", cx: 50, cy: 50, r: 10 },
				{ step: 1, kind: "dot", cx: 5, cy: 5 },
				{ step: 1, kind: "bar", x: 0, y: 100, w: 150, h: 10 },
				{ step: 1, kind: "path", d: "M10 10 L50 50 Q60 60 70 70 C80 80 90 90 100 100 Z" },
			],
		}));
		assert.ok(all.ok, JSON.stringify(all));
		assert.equal(all.sketch.items.length, 9);
	});

	it("drops fields an item's kind does not have", () => {
		const result = validateSketch(base({ items: [{ step: 0, kind: "dot", cx: 1, cy: 1, onclick: "alert(1)", d: "M0 0" }] }));
		assert.ok(result.ok);
		assert.deepEqual(result.sketch.items[0], { kind: "dot", step: 0, cx: 1, cy: 1 });
	});

	it("rejects unknown kinds, out-of-box coordinates and bad steps", () => {
		assert.match(problemOf(base({ items: [{ step: 0, kind: "image", href: "x" }] })), /unknown item kind/);
		assert.match(problemOf(base({ items: [{ step: 0, kind: "dot", cx: 500, cy: 1 }] })), /inside/);
		assert.match(problemOf(base({ items: [{ step: 2, kind: "dot", cx: 1, cy: 1 }] })), /step/);
		assert.match(problemOf(base({ items: [{ step: 0, kind: "grid", x: 100, y: 0, cols: 8, rows: 1, cell: 20 }] })), /leaves/);
		assert.match(problemOf(base({ items: [{ step: 0, kind: "circle", cx: 5, cy: 5, r: 10 }] })), /leaves/);
		assert.match(problemOf(base({ steps: [] })), /steps/);
		assert.match(problemOf(base({ steps: new Array(7).fill({ caption: "x" }) })), /steps/);
		assert.match(problemOf(base({ items: [] })), /items/);
		assert.match(problemOf(base({ w: 50 })), /^w /);
		assert.match(problemOf(base({ title: "" })), /title/);
		assert.match(problemOf(null), /object/);
	});

	it("allows only M, L, Q, C and Z in paths, inside the box", () => {
		assert.match(problemOf(base({ items: [{ step: 0, kind: "path", d: "M0 0 A10 10 0 0 1 20 20" }] })), /only M, L, Q, C and Z/);
		assert.match(problemOf(base({ items: [{ step: 0, kind: "path", d: "L0 0" }] })), /start with M/);
		assert.match(problemOf(base({ items: [{ step: 0, kind: "path", d: "M0 0 L500 0" }] })), /leaves/);
		assert.match(problemOf(base({ items: [{ step: 0, kind: "path", d: "M0 0 Q1 1" }] })), /too few/);
		assert.match(problemOf(base({ items: [{ step: 0, kind: "path", d: "M0 0 L" }] })), /no numbers/);
	});
});

describe("rendering", () => {
	const sketch = (validateSketch(FAUX_SKETCH) as { ok: true; sketch: Sketch }).sketch;

	it("is deterministic and draws one group per step with data-step", () => {
		const svg = renderSketchSvg(sketch);
		assert.equal(svg, renderSketchSvg(sketch));
		assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" class="nb-drawing" viewBox="0 0 262 282" role="img"/);
		assert.equal((svg.match(/<g data-step="/g) ?? []).length, 4);
		assert.doesNotMatch(svg, /opacity="0"/, "the default step is the last, so all show");
	});

	it("inks lines and arrows in graphite at 1.2 and grid rules in --rule (visual-reference §16.1, frame inline-sketch)", () => {
		const svg = renderSketchSvg(sketch);
		assert.match(svg, /fill="none" stroke="var\(--graphite\)" stroke-width="1.2"/);
		assert.doesNotMatch(svg, /stroke="var\(--riddle\)"/);
		assert.match(svg, /style="stroke:var\(--rule\);stroke-width:1px"/);
	});

	it("hides later steps, and clamps the step", () => {
		const first = renderSketchSvg(sketch, { step: 0 });
		assert.match(first, /<g data-step="1" opacity="0">/);
		assert.match(first, /<g data-step="2" opacity="0">/);
		assert.match(first, /<g data-step="3" opacity="0">/);
		assert.doesNotMatch(first, /<g data-step="0" opacity/);
		assert.equal(renderSketchSvg(sketch, { step: 99 }), renderSketchSvg(sketch));
		assert.equal(renderSketchSvg(sketch, { step: -3 }), first);
	});

	it("draws a grid with cells taller or shorter than wide (cellH)", () => {
		const svg = renderSketchSvg(sketch, { step: 0 });
		assert.match(svg, /d="M12.5 41L12.5 221"/, "the grid's left edge runs 3 x 60 down");
		assert.match(svg, /d="M12.5 101L240.5 101"/, "a row line every 60, 3 x 76 across");
		assert.equal(problemOf(base({ items: [{ step: 0, kind: "grid", x: 0, y: 0, cols: 2, rows: 2, cell: 10, cellH: -1 }] })), "item 0: grid cellH must be a positive size");
		assert.match(problemOf(base({ items: [{ step: 0, kind: "grid", x: 0, y: 0, cols: 2, rows: 8, cell: 10, cellH: 60 }] })), /grid leaves the drawing/);
	});

	it("tags strokes for the pencil draw, bars for grow, dots for pop", () => {
		const svg = renderSketchSvg((validateSketch(base({
			items: [
				{ step: 0, kind: "line", x1: 0, y1: 0, x2: 10, y2: 10 },
				{ step: 0, kind: "bar", x: 0, y: 50, w: 100, h: 10 },
				{ step: 1, kind: "dot", cx: 5, cy: 5 },
				{ step: 1, kind: "text", x: 50, y: 50, text: "hi" },
			],
		})) as { ok: true; sketch: Sketch }).sketch);
		assert.match(svg, /<path class="nb-sketch-line" pathLength="1" d="M0 0L10 10"\/>/);
		assert.match(svg, /class="nb-sketch-bar"/);
		assert.match(svg, /class="nb-sketch-dot-static"/);
		assert.match(svg, /class="nb-sketch-pop-in"/);
	});

	it("escapes text, so a model can't inject markup", () => {
		const result = validateSketch(base({ title: "<script>", items: [{ step: 0, kind: "text", x: 10, y: 10, text: "<b onload=x>&" }] }));
		assert.ok(result.ok);
		const svg = renderSketchSvg(result.sketch, { withTitle: true });
		assert.doesNotMatch(svg, /<script>|<b /);
		assert.match(svg, /&lt;b onload=x&gt;&amp;/);
		assert.match(svg, /aria-label="&lt;script&gt;\. Hot side\. Cold side\."/);
	});

	it("puts the title inside the SVG only for exports", () => {
		assert.doesNotMatch(renderSketchSvg(sketch), />How many ways/, "the page draws the title as HTML");
		const withTitle = renderSketchSvg(sketch, { withTitle: true });
		assert.match(withTitle, /viewBox="0 0 262 326"/);
		assert.match(withTitle, />How many ways to each cell\?</);
		assert.equal(sketchLabel(sketch), "How many ways to each cell. Start with 1 way to reach every edge cell. The middle cell gets 1 from above + 1 from the left. The next two cells each get 1 + 2 = 3. The last cell adds its two neighbors: 3 + 3 = 6.");
	});
});
