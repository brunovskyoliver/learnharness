/** Features 016-017 on the real store: rename pins, page texts, appending with
 *  the draft first, and that the new files stay additive. No model. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-note-store-")));
process.env.LH_DATA_DIR = dir;
const { PATHS } = await import("../config.ts");
const { libraryStore: store } = await import("../src/store/library.ts");
const { isRefusal, PAGE_MAX_BYTES, CATALOG_VERSION } = await import("../src/core/library.ts");
const { resolveWikiTarget, wikiTable } = await import("../src/core/note-links.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
	for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
});

const page = async (name: string, content = "") => {
	const made = await store.createPage(name, content, { author: "learner" });
	assert.ok(!isRefusal(made));
	return made.item;
};
const resolve = async (from: string, target: string) => resolveWikiTarget(target, wikiTable(await store.catalog()), (await store.wikiPins())[from]);

describe("a rename and the links to it", () => {
	it("survives the rename, and a new page taking the old name doesn't capture it", async () => {
		const target = await page("Waves");
		const linker = await page("Index", "See [[Waves]].");
		await store.rename(target.id, "Oscillations");
		assert.equal((await resolve(linker.id, "Waves")).id, target.id);
		const usurper = await page("Waves");
		assert.equal((await resolve(linker.id, "Waves")).id, target.id, "the link still means the renamed page");
		assert.equal((await resolve("someone-else", "Waves")).id, usurper.id, "a link written elsewhere means the page with that name now");
		assert.equal(await store.readText(linker), "See [[Waves]].", "the linking page's bytes are never rewritten");
		assert.equal((await store.listPageVersions(linker.id))!.length, 1, "and it gets no new version");
	});
	it("pins a link that's only in the draft", async () => {
		const target = await page("Waves");
		const linker = await page("Index", "start");
		await store.savePageDraft(linker.id, { base: 1, rev: 0, content: "[[Waves]]" });
		await store.rename(target.id, "Other");
		assert.deepEqual((await store.wikiPins())[linker.id], { waves: target.id });
	});
	it("pins nothing for a case-only rename or a page with no link, and writes no file then", async () => {
		const target = await page("Waves");
		await page("Plain", "no links");
		await store.rename(target.id, "WAVES");
		await store.rename(target.id, "Other");
		assert.equal(fs.existsSync(path.join(PATHS.library, "wiki-pins.json")), false);
	});
	it("a trashed target reads as deleted, a restored one as live, and a purged one stays deleted", async () => {
		const target = await page("Waves");
		const linker = await page("Index", "[[Waves]]");
		const entry = await store.trashItem(target.id);
		assert.equal((await resolve(linker.id, "Waves")).state, "deleted");
		await store.restoreTrash(entry!.id);
		assert.equal((await resolve(linker.id, "Waves")).id, target.id);
		const again = await store.trashItem(target.id);
		await store.purgeTrash(again!.id);
		assert.deepEqual([(await resolve(linker.id, "Waves")).state, await store.readText(linker)], ["deleted", "[[Waves]]"]);
	});
	it("leaves the catalog's version and shape as they were", async () => {
		await page("Waves");
		const raw = JSON.parse(fs.readFileSync(path.join(PATHS.library, "catalog.json"), "utf8")) as { version: number; items: Record<string, unknown>[] };
		assert.equal(raw.version, CATALOG_VERSION);
		assert.deepEqual(Object.keys(raw.items[0]!).sort(), ["createdAt", "headVersion", "id", "kind", "name", "origin", "size", "updatedAt"]);
	});
});

describe("page texts", () => {
	it("reads the draft over the head, lists its chats, and leaves out documents and trash", async () => {
		const a = await page("A", "head");
		await store.savePageDraft(a.id, { base: 1, rev: 0, content: "draft" });
		const b = await store.createPage("B", "b", { author: "learner", chatId: "chat_1" });
		assert.ok(!isRefusal(b));
		await store.revisePageAsAgent(b.item.id, { baseVersion: 1, chatId: "chat_2", apply: () => "b2" });
		const c = await page("C", "c");
		await store.trashItem(c.id);
		const texts = await store.pageTexts();
		assert.deepEqual(texts.map((t) => [t.item.name, t.text, t.chatIds]).sort(), [["A", "draft", []], ["B", "b2", ["chat_1", "chat_2"]]]);
	});
});

describe("appending a passage", () => {
	it("commits the draft as the learner's version first, then adds the block, losing nothing", async () => {
		const a = await page("A", "one");
		await store.savePageDraft(a.id, { base: 1, rev: 0, content: "one edited\n" });
		const result = await store.appendToPage(a.id, "> quote", { chatId: "c1" });
		assert.ok(typeof result === "object");
		assert.equal(await store.readText(a), "one edited\n\n> quote\n");
		const versions = (await store.listPageVersions(a.id))!;
		assert.deepEqual(versions.map((v) => [v.n, v.author, v.cause, v.chatId]), [[3, "learner", "passage", "c1"], [2, "learner", "save", undefined], [1, "learner", "save", undefined]]);
		assert.equal((await store.readPage(a.id))!.draft, null);
		assert.equal((await store.readPageVersion(a.id, 2))!.content, "one edited\n", "the draft is restorable");
	});
	it("refuses over the limit without touching text or draft, and an unknown page", async () => {
		const a = await page("A", "one");
		await store.savePageDraft(a.id, { base: 1, rev: 0, content: "draft" });
		assert.equal(await store.appendToPage(a.id, "x".repeat(PAGE_MAX_BYTES), {}), "too-large");
		assert.equal((await store.readPage(a.id))!.draft?.content, "draft");
		assert.equal((await store.listPageVersions(a.id))!.length, 1);
		assert.equal(await store.appendToPage("lib_none", "x", {}), "missing");
	});
	it("an emptied, deleted session leaves the text in place", async () => {
		const a = await page("A", "");
		await store.appendToPage(a.id, "> q\n>\n> [Lesson: T](/chat/c1#message-m1)", { chatId: "c1" });
		await store.unlinkChat("c1");
		assert.equal(await store.readText(a), "> q\n>\n> [Lesson: T](/chat/c1#message-m1)");
	});
});
