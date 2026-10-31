/** Page versions and the draft (T049), against a real temp folder. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-library-pages-")));
process.env.LH_DATA_DIR = dir;
const { libraryStore: store } = await import("../src/store/library.ts");
const { isPageStale, isRefusal, PAGE_MAX_BYTES } = await import("../src/core/library.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
	for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
});

const page = async (content = "one") => {
	const made = await store.createPage("Notes", content, { author: "learner" });
	assert.ok(!isRefusal(made));
	return made.item.id;
};
const pagesDir = (id: string) => path.join(dir, "library", "pages", id);
const numbers = async (id: string) => (await store.listPageVersions(id))!.map((v) => v.n);
const commit = (id: string, base: number, rev: number, content: string) => store.commitPageVersion(id, { base, rev, content });

describe("versions", () => {
	it("are append-only, keep their text and move the head", async () => {
		const id = await page();
		const before = fs.readFileSync(path.join(pagesDir(id), "v1.md"), "utf8");
		const second = await commit(id, 1, 0, "two");
		assert.ok(typeof second === "object" && "created" in second && second.created);
		assert.deepEqual(await numbers(id), [2, 1]);
		assert.equal(fs.readFileSync(path.join(pagesDir(id), "v1.md"), "utf8"), before);
		assert.equal((await store.readPage(id))!.head.content, "two");
		assert.equal((await store.readPage(id))!.item.size, 3);
		assert.equal((await store.readPageVersion(id, 1))!.content, "one");
	});
	it("a content file with no line is skipped and its number never reused", async () => {
		const id = await page();
		fs.writeFileSync(path.join(pagesDir(id), "v2.md"), "crashed before its line");
		assert.deepEqual(await numbers(id), [1]);
		assert.equal((await store.readPage(id))!.head.content, "one");
		await commit(id, 1, 0, "next");
		assert.deepEqual(await numbers(id), [3, 1]);
		assert.equal(fs.readFileSync(path.join(pagesDir(id), "v2.md"), "utf8"), "crashed before its line");
	});
	it("a torn last line is not a version, and the next append starts clean", async () => {
		const id = await page();
		fs.appendFileSync(path.join(pagesDir(id), "versions.jsonl"), '{"n":2,"au');
		assert.deepEqual(await numbers(id), [1]);
		await commit(id, 1, 0, "next");
		assert.deepEqual(await numbers(id), [2, 1]);
	});
	it("saving text equal to the head makes no version", async () => {
		const id = await page("same");
		const result = await commit(id, 1, 0, "same");
		assert.ok(typeof result === "object" && "created" in result && !result.created);
		assert.deepEqual(await numbers(id), [1]);
	});
});

describe("the draft", () => {
	it("is a compare-and-swap that answers stale and changes nothing", async () => {
		const id = await page();
		const first = await store.savePageDraft(id, { base: 1, rev: 0, content: "mine" });
		assert.ok(typeof first === "object" && "rev" in first && first.rev > 0);
		const stale = await store.savePageDraft(id, { base: 1, rev: 0, content: "other tab" });
		assert.ok(isPageStale(stale));
		assert.equal(stale.draft!.content, "mine");
		assert.equal(stale.head.n, 1);
		assert.equal((await store.readPage(id))!.draft!.content, "mine");
		const second = await store.savePageDraft(id, { base: 1, rev: (first as { rev: number }).rev, content: "mine 2" });
		assert.ok(typeof second === "object" && "rev" in second && second.rev > (first as { rev: number }).rev);
	});
	it("a save against an old base or rev is stale", async () => {
		const id = await page();
		await commit(id, 1, 0, "two");
		assert.ok(isPageStale(await commit(id, 1, 0, "from an old tab")));
		assert.ok(isPageStale(await store.savePageDraft(id, { base: 1, rev: 0, content: "x" })));
		assert.deepEqual(await numbers(id), [2, 1]);
	});
	it("over the limit is too-large, for a draft and a version, keeping what was there", async () => {
		const id = await page();
		const first = await store.savePageDraft(id, { base: 1, rev: 0, content: "kept" }) as { rev: number };
		const big = "x".repeat(PAGE_MAX_BYTES + 1);
		assert.equal(await store.savePageDraft(id, { base: 1, rev: first.rev, content: big }), "too-large");
		assert.equal(await commit(id, 1, first.rev, big), "too-large");
		assert.equal((await store.readPage(id))!.draft!.content, "kept");
		const exact = await store.savePageDraft(id, { base: 1, rev: first.rev, content: "x".repeat(PAGE_MAX_BYTES) });
		assert.ok(typeof exact === "object" && "rev" in exact);
	});
	it("a commit clears it", async () => {
		const id = await page();
		const { rev } = await store.savePageDraft(id, { base: 1, rev: 0, content: "d" }) as { rev: number };
		await commit(id, 1, rev, "d");
		assert.equal((await store.readPage(id))!.draft, null);
	});
	it("a conflict commit keeps the other tab's draft as its own version, then this text", async () => {
		const id = await page();
		await store.savePageDraft(id, { base: 1, rev: 0, content: "other tab" });
		const result = await store.commitPageVersion(id, { base: 1, rev: 0, content: "mine", cause: "conflict" });
		assert.ok(typeof result === "object" && "otherVersion" in result);
		assert.equal((await store.readPageVersion(id, result.otherVersion!))!.content, "other tab");
		assert.equal((await store.readPage(id))!.head.content, "mine");
		assert.deepEqual(await numbers(id), [3, 2, 1]);
	});
});

describe("restore", () => {
	it("adds one version and erases none", async () => {
		const id = await page("old");
		await commit(id, 1, 0, "new");
		const result = await store.restorePageVersion(id, 1);
		assert.ok(result !== "missing");
		assert.equal(result.version.restoredFrom, 1);
		assert.equal(result.version.cause, "restore");
		assert.deepEqual(await numbers(id), [3, 2, 1]);
		assert.equal((await store.readPage(id))!.head.content, "old");
	});
	it("commits a dirty draft first", async () => {
		const id = await page("old");
		await store.savePageDraft(id, { base: 1, rev: 0, content: "unsaved" });
		await store.restorePageVersion(id, 1);
		assert.deepEqual(await numbers(id), [3, 2, 1]);
		assert.equal((await store.readPageVersion(id, 2))!.content, "unsaved");
		assert.equal((await store.readPageVersion(id, 3))!.content, "old");
		assert.equal((await store.readPage(id))!.draft, null);
	});
	it("an unknown version is missing", async () => {
		assert.equal(await store.restorePageVersion(await page(), 9), "missing");
	});
});

describe("catalog", () => {
	it("a page is a Library item and readText gives its head", async () => {
		const id = await page("body");
		const item = (await store.list()).find((i) => i.id === id)!;
		assert.equal(item.kind, "page");
		assert.equal(item.origin.type, "learner");
		assert.equal(item.headVersion, 1);
		assert.equal(await store.readText(item), "body");
	});
	it("a taken name refuses with a suggestion", async () => {
		await page();
		const again = await store.createPage("notes", "", { author: "learner" });
		assert.ok(isRefusal(again));
		assert.equal(again.refused, "name_taken");
		assert.equal(again.suggestedName, "notes (2)");
	});
	it("deleting a page removes its versions and draft", async () => {
		const id = await page();
		await store.savePageDraft(id, { base: 1, rev: 0, content: "d" });
		assert.ok(await store.remove(id));
		assert.equal(fs.existsSync(pagesDir(id)), false);
		assert.equal(await store.readPage(id), null);
	});
});
