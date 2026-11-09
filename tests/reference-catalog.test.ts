import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { invalidateCatalog, itemStatuses, liveLibrary } from "../components/reference-catalog.ts";

// Feature 027, T012 + T054: an item's state from the live list and the Trash (research R8, R15).

let calls: string[] = [];
let respond: (url: string) => Response | Promise<Response>;
globalThis.fetch = (async (input: string | URL) => {
	const url = String(input);
	calls.push(url);
	return respond(url);
}) as typeof fetch;
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const item = (id: string) => ({ id, name: `${id}.md`, kind: "markdown", size: 1, createdAt: "", updatedAt: "", origin: { type: "upload" } });

beforeEach(() => {
	invalidateCatalog();
	calls = [];
});

describe("reference catalog", () => {
	it("live, trashed, deleted and removed (026's fromRepo)", async () => {
		respond = (url) => url.endsWith("/trash")
			? ok({ entries: [{ id: "tr_1", name: "x", kind: "markdown", trashedAt: "", folderId: null, items: [item("t")], folders: [] }] })
			: ok({ items: [item("a")], folders: [] });
		const states = await itemStatuses([{ itemId: "a" }, { itemId: "t" }, { itemId: "d" }, { itemId: "r", fromRepo: true }]);
		assert.equal(states.get("a")!.state, "live");
		assert.equal(states.get("a")!.item!.name, "a.md");
		assert.deepEqual(states.get("t"), { state: "trashed", trashEntryId: "tr_1" });
		assert.deepEqual(states.get("d"), { state: "deleted" });
		assert.deepEqual(states.get("r"), { state: "removed" });
	});
	it("a file removed from its repo is removed, with the paths it was named by (T055)", async () => {
		respond = () => ok({ items: [item("a")], folders: [], removed: [{ id: "r", names: ["Lecture notes/week2/notes.md"] }] });
		const states = await itemStatuses([{ itemId: "r" }]);
		assert.deepEqual(states.get("r"), { state: "removed", paths: ["Lecture notes/week2/notes.md"] });
		assert.deepEqual(calls, ["/api/library"], "no Trash read for it");
	});
	it("a failed list read is unknown, never deleted", async () => {
		respond = () => new Response("", { status: 500 });
		const states = await itemStatuses([{ itemId: "a" }]);
		assert.deepEqual(states.get("a"), { state: "unknown" });
	});
	it("a failed Trash read leaves missing ids unknown", async () => {
		respond = (url) => (url.endsWith("/trash") ? Promise.reject(new Error("offline")) : ok({ items: [item("a")], folders: [] }));
		const states = await itemStatuses([{ itemId: "a" }, { itemId: "b" }]);
		assert.equal(states.get("a")!.state, "live");
		assert.deepEqual(states.get("b"), { state: "unknown" });
	});
	it("reads the Trash only when the live list lacks an id, and shares reads within the TTL", async () => {
		respond = () => ok({ items: [item("a")], folders: [] });
		await itemStatuses([{ itemId: "a" }]);
		await itemStatuses([{ itemId: "a" }]);
		await liveLibrary();
		assert.deepEqual(calls, ["/api/library"]);
		invalidateCatalog();
		await liveLibrary();
		assert.equal(calls.length, 2, "library-changed drops the cache");
	});
});
