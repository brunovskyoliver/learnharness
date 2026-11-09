/** Notebook "Thinks with you" (feature 024, US2, T025): the pause timer
 *  and its guards, the margin placement engine, tethers, the pencil
 *  underline, the ink stagger and the note's plain text. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Schema } from "@tiptap/pm/model";
import {
	alignedTop, DISPLACED_PX, drawnSide, MARGIN_TOP, inkStepMs, marginWidths, mergeLines, NOTE_LINE, NOTE_WIDTH, pencilStrokes, placeStack, readingHoldMs, STACK_GAP, tetherPaths,
} from "../components/notebook/nb-geometry.ts";
import { anchorRange, blockEnd, noteText, quoteRange, textRange } from "../components/notebook/nb-plugins.ts";
import { ReadScheduler, type ReadSchedulerDeps } from "../components/notebook/read-scheduler.ts";
import { inkWords } from "../components/notebook/ink-text.tsx";
import { anchorForSpan, paceDelay, textHash } from "../src/core/index.ts";

// ─── the pause timer ─────────────────────────────────────────────────────────

function scheduler(over: Partial<ReadSchedulerDeps> & { text?: string } = {}) {
	const calls = { start: [] as string[], abort: [] as string[] };
	let text = over.text ?? "Entropy always rises in a closed system.";
	const deps: ReadSchedulerDeps = {
		delay: () => paceDelay("regular"),
		enabled: () => true,
		text: () => text,
		held: () => false,
		start: (t) => calls.start.push(t),
		abort: (id) => calls.abort.push(id),
		...over,
	};
	return { s: new ReadScheduler(deps), calls, setText: (t: string) => { text = t; } };
}

describe("ReadScheduler (ui-contract Paces)", () => {
	it("reads once after the Regular pause, not before", (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const { s, calls } = scheduler();
		s.edited();
		t.mock.timers.tick(1599);
		assert.equal(calls.start.length, 0);
		t.mock.timers.tick(1);
		assert.deepEqual(calls.start, ["Entropy always rises in a closed system."]);
	});

	it("Slow waits twice as long", (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const { s, calls } = scheduler({ delay: () => paceDelay("slow") });
		s.edited();
		t.mock.timers.tick(3199);
		assert.equal(calls.start.length, 0);
		t.mock.timers.tick(1);
		assert.equal(calls.start.length, 1);
		assert.equal(paceDelay("slow"), 2 * paceDelay("regular"));
	});

	it("each keystroke restarts the pause", (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const { s, calls } = scheduler();
		s.edited();
		t.mock.timers.tick(1000);
		s.edited();
		t.mock.timers.tick(1000);
		assert.equal(calls.start.length, 0);
		t.mock.timers.tick(600);
		assert.equal(calls.start.length, 1);
	});

	it("When you ask never starts one", (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const { s, calls } = scheduler({ enabled: () => false });
		s.edited();
		t.mock.timers.tick(10_000);
		assert.equal(calls.start.length, 0);
	});

	it("waits for IME composition to end, then pauses again", (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const { s, calls } = scheduler();
		s.compositionStart();
		s.edited();
		t.mock.timers.tick(5000);
		assert.equal(calls.start.length, 0);
		s.compositionEnd();
		t.mock.timers.tick(1599);
		assert.equal(calls.start.length, 0);
		t.mock.timers.tick(1);
		assert.equal(calls.start.length, 1);
	});

	it("skips while a thread field or the selection menu holds focus", (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		let held = true;
		const { s, calls } = scheduler({ held: () => held });
		s.edited();
		t.mock.timers.tick(2000);
		assert.equal(calls.start.length, 0);
		held = false;
		s.edited();
		t.mock.timers.tick(2000);
		assert.equal(calls.start.length, 1);
	});

	it("skips text the last read already saw, empty text too", (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const { s, calls, setText } = scheduler();
		s.seen(textHash("Entropy always rises in a closed system."));
		s.edited();
		t.mock.timers.tick(2000);
		assert.equal(calls.start.length, 0);
		setText("   ");
		s.edited();
		t.mock.timers.tick(2000);
		assert.equal(calls.start.length, 0);
		setText("Entropy always rises. Tea cools.");
		s.edited();
		t.mock.timers.tick(2000);
		assert.equal(calls.start.length, 1);
		// The same text again (undo and redo, say) is not read twice.
		s.edited();
		t.mock.timers.tick(2000);
		assert.equal(calls.start.length, 1);
	});

	it("typing while a read runs stops it, then pauses again", (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const { s, calls, setText } = scheduler();
		s.edited();
		t.mock.timers.tick(1600);
		s.setRunning("nbr_1");
		setText("Entropy always rises in a closed system. Mostly.");
		s.edited();
		assert.deepEqual(calls.abort, ["nbr_1"]);
		assert.equal(s.runningId, null);
		t.mock.timers.tick(1600);
		assert.equal(calls.start.length, 2);
	});

	it("does not start a second read while one runs", (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const { s, calls } = scheduler();
		s.edited();
		// A read started elsewhere (Try again) while the pause was waiting.
		s.setRunning("nbr_2");
		t.mock.timers.tick(1600);
		assert.equal(calls.start.length, 0);
	});

	it("Try again reads the same text now", (t) => {
		t.mock.timers.enable({ apis: ["setTimeout"] });
		const { s, calls } = scheduler();
		s.edited();
		t.mock.timers.tick(1600);
		s.retry();
		assert.equal(calls.start.length, 2);
	});
});

// ─── placement ───────────────────────────────────────────────────────────────

describe("placeStack (margin notes settle without overlap)", () => {
	it("keeps notes at their passages when they don't collide", () => {
		const placed = placeStack([{ id: "a", want: 100, height: 50 }, { id: "b", want: 300, height: 50 }]);
		assert.equal(placed.get("a"), 100);
		assert.equal(placed.get("b"), 300);
	});

	it("never overlaps and keeps the gap", () => {
		const items = [{ id: "a", want: 100, height: 120 }, { id: "b", want: 130, height: 80 }, { id: "c", want: 150, height: 60 }];
		const placed = placeStack(items);
		const sorted = items.map((i) => ({ ...i, top: placed.get(i.id)! })).sort((x, y) => x.top - y.top);
		for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i]!.top >= sorted[i - 1]!.top + sorted[i - 1]!.height + STACK_GAP - 1e-9);
		assert.deepEqual(sorted.map((s) => s.id), ["a", "b", "c"]);
	});

	it("a crowded cluster moves up as well as down (frame margin-notes: 287, 466, 598 for 377, 469, 501)", () => {
		// Heights from the frame: 179 - gap and 132 - gap between first lines.
		const items = [{ id: "college", want: 377, height: 179 - STACK_GAP }, { id: "dumber", want: 469, height: 132 - STACK_GAP }, { id: "agi", want: 501, height: 95 }];
		const placed = placeStack(items);
		assert.ok(Math.abs(placed.get("college")! - 287) <= 2, String(placed.get("college")));
		assert.ok(Math.abs(placed.get("dumber")! - 466) <= 2, String(placed.get("dumber")));
		assert.ok(Math.abs(placed.get("agi")! - 598) <= 2, String(placed.get("agi")));
	});

	it("nothing goes above the top", () => {
		const placed = placeStack([{ id: "a", want: 10, height: 200 }, { id: "b", want: 20, height: 40 }], STACK_GAP, 0);
		assert.equal(placed.get("a"), 0);
		assert.equal(placed.get("b"), 200 + STACK_GAP);
	});

	it("the margin's top is 6px above the column (frame margin-thread: a pushed-up open thread starts there)", () => {
		assert.equal(MARGIN_TOP, -6);
		const placed = placeStack([{ id: "a", want: -40, height: 400 }, { id: "b", want: 30, height: 90 }], STACK_GAP, MARGIN_TOP);
		assert.equal(placed.get("a"), -6);
	});

	it("is stable for equal wants (by id)", () => {
		const placed = placeStack([{ id: "b", want: 50, height: 30 }, { id: "a", want: 50, height: 30 }]);
		assert.ok(placed.get("a")! < placed.get("b")!);
	});
});

describe("margin widths and sides", () => {
	it("measures each margin at a 1665px viewport like the frame", () => {
		const widths = marginWidths({ columnLeft: 502.5, columnWidth: 660, viewportWidth: 1665 });
		assert.equal(widths.left, NOTE_WIDTH);
		assert.equal(widths.right, NOTE_WIDTH);
	});

	it("narrows notes in a tight margin and drops a margin that is too narrow", () => {
		const widths = marginWidths({ columnLeft: 310, columnWidth: 660, viewportWidth: 1280 });
		assert.equal(widths.left, 310 - 59 - 16);
		const tight = marginWidths({ columnLeft: 150, columnWidth: 660, viewportWidth: 1100 });
		assert.equal(tight.left, null);
		assert.equal(drawnSide("left", tight), "right");
		assert.equal(drawnSide("right", { left: null, right: null }), null);
	});

	it("aligns a note's first line with the passage line", () => {
		assert.equal(alignedTop(100, 28.8) + NOTE_LINE / 2, 100 + 28.8 / 2);
	});
});

describe("tetherPaths (§11)", () => {
	it("a passage end runs the line on to just past the last word (Study checks, feature 025)", () => {
		const level = tetherPaths({ side: "right", columnWidth: 660, noteY: 100, passageY: 100, passageX: 420 });
		assert.ok(level.tie.endsWith("L 420 100"));
		const lower = tetherPaths({ side: "right", columnWidth: 660, noteY: 50, passageY: 300, passageX: 420 });
		assert.ok(lower.spine?.endsWith("L 420 300"));
		// A last line that reaches the column edge adds nothing.
		assert.equal(tetherPaths({ side: "right", columnWidth: 660, noteY: 50, passageY: 300, passageX: 670 }).spine, tetherPaths({ side: "right", columnWidth: 660, noteY: 50, passageY: 300 }).spine);
	});
	it("a note level with its line gets only a short tie to the column edge", () => {
		const paths = tetherPaths({ side: "left", columnWidth: 660, noteY: 100, passageY: 100 + DISPLACED_PX });
		assert.equal(paths.spine, null);
		assert.match(paths.tie, /^M -29 100 L -6 104$/);
	});

	it("a displaced note's spine runs down the gutter into the passage line", () => {
		const left = tetherPaths({ side: "left", columnWidth: 660, noteY: 50, passageY: 170 });
		assert.ok(left.spine);
		assert.match(left.spine!, /-6 170$/);
		const right = tetherPaths({ side: "right", columnWidth: 660, noteY: 300, passageY: 120 });
		assert.match(right.tie, /^M 704 300/);
		assert.match(right.spine!, /666 120$/);
	});
});

describe("pencil underline and timings (§9.1, §10.2, §12)", () => {
	const line = (x1: number, x2: number, top: number) => ({ x1, x2, top, bottom: top + 20 });

	it("draws one stroke per line, left to right, at ≥650px/s", () => {
		const { strokes, side, total } = pencilStrokes([line(0, 650, 0), line(0, 325, 29)]);
		assert.equal(side, false);
		assert.equal(strokes.length, 2);
		assert.equal(strokes[0]!.draw, 1);
		assert.equal(strokes[1]!.delay, 1);
		assert.equal(total, 1.5);
		assert.match(strokes[0]!.d, /^M 0 21 Q/);
	});

	it("four lines or more get one side bracket", () => {
		const { strokes, side } = pencilStrokes([line(10, 600, 0), line(0, 600, 29), line(0, 600, 58), line(0, 300, 87)]);
		assert.equal(side, true);
		assert.equal(strokes.length, 1);
		assert.match(strokes[0]!.d, /^M -14 /);
	});

	it("holds the reading mark for the pencil's time plus 1.3s, capped", () => {
		assert.equal(readingHoldMs([line(0, 650, 0)]), 2300);
		assert.equal(readingHoldMs([line(0, 5000, 0)]), 2900);
	});

	it("staggers words by min(70, 1800 / words) ms", () => {
		assert.equal(inkStepMs(10), 70);
		assert.equal(inkStepMs(60), 30);
		assert.equal(inkStepMs(0), 0);
		assert.deepEqual(inkWords("What would  hold?"), ["What ", "would  ", "hold?"]);
	});

	it("merges a range's rects into lines", () => {
		const lines = mergeLines([
			{ left: 10, right: 40, top: 0, bottom: 20 },
			{ left: 40, right: 90, top: 1, bottom: 19 },
			{ left: 0, right: 30, top: 29, bottom: 49 },
			{ left: 5, right: 5.2, top: 60, bottom: 80 },
		]);
		assert.deepEqual(lines, [{ x1: 10, x2: 90, top: 0, bottom: 20 }, { x1: 0, x2: 30, top: 29, bottom: 49 }]);
	});
});

// ─── the note's plain text ───────────────────────────────────────────────────

const schema = new Schema({
	nodes: {
		doc: { content: "block+" },
		paragraph: { group: "block", content: "inline*" },
		heading: { group: "block", content: "inline*", attrs: { level: { default: 1 } } },
		orderedList: { group: "block", content: "listItem+", attrs: { start: { default: 1 } } },
		bulletList: { group: "block", content: "listItem+" },
		listItem: { content: "paragraph block*" },
		hardBreak: { group: "inline", inline: true },
		text: { group: "inline" },
	},
});
const p = (text: string) => schema.node("paragraph", null, text ? [schema.text(text)] : []);
const li = (text: string) => schema.node("listItem", null, [p(text)]);

describe("noteText (what a read sends, what anchors match)", () => {
	const doc = schema.node("doc", null, [
		schema.node("heading", { level: 1 }, [schema.text("Ideas")]),
		p("Video Ideas:"),
		schema.node("orderedList", { start: 1 }, [li("college is becoming worthless"), li("AI is making people dumber")]),
	]);

	it("joins blocks with blank lines and leads list items with their markers", () => {
		assert.equal(noteText(doc).text, "# Ideas\n\nVideo Ideas:\n\n1. college is becoming worthless\n\n2. AI is making people dumber");
	});

	it("maps a quote back to the document range of its words", () => {
		const text = noteText(doc);
		const range = quoteRange(text, "AI is making people dumber")!;
		assert.equal(doc.textBetween(range.from, range.to), "AI is making people dumber");
		const at = text.text.indexOf("college");
		const anchor = anchorForSpan(text.text, at, at + "college is becoming".length);
		const resolved = anchorRange(text, anchor)!;
		assert.equal(doc.textBetween(resolved.from, resolved.to), "college is becoming");
		assert.equal(textRange(text, 3, 3), null);
		assert.equal(quoteRange(text, "not here"), null);
	});

	it("an inline reply goes after the top-level block holding its passage", () => {
		const text = noteText(doc);
		const range = quoteRange(text, "Video Ideas:")!;
		assert.equal(blockEnd(doc, range.from), doc.child(0).nodeSize + doc.child(1).nodeSize);
		// In a list: under that item's own paragraph, inside the item.
		const item = quoteRange(text, "AI is making people dumber")!;
		const end = blockEnd(doc, item.from);
		const $end = doc.resolve(end);
		assert.equal($end.parent.type.name, "listItem");
		assert.equal($end.nodeBefore?.textContent, "AI is making people dumber");
	});
});

