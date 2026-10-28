/**
 * Home's Continue (feature 003): the drafted "Continue with {topic}" goes
 * only into an EMPTY composer; a saved draft is never replaced
 * (Principle III, owner 2026-10-28). The decision reads the session's
 * saved composer value, which the store loads synchronously from storage.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { continueDraftToApply } from "../components/chat.tsx";
import { SessionStateStore, type UiStorage } from "../components/session-state-store.ts";

const DRAFT = "Continue with Learning by gradient descent";

function storeWith(values: Record<string, unknown> | null): SessionStateStore {
	const data = new Map<string, string>();
	const storage: UiStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
	const store = new SessionStateStore("acct", "chat_x", () => storage);
	if (values) storage.setItem(store.storageKey, JSON.stringify({ version: 1, values }));
	return store;
}

describe("continueDraftToApply", () => {
	it("fills an empty composer", () => {
		assert.equal(continueDraftToApply(undefined, DRAFT), DRAFT);
		assert.equal(continueDraftToApply("", DRAFT), DRAFT);
		assert.equal(continueDraftToApply("  \n", DRAFT), DRAFT);
	});

	it("never replaces a draft", () => {
		assert.equal(continueDraftToApply("my half-written question", DRAFT), null);
	});

	it("does nothing without a draft to offer", () => {
		assert.equal(continueDraftToApply("", undefined), null);
	});

	it("reads the saved composer from the store, before any render", () => {
		assert.equal(continueDraftToApply(storeWith({ composer: "kept text" }).get("composer"), DRAFT), null);
		assert.equal(continueDraftToApply(storeWith(null).get("composer"), DRAFT), DRAFT);
	});
});
