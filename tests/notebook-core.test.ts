/** Feature 024 core: companion validation, anchoring, pace, layout, counts, sides. Pure. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	anchorForSpan, applyCompanionPatch, assignSide, blockIndexAt, effectiveLayout, emptyCompanion, messageTextProblem, NOTEBOOK_LIMITS, paceDelay,
	parseCompanion, parseCompanionPatch, parseThreadAnchor, quoteOccurs, replyCount, replyCountLabel, resolveAnchor, textHash, visibleThreads,
	type NotebookThread,
} from "../src/core/notebook.ts";
import { FAUX_SKETCH } from "../src/agent/subagents/notebook.ts";

const NOTE = "Entropy always rises in a closed system.\n\nSo a cup of tea cools down. Heat flows from hot to cold.\n\nEntropy always rises, the book says.";

const thread = (over: Partial<NotebookThread> = {}): NotebookThread => ({
	id: "thr_1", anchor: { quote: "tea", prefix: "", suffix: "", block: 1 }, placement: "margin", side: "right", status: "open", origin: "read",
	createdAt: "2026-11-06T10:00:00.000Z", updatedAt: "2026-11-06T10:00:00.000Z",
	messages: [{ id: "m1", author: "ai", text: "Why?", at: "2026-11-06T10:00:00.000Z" }],
	...over,
});

describe("anchoring", () => {
	it("finds the exact quote and uses context to choose between repeats", () => {
		const second = NOTE.lastIndexOf("Entropy always rises");
		const anchor = anchorForSpan(NOTE, second, second + "Entropy always rises".length);
		assert.equal(anchor.block, 2);
		const found = resolveAnchor(NOTE, anchor);
		assert.ok(!("detached" in found));
		assert.equal(found.how, "exact");
		assert.equal(found.start, second);
		const first = resolveAnchor(NOTE, { ...anchorForSpan(NOTE, 0, 20) });
		assert.ok(!("detached" in first) && first.start === 0);
	});

	it("ignores case and spacing in the exact tier", () => {
		const found = resolveAnchor(NOTE, { quote: "a  CUP of\ntea", prefix: "", suffix: "" });
		assert.ok(!("detached" in found));
		assert.equal(NOTE.slice(found.start, found.end), "a cup of tea");
	});

	it("falls back to the text between prefix and suffix when the quote was edited", () => {
		const anchor = anchorForSpan(NOTE, NOTE.indexOf("a cup of tea"), NOTE.indexOf("a cup of tea") + "a cup of tea".length);
		const edited = NOTE.replace("a cup of tea", "a mug of coffee");
		const found = resolveAnchor(edited, anchor);
		assert.ok(!("detached" in found));
		assert.equal(found.how, "context");
		assert.equal(edited.slice(found.start, found.end), "a mug of coffee");
	});

	it("falls back to the nearest run of words, then to detached", () => {
		const anchor = { quote: "Heat flows from hot to cold", prefix: "zzzzzzzzzzzz", suffix: "yyyyyyyyyyyy" };
		const edited = NOTE.replace("Heat flows from hot to cold", "Heat always flows from hot to cold");
		const found = resolveAnchor(edited, anchor);
		assert.ok(!("detached" in found));
		assert.equal(found.how, "fuzzy");
		assert.match(edited.slice(found.start, found.end), /flows from hot to cold/);
		assert.deepEqual(resolveAnchor("Something else entirely now.", anchor), { detached: true });
	});

	it("counts paragraphs by blank lines and checks verbatim quotes", () => {
		assert.equal(blockIndexAt(NOTE, 0), 0);
		assert.equal(blockIndexAt(NOTE, NOTE.indexOf("So a cup")), 1);
		assert.equal(quoteOccurs(NOTE, "Heat flows from hot to cold."), true);
		assert.equal(quoteOccurs(NOTE, "heat flows"), false);
		assert.equal(quoteOccurs(NOTE, "   "), false);
	});
});

describe("pace, layout, counts", () => {
	it("reads after 1600 ms at Regular and twice that at Slow", () => {
		assert.equal(paceDelay("regular"), 1600);
		assert.equal(paceDelay("slow"), 3200);
	});
	it("falls back to Marks only below 768px", () => {
		assert.equal(effectiveLayout("both", 1440), "both");
		assert.equal(effectiveLayout("right", 768), "right");
		assert.equal(effectiveLayout("both", 767), "marks");
		assert.equal(effectiveLayout("right", 390), "marks");
	});
	it("counts replies after the first message", () => {
		assert.equal(replyCount(thread()), 0);
		assert.equal(replyCountLabel(0), null);
		assert.equal(replyCountLabel(1), "1 reply");
		assert.equal(replyCountLabel(2), "2 replies");
		const two = thread({ messages: [...thread().messages, { id: "m2", author: "user", text: "Because", at: "x" }, { id: "m3", author: "ai", text: "Ok", at: "x" }] });
		assert.equal(replyCountLabel(replyCount(two)), "2 replies");
	});
	it("shows only open threads", () => {
		assert.deepEqual(visibleThreads({ threads: [thread(), thread({ id: "thr_2", status: "resolved" }), thread({ id: "thr_3", status: "dismissed" })] }).map((t) => t.id), ["thr_1"]);
	});
});

describe("sides", () => {
	it("puts everything right outside Both margins", () => {
		assert.equal(assignSide([thread({ side: "right" })], "right", 3), "right");
		assert.equal(assignSide([thread({ side: "right" })], "marks", 3), "right");
	});
	it("alternates with the nearest open margin thread above", () => {
		assert.equal(assignSide([], "both", 0), "right");
		assert.equal(assignSide([thread({ side: "right", anchor: { quote: "a", prefix: "", suffix: "", block: 1 } })], "both", 2), "left");
		assert.equal(assignSide([thread({ side: "left", anchor: { quote: "a", prefix: "", suffix: "", block: 1 } })], "both", 2), "right");
		// A thread below doesn't count; a resolved one doesn't either.
		assert.equal(assignSide([thread({ side: "right", anchor: { quote: "a", prefix: "", suffix: "", block: 5 } })], "both", 2), "right");
		assert.equal(assignSide([thread({ side: "right", status: "resolved" })], "both", 2), "right");
	});
});

describe("companion validation", () => {
	it("round-trips a full companion", () => {
		const companion = { ...emptyCompanion("pg1"), mode: "ask" as const, instruction: "Only hints", reviewerId: "examiner", threads: [thread({ messages: [{ id: "m1", author: "ai" as const, text: "See", at: "t", sketch: FAUX_SKETCH, runId: "nbr_1", state: "stopped" as const }] })], chat: [{ id: "c1", author: "user" as const, text: "Hi", at: "t" }], readCursor: { textHash: textHash(NOTE), at: "t" } };
		const parsed = parseCompanion(JSON.parse(JSON.stringify(companion)), "pg1");
		assert.ok(parsed.ok);
		assert.deepEqual(parsed.companion, companion);
	});
	it("refuses a newer version and calls anything malformed damaged", () => {
		assert.deepEqual(parseCompanion({ v: 2, pageId: "pg1" }, "pg1"), { ok: false, reason: "future-version", version: 2 });
		for (const bad of [null, [], { v: 1 }, { v: 1, pageId: "other", instruction: "", threads: [], chat: [] }, { ...emptyCompanion("pg1"), threads: [{ id: "x" }] }, { ...emptyCompanion("pg1"), mode: "loud" }]) {
			const parsed = parseCompanion(bad, "pg1");
			assert.ok(!parsed.ok && parsed.reason === "damaged", JSON.stringify(bad));
		}
	});
	it("parses anchors and patches strictly", () => {
		assert.deepEqual(parseThreadAnchor({ quote: "x", prefix: "", suffix: "", block: 2 }), { quote: "x", prefix: "", suffix: "", block: 2 });
		assert.equal(parseThreadAnchor({ quote: " ", prefix: "", suffix: "" }), null);
		assert.equal(parseThreadAnchor({ quote: "x", prefix: 1, suffix: "" }), null);
		assert.equal(parseThreadAnchor({ quote: "x".repeat(NOTEBOOK_LIMITS.quote + 1), prefix: "", suffix: "" }), null);
		assert.deepEqual(parseCompanionPatch({ mode: "ask", instruction: "hi", reviewerId: "editor" }), { ok: true, patch: { mode: "ask", instruction: "hi", reviewerId: "editor" } });
		assert.equal(parseCompanionPatch({}).ok, false);
		assert.equal(parseCompanionPatch({ mode: "shout" }).ok, false);
		assert.equal(parseCompanionPatch({ instruction: "x".repeat(501) }).ok, false);
		assert.equal(parseCompanionPatch({ reviewerId: "a b" }).ok, false);
		const cleared = applyCompanionPatch({ ...emptyCompanion("p"), mode: "ask", reviewerId: "editor" }, { mode: null, reviewerId: null });
		assert.equal(cleared.mode, undefined);
		assert.equal(cleared.reviewerId, undefined);
	});
	it("limits message text by bytes with a 409", () => {
		assert.equal(messageTextProblem("hi"), null);
		assert.equal(messageTextProblem("  ")?.status, 400);
		assert.equal(messageTextProblem(42)?.status, 400);
		assert.equal(messageTextProblem("é".repeat(10_001))?.status, 409);
	});
});
