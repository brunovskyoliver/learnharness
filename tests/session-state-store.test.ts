import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SessionStateStore, type UiStorage } from "../components/session-state-store.ts";

function storage(): UiStorage {
	const values = new Map<string, string>();
	return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe("durable session UI state", () => {
	it("restores drafts, selection, confidence, expansions and reading anchor on a new mount", () => {
		const disk = storage();
		const first = new SessionStateStore("account-a", "chat-a", () => disk);
		const state = { composer: "unsent", thinking: "working", question: { selected: [1, 3], confidence: 4 }, "call-1/open": true, reading: { id: "message-5", offset: -24, top: 800, bottom: false } };
		for (const [key, value] of Object.entries(state)) first.set(key, value);
		first.flush();
		const reopened = new SessionStateStore("account-a", "chat-a", () => disk);
		for (const [key, value] of Object.entries(state)) assert.deepEqual(reopened.get(key), value);
		assert.equal(new SessionStateStore("account-b", "chat-a", () => disk).get("composer"), undefined);
		assert.equal(new SessionStateStore("account-a", "chat-b", () => disk).get("composer"), undefined);
	});
	it("publishes only changed fields and durably clears sent drafts", () => {
		const disk = storage();
		const store = new SessionStateStore("a", "b", () => disk);
		let renders = 0;
		const unsubscribe = store.subscribe("composer", () => renders++);
		store.set("composer", "draft");
		store.set("composer", "draft");
		store.set("reading", { top: 200 });
		assert.equal(renders, 1);
		unsubscribe();
		store.set("composer", "");
		store.flush();
		assert.equal(new SessionStateStore("a", "b", () => disk).get("composer"), "");
	});
	it("ignores malformed/old state and survives disabled or full storage", () => {
		for (const raw of ["broken", '{"version":9,"values":{"composer":"old"}}', '{"version":1,"values":[]}']) {
			assert.equal(new SessionStateStore("a", "b", () => ({ getItem: () => raw, setItem() {} })).get("composer"), undefined);
		}
		const store = new SessionStateStore("a", "b", () => { throw Error("disabled"); });
		store.set("composer", "safe in memory");
		assert.doesNotThrow(() => store.flush());
		assert.equal(store.get("composer"), "safe in memory");
	});
});
