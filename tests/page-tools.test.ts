/** page_create and page_revise (T063), on the real store and with no model. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-page-tools-")));
process.env.LH_DATA_DIR = dir;
const { libraryStore: store } = await import("../src/store/library.ts");
const { isRefusal, PAGE_MAX_BYTES } = await import("../src/core/library.ts");
const { applyPageEdits } = await import("../src/core/page-edits.ts");
const { PAGE_BLOCKED_PROBLEM, PAGE_BLOCKED_QUESTION, pageTools } = await import("../src/agent/tools/pages.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
	for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
});

let blocked: string | null = null;
beforeEach(() => { blocked = null; });
const tools = pageTools({ store, chatId: "chat_1", blocked: () => blocked });
type Result = { content: { text: string }[]; details: Record<string, unknown> };
let calls = 0;
const call = async (tool: "page_create" | "page_revise", input: unknown, id = `call_${++calls}`) => (await tools[tool]!.execute(id, input as never)) as unknown as Result;
const learnerPage = async (content = "start") => {
	const made = await store.createPage("Notes", content, { author: "learner" });
	assert.ok(!isRefusal(made));
	return made.item.id;
};
const head = async (id: string) => (await store.readPage(id))!.head;

describe("page_create", () => {
	it("makes an agent page linked to the chat, with the contract's output", async () => {
		const r = await call("page_create", { name: "Summary", content: "# S\n\n$x$" });
		const out = JSON.parse(r.content[0]!.text);
		assert.deepEqual(Object.keys(out), ["itemId", "name", "version"]);
		assert.equal(out.version, 1);
		const item = (await store.list()).find((i) => i.id === out.itemId)!;
		assert.deepEqual(item.origin, { type: "agent", chatId: "chat_1" });
		const versions = (await store.listPageVersions(out.itemId))!;
		assert.deepEqual([versions[0]!.author, versions[0]!.cause], ["agent", "agent-create"]);
		assert.equal(await store.readText(item), "# S\n\n$x$");
	});
	it("refuses a taken name with a free one, and content over the limit", async () => {
		await learnerPage();
		const taken = await call("page_create", { name: "notes", content: "x" });
		assert.match(taken.content[0]!.text, /notes \(2\) is free/);
		assert.equal(taken.details.outcome, "failed");
		assert.equal((await call("page_create", { name: "Big", content: "x".repeat(PAGE_MAX_BYTES + 1) })).details.outcome, "failed");
		assert.equal((await store.list()).length, 1);
	});
	it("a repeated toolCallId returns the same page", async () => {
		const a = await call("page_create", { name: "Once", content: "x" }, "same");
		const b = await call("page_create", { name: "Once", content: "x" }, "same");
		assert.equal(JSON.parse(a.content[0]!.text).itemId, JSON.parse(b.content[0]!.text).itemId);
		assert.equal((await store.list()).length, 1);
	});
});

describe("page_revise", () => {
	it("with content: a new agent version, restorable", async () => {
		const id = await learnerPage();
		const r = await call("page_revise", { item: id, baseVersion: 1, content: "agent" });
		assert.deepEqual(JSON.parse(r.content[0]!.text), { itemId: id, name: "Notes", version: 2 });
		const [newest] = (await store.listPageVersions(id))!;
		assert.deepEqual([newest!.author, newest!.cause, newest!.chatId], ["agent", "agent-revise", "chat_1"]);
		assert.ok(newest!.toolCallId);
		await store.restorePageVersion(id, 1);
		assert.equal((await head(id)).content, "start");
	});
	it("with edits, by name", async () => {
		await learnerPage("alpha beta");
		const r = await call("page_revise", { item: "Notes", baseVersion: 1, edits: [{ find: "alpha", replace: "$a$" }, { find: "beta", replace: "b" }] });
		assert.equal(r.details.version, 2);
		assert.equal((await store.readText((await store.list())[0]!)), "$a$ b");
	});
	it("a find matching zero or two times refuses, names it, and adds no version", async () => {
		const id = await learnerPage("a a b");
		const zero = await call("page_revise", { item: id, baseVersion: 1, edits: [{ find: "z", replace: "y" }] });
		assert.match(zero.content[0]!.text, /matches nothing.*z/);
		const two = await call("page_revise", { item: id, baseVersion: 1, edits: [{ find: "a", replace: "y" }] });
		assert.match(two.content[0]!.text, /more than once.*a/);
		assert.equal((await head(id)).n, 1);
	});
	it("needs exactly one of content or edits", async () => {
		const id = await learnerPage();
		for (const input of [{}, { content: "x", edits: [{ find: "s", replace: "t" }] }]) {
			assert.match((await call("page_revise", { item: id, baseVersion: 1, ...input })).content[0]!.text, /exactly one/);
		}
	});
	it("a stale base refuses after committing the draft as his version", async () => {
		const id = await learnerPage();
		await store.savePageDraft(id, { base: 1, rev: 0, content: "his unsaved words" });
		const r = await call("page_revise", { item: id, baseVersion: 1, content: "agent" });
		assert.equal(r.content[0]!.text, "The page is at version 2 (the learner's edits were saved). Read it and redo your edit.");
		assert.equal(r.details.outcome, "stale");
		assert.equal(r.details.savedLearnerVersion, 2);
		const versions = (await store.listPageVersions(id))!;
		assert.deepEqual(versions.map((v) => [v.n, v.author, v.cause]), [[2, "learner", "before-agent"], [1, "learner", "save"]]);
		assert.equal((await head(id)).content, "his unsaved words");
		assert.equal((await store.readPage(id))!.draft, null);
		const again = await call("page_revise", { item: id, baseVersion: 2, content: "agent" });
		assert.equal(again.details.version, 3);
		assert.equal((await store.readPageVersion(id, 2))!.content, "his unsaved words");
	});
	it("a draft equal to the head is not committed", async () => {
		const id = await learnerPage();
		const { rev } = await store.savePageDraft(id, { base: 1, rev: 0, content: "typing" }) as { rev: number };
		await store.savePageDraft(id, { base: 1, rev, content: "start" });
		assert.equal((await call("page_revise", { item: id, baseVersion: 1, content: "agent" })).details.version, 2);
	});
	it("a failed edit after a draft still keeps the draft", async () => {
		const id = await learnerPage();
		await store.savePageDraft(id, { base: 1, rev: 0, content: "his words" });
		const r = await call("page_revise", { item: id, baseVersion: 2, edits: [{ find: "nothing here", replace: "x" }] });
		assert.equal(r.details.outcome, "failed");
		assert.equal((await head(id)).content, "his words");
	});
	it("a repeated toolCallId returns the existing version, and no second one", async () => {
		const id = await learnerPage();
		const a = await call("page_revise", { item: id, baseVersion: 1, content: "agent" }, "repeat");
		const b = await call("page_revise", { item: id, baseVersion: 1, content: "agent" }, "repeat");
		assert.equal(a.details.version, b.details.version);
		assert.equal((await store.listPageVersions(id))!.length, 2);
	});
	it("refuses documents, tombstones and unknown names", async () => {
		async function* body() { yield new TextEncoder().encode("doc"); }
		const doc = await store.writeUpload("doc.md", body(), 3);
		assert.ok(!isRefusal(doc));
		assert.match((await call("page_revise", { item: doc.id, baseVersion: 1, content: "x" })).content[0]!.text, /only pages/);
		const id = await learnerPage();
		await store.remove(id);
		assert.match((await call("page_revise", { item: id, baseVersion: 1, content: "x" })).content[0]!.text, /deleted/);
		assert.match((await call("page_revise", { item: "ghost", baseVersion: 1, content: "x" })).content[0]!.text, /Nothing in the Library/);
		assert.equal(await fs.promises.readFile(path.join(dir, "files", "doc.md"), "utf8"), "doc");
	});
	it("over the limit refuses and keeps the page", async () => {
		const id = await learnerPage();
		assert.equal((await call("page_revise", { item: id, baseVersion: 1, content: "x".repeat(PAGE_MAX_BYTES + 1) })).details.outcome, "failed");
		assert.equal((await head(id)).n, 1);
	});
});

describe("during a pending question or active problem", () => {
	for (const sentence of [PAGE_BLOCKED_QUESTION, PAGE_BLOCKED_PROBLEM]) {
		it(`refuses: ${sentence}`, async () => {
			const id = await learnerPage();
			await store.savePageDraft(id, { base: 1, rev: 0, content: "his draft" });
			blocked = sentence;
			const created = await call("page_create", { name: "Answer", content: "the answer" });
			const revised = await call("page_revise", { item: id, baseVersion: 1, content: "the answer" });
			assert.equal(created.content[0]!.text, sentence);
			assert.equal(revised.content[0]!.text, sentence);
			assert.equal((await store.list()).length, 1, "no page made");
			assert.equal((await head(id)).n, 1, "no version made");
			assert.equal((await store.readPage(id))!.draft!.content, "his draft", "the draft is untouched");
		});
	}
});

describe("no text lost in any order", () => {
	it("draft then agent, agent then draft, restore in between: every text stays in history", async () => {
		const id = await learnerPage("v1");
		const { rev } = await store.savePageDraft(id, { base: 1, rev: 0, content: "learner a" }) as { rev: number };
		await call("page_revise", { item: id, baseVersion: 1, content: "agent x" });
		assert.ok(rev > 0);
		await call("page_revise", { item: id, baseVersion: 2, content: "agent b" });
		await store.savePageDraft(id, { base: 3, rev: 0, content: "learner c" });
		await store.restorePageVersion(id, 1);
		await call("page_revise", { item: id, baseVersion: 5, content: "agent d" });
		const versions = (await store.listPageVersions(id))!;
		const texts = await Promise.all(versions.map(async (v) => (await store.readPageVersion(id, v.n))!.content));
		for (const text of ["v1", "learner a", "agent b", "learner c", "agent d"]) assert.ok(texts.includes(text), text);
		assert.deepEqual(versions.map((v) => v.n), [...versions.map((v) => v.n)].sort((a, b) => b - a));
	});
});

describe("applyPageEdits", () => {
	it("applies in order and keeps every other byte", () => {
		assert.equal(applyPageEdits("a\r\n\n$b$  ", [{ find: "a", replace: "c" }, { find: "c\r", replace: "d\r" }]), "d\r\n\n$b$  ");
	});
	it("a later edit sees the earlier one; a replacement with $ is literal", () => {
		assert.equal(applyPageEdits("x", [{ find: "x", replace: "$& $1" }]), "$& $1");
	});
});
