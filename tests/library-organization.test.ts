/** Marks, recent and recoverable trash (feature 012), on a real temp folder. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "lh-library-org-")));
process.env.LH_DATA_DIR = dir;
const { runAsTenant } = await import("../config.ts");
const { libraryStore } = await import("../src/store/library.ts");
const { cleanTags, isRefusal, isTombstone } = await import("../src/core/library.ts");
const { resolveCatalogEntries } = await import("./helpers/library-org-helpers.ts");
const { libraryPatchResponse, libraryPurgeResponse, libraryRestoreResponse, libraryTrashResponse } = await import("../src/server/library.ts");
after(() => fs.rmSync(dir, { recursive: true, force: true }));

async function* body(text: string) { yield new TextEncoder().encode(text); }
const upload = async (name: string, text = "# hi") => {
	const made = await libraryStore.writeUpload(name, body(text), Buffer.byteLength(text));
	assert.ok(!isRefusal(made));
	return made;
};
const page = async (name: string, folderId?: string) => {
	const made = await libraryStore.createPage(name, "one", { author: "learner", folderId });
	assert.ok(!isRefusal(made));
	return made.item;
};
const folder = async (name: string, parent: string | null = null) => {
	const made = await libraryStore.createFolder(name, parent);
	assert.ok(!isRefusal(made));
	return made;
};
const send = (value: unknown) => new Request("http://x/", { method: "POST", body: JSON.stringify(value) });
const onDisk = (name: string) => fs.existsSync(path.join(dir, "files", name));

beforeEach(() => {
	for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
});

describe("marks", () => {
	it("cleans tags and refuses bad ones", () => {
		assert.deepEqual(cleanTags([" Exam ", "exam", "waves"]), ["Exam", "waves"]);
		assert.equal(cleanTags(["x".repeat(41)]), null);
		assert.equal(cleanTags("exam"), null);
		assert.equal(cleanTags([""]), null);
	});

	it("marks leave content and updatedAt alone, and unmarking removes the field", async () => {
		const item = await upload("a.md");
		const marked = await libraryStore.markItem(item.id, { favorite: true, pinned: true, archived: true, tags: ["exam"] });
		assert.ok(marked?.favorite && marked.pinned && marked.archivedAt);
		assert.equal(marked.updatedAt, item.updatedAt);
		const cleared = await libraryStore.markItem(item.id, { favorite: false, pinned: false, archived: false, tags: [] });
		assert.deepEqual(Object.keys(cleared!).sort(), Object.keys(item).sort());
		assert.equal(await libraryStore.markItem("lib_gone", { favorite: true }), null);
	});

	it("the API refuses a bad mark", async () => {
		const item = await upload("a.md");
		const patch = (marks: unknown) => libraryPatchResponse(new Request("http://x/", { method: "PATCH", body: JSON.stringify({ marks }) }), item.id);
		assert.equal((await patch({ favorite: "yes" })).status, 400);
		assert.equal((await patch({ tags: [3] })).status, 400);
		assert.equal((await patch({ favorite: true })).status, 200);
	});
});

describe("recent", () => {
	it("is newest first, de-duplicated, and drops what is gone", async () => {
		const a = await upload("a.md");
		const b = await upload("b.md");
		await libraryStore.markOpened(a.id);
		await libraryStore.markOpened(b.id);
		await libraryStore.markOpened(a.id);
		assert.deepEqual((await libraryStore.recent()).map((i) => i.id), [a.id, b.id]);
		await libraryStore.trashItem(a.id);
		assert.deepEqual((await libraryStore.recent()).map((i) => i.id), [b.id]);
		assert.equal(await libraryStore.markOpened("lib_gone"), false);
	});

	it("opening doesn't rewrite the catalog", async () => {
		const a = await upload("a.md");
		const catalog = path.join(dir, "library", "catalog.json");
		const before = fs.statSync(catalog).mtimeMs;
		await libraryStore.markOpened(a.id);
		assert.equal(fs.statSync(catalog).mtimeMs, before);
	});
});

describe("trash", () => {
	it("a document leaves files/, frees its name and comes back whole", async () => {
		const a = await upload("a.md", "# keep");
		const entry = await libraryStore.trashItem(a.id);
		assert.ok(entry);
		assert.equal(onDisk("a.md"), false, "agent file tools can't reach it");
		assert.equal(await libraryStore.get(a.id), null);
		assert.deepEqual(await libraryStore.list(), [], "reconcile doesn't tombstone or re-add it");
		const restored = await libraryStore.restoreTrash(entry.id);
		assert.equal(restored?.items[0]?.id, a.id);
		assert.equal(fs.readFileSync(path.join(dir, "files", "a.md"), "utf8"), "# keep");
		assert.deepEqual(await libraryStore.listTrash(), []);
	});

	it("references read as deleted while trashed, and as live after", async () => {
		const a = await upload("a.md");
		const entry = await libraryStore.trashItem(a.id);
		assert.ok(isTombstone(resolveCatalogEntries(await libraryStore.catalog(), a.id)!));
		await libraryStore.restoreTrash(entry!.id);
		assert.ok(!isTombstone(resolveCatalogEntries(await libraryStore.catalog(), a.id)!));
	});

	it("a page keeps its versions and draft through the trash", async () => {
		const p = await page("p");
		await libraryStore.commitPageVersion(p.id, { base: 1, rev: 0, content: "two" });
		await libraryStore.savePageDraft(p.id, { base: 2, rev: 0, content: "three" });
		const entry = await libraryStore.trashItem(p.id);
		assert.equal(await libraryStore.readPage(p.id), null);
		await libraryStore.restoreTrash(entry!.id);
		const state = await libraryStore.readPage(p.id);
		assert.equal(state?.head.n, 2);
		assert.equal(state?.draft?.content, "three");
		assert.equal((await libraryStore.listPageVersions(p.id))?.length, 2);
	});

	it("a restored name that is taken steps, and never overwrites", async () => {
		const a = await upload("a.md", "# old");
		const entry = await libraryStore.trashItem(a.id);
		await upload("a.md", "# new");
		const restored = await libraryStore.restoreTrash(entry!.id);
		assert.equal(restored?.items[0]?.name, "a (2).md");
		assert.equal(fs.readFileSync(path.join(dir, "files", "a.md"), "utf8"), "# new");
		assert.equal(fs.readFileSync(path.join(dir, "files", "a (2).md"), "utf8"), "# old");
		assert.deepEqual(restored?.items[0]?.previousNames, ["a.md"]);
	});

	it("a folder goes as one entry with its subtree and returns in place", async () => {
		const top = await folder("top");
		const mid = await folder("mid", top.id);
		const low = await folder("low", mid.id);
		const inner = await upload("in.md");
		await libraryStore.moveItem(inner.id, low.id);
		const p = await page("p", mid.id);
		const entry = await libraryStore.trashFolder(mid.id);
		assert.deepEqual((await libraryStore.folders()).map((f) => f.id), [top.id]);
		assert.deepEqual(await libraryStore.list(), []);
		assert.equal(entry?.items.length, 2);
		await libraryStore.restoreTrash(entry!.id);
		const folders = await libraryStore.folders();
		assert.equal(folders.find((f) => f.id === mid.id)?.parentId, top.id);
		assert.equal(folders.find((f) => f.id === low.id)?.parentId, mid.id);
		assert.equal((await libraryStore.get(inner.id))?.folderId, low.id);
		assert.equal((await libraryStore.get(p.id))?.folderId, mid.id);
	});

	it("restoring when the old parent is gone lands at the top level", async () => {
		const top = await folder("top");
		const p = await page("p", top.id);
		const entry = await libraryStore.trashItem(p.id);
		await libraryStore.trashFolder(top.id);
		await libraryStore.restoreTrash(entry!.id);
		assert.equal((await libraryStore.get(p.id))?.folderId, undefined);
	});

	it("purge deletes for good and leaves a tombstone", async () => {
		const p = await page("p");
		const entry = await libraryStore.trashItem(p.id);
		assert.equal(await libraryStore.purgeTrash(entry!.id), true);
		assert.equal(fs.existsSync(path.join(dir, "library", "pages", p.id)), false);
		assert.ok(isTombstone(resolveCatalogEntries(await libraryStore.catalog(), p.id)!));
		assert.equal(await libraryStore.restoreTrash(entry!.id), null);
	});

	it("an older app's rewrite keeps the trash", async () => {
		const a = await upload("a.md");
		await libraryStore.trashItem(a.id);
		const file = path.join(dir, "library", "catalog.json");
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		assert.equal(parsed.version, 1);
		assert.equal(parsed.items.length, 0, "older apps never see trashed items as live");
		assert.equal(parsed.trash.length, 1);
	});

	it("the API maps outcomes, and tenants can't reach each other's trash", async () => {
		const a = await runAsTenant("user_a", () => upload("a.md"));
		const entry = await runAsTenant("user_a", () => libraryStore.trashItem(a.id));
		assert.equal(await runAsTenant("user_b", () => libraryStore.restoreTrash(entry!.id)), null);
		assert.equal(await runAsTenant("user_b", () => libraryStore.purgeTrash(entry!.id)), false);
		assert.deepEqual(await runAsTenant("user_b", () => libraryStore.listTrash()), []);
		assert.equal((await libraryTrashResponse(send({}))).status, 400);
		assert.equal((await libraryTrashResponse(send({ itemId: "lib_gone" }))).status, 404);
		assert.equal((await libraryRestoreResponse("trs_gone")).status, 404);
		assert.equal((await libraryPurgeResponse("trs_gone")).status, 404);
	});
});
