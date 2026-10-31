/** Feature 010: version names and the last version seen, on the store and routes. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-page-names-")));
process.env.LH_DATA_DIR = dir;
const { libraryStore: store } = await import("../src/store/library.ts");
const { isRefusal, pageVersionName } = await import("../src/core/library.ts");
const api = await import("../src/server/library.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
	for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
});

const makePage = async (content = "start") => {
	const made = await store.createPage("Notes", content, { author: "learner" });
	assert.ok(!isRefusal(made));
	return made.item.id;
};
const req = (body: unknown, method = "PATCH") => new Request("http://localhost/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const revise = (id: string, base: number, text: string) => store.revisePageAsAgent(id, { baseVersion: base, chatId: "c", toolCallId: `t-${base}-${text}`, apply: () => text });

describe("version names", () => {
	it("validate: trimmed, one line, 1 to 80 characters", () => {
		assert.equal(pageVersionName("  Before exam "), "Before exam");
		assert.equal(pageVersionName(""), null);
		assert.equal(pageVersionName(null), null);
		assert.equal(pageVersionName("a\nb"), "invalid");
		assert.equal(pageVersionName("x".repeat(81)), "invalid");
		assert.equal(pageVersionName(3), "invalid");
	});
	it("are listed, survive, clear, and change no text or log", async () => {
		const id = await makePage();
		const log = fs.readFileSync(path.join(dir, "library", "pages", id, "versions.jsonl"), "utf8");
		const named = await api.pageVersionNameResponse(req({ name: "Before exam" }), id, "1");
		assert.equal(named.status, 200);
		assert.equal(((await named.json()) as { version: { name: string } }).version.name, "Before exam");
		assert.equal((await store.listPageVersions(id))![0]!.name, "Before exam");
		assert.equal(fs.readFileSync(path.join(dir, "library", "pages", id, "versions.jsonl"), "utf8"), log, "the log is untouched");
		assert.equal((await store.listPageVersions(id))!.length, 1, "no version added");
		assert.equal((await api.pageVersionNameResponse(req({ name: null }), id, "1")).status, 200);
		assert.equal((await store.listPageVersions(id))![0]!.name, undefined);
	});
	it("refuse a bad name and a missing version", async () => {
		const id = await makePage();
		assert.equal((await api.pageVersionNameResponse(req({ name: "a\nb" }), id, "1")).status, 400);
		assert.equal((await api.pageVersionNameResponse(req({ name: "x" }), id, "9")).status, 404);
		assert.equal((await api.pageVersionNameResponse(req({ name: "x" }), "lib_none", "1")).status, 404);
	});
});

describe("seen", () => {
	it("a page never seen counts as seen up to its head", async () => {
		const id = await makePage();
		await revise(id, 1, "agent text");
		const seen = await store.readPageSeen(id);
		assert.deepEqual(seen, { version: 2, unseen: [] });
	});
	it("lists tutor revisions since, oldest first, and moves only forward", async () => {
		const id = await makePage();
		assert.deepEqual(await store.readPageSeen(id), { version: 1, unseen: [] });
		await revise(id, 1, "agent one");
		await store.commitPageVersion(id, { base: 2, rev: 0, content: "learner" });
		await revise(id, 3, "agent two");
		const seen = await store.readPageSeen(id);
		assert.ok(seen !== "missing");
		assert.deepEqual(seen.unseen.map((v) => v.n), [2, 4]);
		assert.deepEqual(await store.markPageSeen(id, 99), { version: 4 }, "never past the head");
		assert.deepEqual(await store.markPageSeen(id, 2), { version: 4 }, "never back");
		const res = await api.pageMarkSeenResponse(req({ version: 4 }, "PUT"), id);
		assert.equal(res.status, 200);
		assert.deepEqual(await (await api.pageSeenResponse(id)).json(), { version: 4, unseen: [] });
	});
	it("an agent-created page is never highlighted", async () => {
		const made = await store.createPage("Agent page", "by the tutor", { author: "agent", chatId: "c", toolCallId: "t1" });
		assert.ok(!isRefusal(made));
		assert.deepEqual(await store.readPageSeen(made.item.id), { version: 1, unseen: [] });
	});
	it("undo-agent is a cause the client may send", async () => {
		const id = await makePage();
		const res = await api.pageCommitResponse(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ base: 1, rev: 0, content: "undone", cause: "undo-agent" }) }), id);
		assert.equal(res.status, 201);
		assert.equal((await store.listPageVersions(id))![0]!.cause, "undo-agent");
	});
});
