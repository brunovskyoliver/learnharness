import assert from "node:assert/strict";
import test from "node:test";
import { reloadRecoveryKey, saveReloadRecovery, takeReloadRecovery, type ReloadRecovery } from "../components/reload-recovery.ts";
import { SessionStateStore } from "../components/session-state-store.ts";

function memoryStorage() {
	const data = new Map<string, string>();
	return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}
const recovery: ReloadRecovery = { version: 1, overlay: { kind: "chains", selectMode: true }, draft: { kind: "home", text: "Unsent reasoning\nwith a second line", mode: "practice", picks: [{ id: "n_one", name: "Evidence", statement: "Evidence changes a belief." }] } };

test("reload recovery keeps exact draft context and consumes the requested overlay once", () => {
	const storage = memoryStorage();
	const key = reloadRecoveryKey("account-a", "/");
	saveReloadRecovery(storage, key, recovery);
	assert.deepEqual(takeReloadRecovery(storage, key), recovery);
	assert.equal(takeReloadRecovery(storage, key), undefined);
});

test("recovery markers are separate for account, route and creation mode query", () => {
	const storage = memoryStorage();
	const key = reloadRecoveryKey("account-a", "/chat/new?mode=practice");
	saveReloadRecovery(storage, key, recovery);
	for (const other of [reloadRecoveryKey("account-b", "/chat/new?mode=practice"), reloadRecoveryKey("account-a", "/chat/new"), reloadRecoveryKey("account-a", "/")]) assert.equal(takeReloadRecovery(storage, other), undefined);
	assert.deepEqual(takeReloadRecovery(storage, key), recovery);
});

test("denied writes and failed readback cannot be reported as a safe reload", () => {
	assert.throws(() => saveReloadRecovery({ getItem: () => null, setItem: () => { throw new Error("denied"); }, removeItem() {} }, "key", recovery));
	assert.throws(() => saveReloadRecovery({ getItem: () => "stale", setItem() {}, removeItem() {} }, "key", recovery));
});

test("corrupt recovery data is removed without restoring controls", () => {
	for (const raw of ["invalid json", '{"version":1,"overlay":null}', JSON.stringify({ ...recovery, draft: { ...recovery.draft, picks: [null] } }), JSON.stringify({ version: 1, overlay: { kind: "chains", selectMode: "yes" } })]) {
		const storage = memoryStorage(); storage.setItem("key", raw);
		assert.equal(takeReloadRecovery(storage, "key"), undefined);
		assert.equal(storage.getItem("key"), null);
	}
});

test("session reload verification saves the latest composer and question fields before debounce", () => {
	const storage = memoryStorage();
	const session = new SessionStateStore("account-a", "chat-a", () => storage);
	session.set("composer", "last keystroke");
	session.set("question-answer", { text: "unfinished thinking", selected: [2], confidence: 3 });
	assert.equal(session.persistForReload(), true);
	const restored = new SessionStateStore("account-a", "chat-a", () => storage);
	assert.equal(restored.get("composer"), "last keystroke");
	assert.deepEqual(restored.get("question-answer"), { text: "unfinished thinking", selected: [2], confidence: 3 });
});

test("session reload verification refuses unavailable or silently dropped persistence", () => {
	for (const storage of [undefined, { getItem: () => null, setItem() {} }, { getItem: () => null, setItem: () => { throw new Error("full"); } }]) {
		const session = new SessionStateStore("account-a", "chat-a", () => storage);
		session.set("composer", "keep this draft reachable");
		assert.equal(session.persistForReload(), false);
		assert.equal(session.get("composer"), "keep this draft reachable");
		session.flush();
	}
});


test("graph download recovery preserves the home draft in the same one-shot envelope", () => {
	const storage = memoryStorage();
	const graphRecovery: ReloadRecovery = { ...recovery, overlay: { kind: "graph" } };
	saveReloadRecovery(storage, "graph", graphRecovery);
	assert.deepEqual(takeReloadRecovery(storage, "graph"), graphRecovery);
	assert.equal(takeReloadRecovery(storage, "graph"), undefined);
});
