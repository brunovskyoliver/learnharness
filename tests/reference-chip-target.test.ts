import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { citationQuote } from "../src/core/document-anchors.ts";
import { chipTarget, chipTargets, itemPlace, type ChipInput } from "../src/core/reference-chips.ts";
import type { LibraryFolder, LibraryItem } from "../src/core/library.ts";

// Feature 027, T010 + T054: where a chip opens, its hint and its names (contracts/ui-contract.md §1).

const base: ChipInput = { itemId: "lib_a", state: "live", name: "Untitled note", kind: "page" };

describe("href by state", () => {
	it("live and unknown open the full view", () => {
		assert.equal(chipTarget(base).href, "/library?item=lib_a");
		assert.equal(chipTarget({ ...base, state: "unknown" }).href, "/library?item=lib_a");
		assert.equal(chipTarget({ ...base, kind: "pdf", page: 4 }).href, "/library?item=lib_a&page=4");
	});
	it("a quote is cut to 200 characters by citationQuote and encoded like a citation", () => {
		const long = `${"word ".repeat(60)}(end)`;
		const href = chipTarget({ ...base, quote: long }).href!;
		const quote = new URLSearchParams(href.split("?")[1]).get("quote")!;
		assert.equal(quote, citationQuote(long));
		assert.ok(quote.length <= 200);
		assert.ok(!href.includes("("), "parentheses go encoded, so a Markdown link holds");
		assert.equal(chipTarget({ ...base, quote: "it (works)" }).href, "/library?item=lib_a&quote=it%20%28works%29");
	});
	it("trashed opens its Trash entry", () => {
		assert.equal(chipTarget({ ...base, state: "trashed", trashEntryId: "tr 1" }).href, "/library?view=trash&entry=tr%201");
	});
	it("deleted and removed are not links", () => {
		assert.equal(chipTarget({ ...base, state: "deleted" }).href, null);
		assert.equal(chipTarget({ ...base, state: "removed" }).href, null);
	});
});

describe("hint", () => {
	it("a page: · p. {n}", () => assert.equal(chipTarget({ ...base, kind: "pdf", page: 4, quote: "x" }).hint, "· p. 4"));
	it("a passage: its first non-empty line", () => assert.equal(chipTarget({ ...base, quote: "\n  \n  The first line.  \nThe second." }).hint, "· The first line."));
	it("a whole item: none", () => assert.equal(chipTarget(base).hint, undefined));
});

describe("accessible names", () => {
	it("whole item: Open {name}, {kind label}", () => assert.equal(chipTarget(base).label, "Open Untitled note, Page"));
	it("PDF page: Open {name}, page {n}, with the passage as its description", () => {
		const target = chipTarget({ ...base, name: "Notes.pdf", kind: "pdf", page: 4, quote: "Some\nwords" });
		assert.equal(target.label, "Open Notes.pdf, page 4");
		assert.equal(target.description, "Some words");
	});
	it("passage: the first 80 characters, the whole passage in the description", () => {
		const quote = `${"a".repeat(70)} ${"b".repeat(30)}`;
		const target = chipTarget({ ...base, quote });
		assert.equal(target.label, `Open Untitled note at the passage "${quote.slice(0, 80)}"`);
		assert.equal(target.description, quote);
	});
	it("trashed: Open {name} in the trash", () => assert.equal(chipTarget({ ...base, state: "trashed", trashEntryId: "t" }).label, "Open Untitled note in the trash"));
	it("deleted reads {name} · no longer in your Library", () => {
		const target = chipTarget({ ...base, state: "deleted", quote: "x" });
		assert.equal(target.label, "Untitled note · no longer in your Library");
		assert.equal(target.description, undefined);
	});
	it("removed reads {name} · Removed from the repo (026's constant)", () => {
		assert.equal(chipTarget({ ...base, name: "notes.md", kind: "markdown", state: "removed" }).label, "notes.md · Removed from the repo");
	});
	it("unknown is named like live", () => assert.equal(chipTarget({ ...base, state: "unknown" }).label, "Open Untitled note, Page"));
});

describe("feature 026 mirrored items (T054, R15) and equal names (analyze M2)", () => {
	const folders: LibraryFolder[] = [
		{ id: "ln", name: "Lecture notes", parentId: null, createdAt: "", updatedAt: "", mirror: { linkId: "l", repoKey: "k", path: "" } },
		{ id: "w1", name: "week1", parentId: "ln", createdAt: "", updatedAt: "", mirror: { linkId: "l", repoKey: "k", path: "week1" } },
		{ id: "w2", name: "week2", parentId: "ln", createdAt: "", updatedAt: "", mirror: { linkId: "l", repoKey: "k", path: "week2" } },
	];
	const mirrored = (id: string, folderId: string): LibraryItem => ({ id, name: "notes.md", kind: "markdown", size: 1, createdAt: "", updatedAt: "", origin: { type: "repo", linkId: "l" }, folderId, mirror: { linkId: "l", repoKey: "k", path: `${folderId}/notes.md` } });
	const input = (item: LibraryItem, folderList = folders): ChipInput => ({ itemId: item.id, state: "live", name: item.name, kind: item.kind, ...itemPlace(item, folderList) });

	it("a mirrored live item's chip shows its display name, not its @ path", () => {
		const target = chipTarget(input(mirrored("a", "w1")));
		assert.equal(target.name, "notes.md");
		assert.equal(target.label, "Open notes.md, Markdown");
		assert.equal(target.href, "/library?item=a");
		assert.equal(target.folderHint, undefined, "alone, no folder hint");
	});
	it("after the linked folder is renamed, the path follows the folders it sits in now", () => {
		const renamed = folders.map((f) => (f.id === "ln" ? { ...f, name: "Notes" } : f));
		assert.equal(itemPlace(mirrored("a", "w1"), renamed).path, "Notes/week1/notes.md");
		assert.equal(chipTarget(input(mirrored("a", "w1"), renamed)).name, "notes.md");
	});
	it("a removed mirrored entry: not a link, Removed from the repo", () => {
		const target = chipTarget({ itemId: "a", state: "removed", name: "notes.md", kind: "markdown" });
		assert.equal(target.href, null);
		assert.equal(target.label, "notes.md · Removed from the repo");
	});
	it("two chips with the same display name each show their folder and speak their path", () => {
		const [one, two] = chipTargets([input(mirrored("a", "w1")), input(mirrored("b", "w2"))]);
		assert.equal(one!.folderHint, "· week1");
		assert.equal(two!.folderHint, "· week2");
		assert.equal(one!.label, "Open Lecture notes/week1/notes.md, Markdown");
		assert.equal(two!.label, "Open Lecture notes/week2/notes.md, Markdown");
	});
	it("the same item twice is not a clash", () => {
		const [one, two] = chipTargets([input(mirrored("a", "w1")), input(mirrored("a", "w1"))]);
		assert.equal(one!.folderHint, undefined);
		assert.equal(two!.folderHint, undefined);
	});
	it("a top-level item has no folder to show", () => {
		assert.deepEqual(itemPlace({ name: "notes.md" }, folders), {});
	});
});
