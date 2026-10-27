import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { unitOffsets, unitOfAnchor, windowStart, WINDOW_BUDGET } from "../components/transcript-window.ts";
import type { LhViewMessage } from "../src/core/index.ts";

function user(id: string, text: string): LhViewMessage {
	return { id, role: "user", parts: [{ type: "text", text }] } as LhViewMessage;
}
function teacher(id: string, parts: Array<Record<string, unknown>>): LhViewMessage {
	return { id, role: "assistant", parts } as unknown as LhViewMessage;
}
const prose = (id: string, chars: number) => ({ type: "text", id, text: "x".repeat(chars) });

describe("transcript window (load-speed round, 2026-10-27)", () => {
	it("flat units: one per part, one for a message without parts", () => {
		const view = [user("u1", "hi"), teacher("a1", [prose("a1-t0", 10), { type: "step-start" }, prose("a1-t1", 10)]), teacher("a2", [])];
		assert.deepEqual(unitOffsets(view), [0, 1, 4, 5]);
	});

	it("a short session renders whole", () => {
		const view = [user("u1", "hi"), teacher("a1", [prose("a1-t0", 500)])];
		assert.equal(windowStart(view, unitOffsets(view).at(-1)!), 0);
	});

	it("a long session starts inside the tail and each chunk moves further back to zero", () => {
		const view: LhViewMessage[] = [];
		for (let i = 0; i < 20; i++) {
			view.push(user(`u${i}`, "question"));
			view.push(teacher(`a${i}`, Array.from({ length: 6 }, (_, p) => prose(`a${i}-t${p}`, 1_000))));
		}
		const total = unitOffsets(view).at(-1)!;
		let from = windowStart(view, total);
		assert.ok(from > 0 && from < total - 5, `tail window ${from} of ${total}`);
		const seen = [from];
		while (from > 0) {
			const next = windowStart(view, from);
			assert.ok(next < from, "every chunk makes progress");
			from = next;
			seen.push(from);
		}
		assert.ok(seen.length > 3, "several chunks, not one jump");
	});

	it("never heads the window with a bare step separator", () => {
		const parts = [prose("a-t0", WINDOW_BUDGET), { type: "step-start" }, prose("a-t1", WINDOW_BUDGET / 2), { type: "step-start" }, prose("a-t2", WINDOW_BUDGET / 2)];
		const view = [teacher("a", parts)];
		const from = windowStart(view, parts.length);
		assert.notEqual((parts[from] as { type: string }).type, "step-start");
	});

	it("user rows and marker cards move as one block", () => {
		const view = [teacher("a0", [prose("a0-t0", 100)]), user("u1", "y".repeat(WINDOW_BUDGET)), teacher("a1", [prose("a1-t0", 100)])];
		assert.equal(windowStart(view, unitOffsets(view).at(-1)!), 1);
	});

	it("finds a reading anchor by part id and by its message anchor", () => {
		const view = [user("u1", "q"), teacher("a1", [{ type: "step-start" }, prose("msg_abc-t0", 10)])];
		assert.equal(unitOfAnchor(view, "msg_abc-t0"), 2);
		assert.equal(unitOfAnchor(view, "message-msg_abc"), 2);
		assert.equal(unitOfAnchor(view, "message-gone"), -1);
	});
});
