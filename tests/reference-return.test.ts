import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clearReturnPoint, HISTORY_MARK, HISTORY_OWN, isOwnPassageEntry, markNextEntry, readReturnPoint, RETURN_KEY, returnRoute, saveReturnPoint, stampPendingMark, type ReturnPoint } from "../components/reference-return.ts";

// Feature 027, T016: the return point (data-model.md ReturnPoint, research R9).

function memory() {
	const map = new Map<string, string>();
	return {
		map,
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => void map.set(key, value),
		removeItem: (key: string) => void map.delete(key),
	};
}

const point: ReturnPoint = { chatId: "chat_1", title: "Waves", messageId: "msg_1", chipKey: "0", pushed: "n1" };

describe("return point", () => {
	it("writes, reads and clears under lh:reference-return", () => {
		const store = memory();
		saveReturnPoint(point, store);
		assert.deepEqual(JSON.parse(store.map.get(RETURN_KEY)!), point);
		assert.deepEqual(readReturnPoint(store), point);
		clearReturnPoint(store);
		assert.equal(readReturnPoint(store), null);
		assert.equal(store.map.has(RETURN_KEY), false);
	});

	it("invalid JSON or a wrong shape reads as none", () => {
		const store = memory();
		store.setItem(RETURN_KEY, "{not json");
		assert.equal(readReturnPoint(store), null);
		store.setItem(RETURN_KEY, JSON.stringify({ ...point, chipKey: 3 }));
		assert.equal(readReturnPoint(store), null);
		store.setItem(RETURN_KEY, JSON.stringify({ ...point, chatId: "" }));
		assert.equal(readReturnPoint(store), null);
		store.setItem(RETURN_KEY, "null");
		assert.equal(readReturnPoint(store), null);
		assert.equal(readReturnPoint(null), null);
	});

	it("a storage that throws reads as none and never throws back", () => {
		const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
		assert.equal(readReturnPoint(broken), null);
		assert.doesNotThrow(() => saveReturnPoint(point, broken));
		assert.doesNotThrow(() => clearReturnPoint(broken));
	});
});

describe("history mark", () => {
	it("stamps the next entry once, keeping Next's own state", () => {
		const calls: unknown[] = [];
		const history = { state: { __NA: true, tree: [1] } as unknown, replaceState(data: unknown) { calls.push(data); this.state = data; } };
		markNextEntry("n1");
		stampPendingMark(history);
		assert.deepEqual(calls, [{ __NA: true, tree: [1], [HISTORY_MARK]: "n1", [HISTORY_OWN]: true }]);
		assert.equal(isOwnPassageEntry(history.state), true);
		stampPendingMark(history);
		assert.equal(calls.length, 1, "nothing pending, nothing written");
	});

	it("a null history.state still gets the mark", () => {
		const history = { state: null as unknown, replaceState(data: unknown) { this.state = data; } };
		markNextEntry("n2", false);
		stampPendingMark(history);
		assert.deepEqual(history.state, { [HISTORY_MARK]: "n2" });
		assert.equal(isOwnPassageEntry(history.state), false, "a tutor citation");
		assert.equal(isOwnPassageEntry(null), false);
	});
});

describe("the pill's way back", () => {
	it("router.back() when the current entry is the one the chip pushed", () => {
		assert.deepEqual(returnRoute(point, { [HISTORY_MARK]: "n1", __NA: true }), { type: "back" });
	});

	it("router.push(/chat/{id}) after a reload lost the mark, another entry, or none", () => {
		const push = { type: "push", href: "/chat/chat_1" };
		assert.deepEqual(returnRoute(point, null), push);
		assert.deepEqual(returnRoute(point, { __NA: true }), push);
		assert.deepEqual(returnRoute(point, { [HISTORY_MARK]: "other" }), push);
		assert.deepEqual(returnRoute({ ...point, chatId: "a b" }, null), { type: "push", href: "/chat/a%20b" });
	});
});
