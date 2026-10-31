/** What each Library view shows (features 012-013). */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { allTags, parseTags, parseView, runBulk, selectEntries, type LibraryQuery } from "../components/library/library-filter.ts";
import type { LibraryFolder, LibraryItem } from "../src/core/index.ts";

const item = (id: string, over: Partial<LibraryItem> = {}): LibraryItem => ({
	id, name: id, kind: "markdown", size: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", origin: { type: "upload" }, ...over,
});
const folder = (id: string, over: Partial<LibraryFolder> = {}): LibraryFolder => ({ id, name: id, parentId: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...over });
const query = (over: Partial<LibraryQuery> = {}): LibraryQuery => ({ view: "all", folderId: null, search: "", tag: null, kind: null, sort: "name", descending: false, recentIds: [], ...over });
const ids = (list: { id: string }[]) => list.map((entry) => entry.id);

describe("selectEntries", () => {
	it("pinned stays first in either direction", () => {
		const items = [item("a"), item("b", { pinned: true }), item("c")];
		assert.deepEqual(ids(selectEntries(items, [], query()).items), ["b", "a", "c"]);
		assert.deepEqual(ids(selectEntries(items, [], query({ descending: true })).items), ["b", "c", "a"]);
	});
	it("sorts by size and date", () => {
		const items = [item("a", { size: 3, updatedAt: "2026-01-02T00:00:00.000Z" }), item("b", { size: 1, updatedAt: "2026-01-03T00:00:00.000Z" })];
		assert.deepEqual(ids(selectEntries(items, [], query({ sort: "size" })).items), ["b", "a"]);
		assert.deepEqual(ids(selectEntries(items, [], query({ sort: "updated", descending: true })).items), ["b", "a"]);
	});
	it("archived items leave All and appear in Archive, also under an archived folder", () => {
		const folders = [folder("old", { archivedAt: "2026-01-01T00:00:00.000Z" })];
		const items = [item("a", { archivedAt: "2026-01-01T00:00:00.000Z" }), item("b"), item("c", { folderId: "old" })];
		const all = selectEntries(items, folders, query());
		assert.deepEqual(ids(all.items), ["b"]);
		assert.deepEqual(ids(all.folders), []);
		const archive = selectEntries(items, folders, query({ view: "archive" }));
		assert.deepEqual(ids(archive.items), ["a"]);
		assert.deepEqual(ids(archive.folders), ["old"]);
		assert.deepEqual(ids(selectEntries(items, folders, query({ view: "archive", folderId: "old" })).items), ["c"]);
	});
	it("favorites, tags and types cover every folder", () => {
		const folders = [folder("f")];
		const items = [item("a", { folderId: "f", favorite: true, tags: ["Exam"], kind: "pdf" }), item("b")];
		assert.deepEqual(ids(selectEntries(items, folders, query({ view: "favorites" })).items), ["a"]);
		const tagged = selectEntries(items, folders, query({ tag: "exam" }));
		assert.deepEqual(ids(tagged.items), ["a"]);
		assert.deepEqual(tagged.folders, [], "folders have no tags");
		assert.deepEqual(ids(selectEntries(items, folders, query({ kind: "pdf" })).items), ["a"]);
	});
	it("recent keeps its own order and drops what is gone", () => {
		assert.deepEqual(ids(selectEntries([item("a"), item("b")], [], query({ view: "recent", recentIds: ["b", "gone", "a"] })).items), ["b", "a"]);
	});
	it("trash has its own list", () => {
		assert.deepEqual(selectEntries([item("a")], [], query({ view: "trash" })), { folders: [], items: [] });
	});
});

describe("helpers", () => {
	it("an unknown view is All", () => {
		assert.equal(parseView("nonsense"), "all");
		assert.equal(parseView("__proto__"), "all");
		assert.equal(parseView("trash"), "trash");
	});
	it("tags list and parse", () => {
		assert.deepEqual(allTags([item("a", { tags: ["b", "A"] }), item("c", { tags: ["a"] })]), ["A", "b"]);
		assert.deepEqual(parseTags(" a, ,b "), ["a", "b"]);
	});
	it("a bulk action carries on past a failure and names it", async () => {
		const outcome = await runBulk(["a", "b", "c"], async (t) => (t === "b" ? "no" : null), (t) => t);
		assert.deepEqual(outcome, { done: 2, failed: [{ name: "b", reason: "no" }] });
	});
});
