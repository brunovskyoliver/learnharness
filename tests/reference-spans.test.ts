import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseReferences, referenceForms, referenceSpans, type ReferenceSpan } from "../src/core/library-refs.ts";
import type { LibraryFolder, LibraryItem, LibraryTombstone } from "../src/core/library.ts";

// Feature 027, T004 + T053: the recogniser every chip and the server share.

type Entry = LibraryItem | LibraryTombstone;
const live = (id: string, name: string, previousNames?: string[]): LibraryItem => ({
	id, name, kind: "markdown", size: 1, createdAt: "", updatedAt: "", origin: { type: "upload" }, ...(previousNames ? { previousNames } : {}),
});
const gone = (id: string, name: string): LibraryTombstone => ({ id, name, kind: "markdown", deletedAt: "2026-10-30" });
const covered = (text: string, spans: ReferenceSpan[]) => spans.map((s) => [text.slice(s.start, s.end), s.entry.id]);
const uniqueById = (spans: ReferenceSpan[]) => [...new Map(spans.map((s) => [s.entry.id, s.entry] as const)).values()];

describe("referenceSpans", () => {
	it("gives raw offsets from the @ to the end of the name", () => {
		const text = "see @notes.md, then @b.md.";
		assert.deepEqual(covered(text, referenceSpans(text, [live("a", "notes.md"), live("b", "b.md")])), [["@notes.md", "a"], ["@b.md", "b"]]);
	});
	it("indexes the raw text when it is pasted decomposed (NFD)", () => {
		const item = live("p", "Poznámky.md".normalize("NFC"));
		const text = "čítaj @Poznámky.md a @Poznámky.md.".normalize("NFD");
		const spans = referenceSpans(text, [item]);
		assert.equal(spans.length, 2);
		for (const span of spans) assert.equal(text.slice(span.start, span.end), "@Poznámky.md".normalize("NFD"));
		assert.equal(text.slice(spans[1]!.end), ".");
	});
	it("follows the boundary rule", () => {
		const notes = [live("a", "notes.md")];
		assert.deepEqual(referenceSpans("me@notes.md", notes), []);
		for (const text of ["(@notes.md)", '"@notes.md"', "x\n@notes.md"]) assert.equal(referenceSpans(text, notes).length, 1, text);
		assert.deepEqual(referenceSpans("@notes.md2", notes), []);
	});
	it("skips code and PDF passages", () => {
		const notes = [live("a", "notes.md")];
		assert.deepEqual(referenceSpans("`@notes.md` and\n```\n@notes.md\n```", notes), []);
		assert.deepEqual(referenceSpans('<library_passage item="x" page="1">\n@notes.md\n</library_passage>', notes), []);
		const text = '<library_passage item="x" page="1">\nhi\n</library_passage> @notes.md';
		assert.deepEqual(covered(text, referenceSpans(text, notes)), [["@notes.md", "a"]]);
	});
	it("takes the longest name: Untitled note vs Untitled note 2", () => {
		const entries = [live("u", "Untitled note"), live("u2", "Untitled note 2")];
		const text = "@Untitled note 2 and @Untitled note.";
		assert.deepEqual(covered(text, referenceSpans(text, entries)), [["@Untitled note 2", "u2"], ["@Untitled note", "u"]]);
	});
	it("ranks a live name over an old name over a tombstone", () => {
		assert.equal(referenceSpans("@x.md", [gone("t", "x.md"), live("r", "after.md", ["x.md"])])[0]!.entry.id, "r");
		assert.equal(referenceSpans("@x.md", [live("r", "after.md", ["x.md"]), live("n", "x.md")])[0]!.entry.id, "n");
		assert.equal(referenceSpans("@x.md", [gone("t", "x.md")])[0]!.entry.id, "t");
	});
	it("keeps each mention: the same item twice is two spans", () => {
		const text = "@a.md and @a.md";
		assert.equal(referenceSpans(text, [live("a", "a.md")]).length, 2);
	});
});

describe("feature 026 names with '/' (T053, contracts/recognition.md)", () => {
	const folder = (id: string, name: string, parentId: string | null, path?: string): LibraryFolder => ({
		id, name, parentId, createdAt: "", updatedAt: "", ...(path !== undefined ? { mirror: { linkId: "rpl_a", repoKey: "k", path } } : {}),
	});
	const mirrored = (id: string, name: string, folderId: string, repoPath: string, previousNames?: string[]): LibraryItem => ({
		...live(id, name, previousNames), folderId, origin: { type: "repo", linkId: "rpl_a" }, mirror: { linkId: "rpl_a", repoKey: "k", path: repoPath, oid: "o", snapshot: "s" },
	});
	const folders = [folder("ln", "Lecture notes", null, ""), folder("w1", "week1", "ln", "week1"), folder("w2", "week2", "ln", "week2")];
	const w1 = mirrored("w1n", "notes.md", "w1", "week1/notes.md");
	const w2 = mirrored("w2n", "notes.md", "w2", "week2/notes.md");
	const page: LibraryItem = { ...live("pg", "Lecture notes"), kind: "page" };

	it("two notes.md paths are two items, each span the whole path", () => {
		const text = "@Lecture notes/week1/notes.md vs @Lecture notes/week2/notes.md";
		assert.deepEqual(covered(text, referenceSpans(text, [w1, w2], folders)), [["@Lecture notes/week1/notes.md", "w1n"], ["@Lecture notes/week2/notes.md", "w2n"]]);
	});
	it("a page named \"Lecture notes\" beside the path: the path still wins, the page alone still resolves", () => {
		const text = "@Lecture notes/week1/notes.md and @Lecture notes.";
		assert.deepEqual(covered(text, referenceSpans(text, [page, w1, w2], folders)), [["@Lecture notes/week1/notes.md", "w1n"], ["@Lecture notes", "pg"]]);
	});
	it("an old path after a linked-folder rename still resolves", () => {
		const renamed = [folder("ln", "Notes", null, ""), folder("w1", "week1", "ln", "week1")];
		const item = mirrored("w1n", "notes.md", "w1", "week1/notes.md", ["Lecture notes/week1/notes.md"]);
		const text = "@Lecture notes/week1/notes.md";
		assert.deepEqual(covered(text, referenceSpans(text, [item], renamed)), [[text, "w1n"]]);
	});
	it("a removed entry resolves by its last path, as the server reads it", () => {
		const removed: LibraryTombstone = { id: "w1n", name: "notes.md", kind: "markdown", deletedAt: "2026-11-08", mirror: { linkId: "rpl_a", repoKey: "k", path: "week1/notes.md" }, removedBecause: "repo", kept: { createdAt: "", previousNames: ["Lecture notes/week1/notes.md"] } };
		const text = "@Lecture notes/week1/notes.md";
		assert.deepEqual(covered(text, referenceSpans(text, [removed], folders)), [[text, "w1n"]]);
		assert.deepEqual(referenceSpans("@notes.md", [removed], folders), []);
	});
});

describe("invariant: distinct span entries equal parseReferences", () => {
	const notes = live("a", "notes.md");
	const fixtures: Array<[string, Entry[]]> = [
		...["@notes.md", "see @notes.md", "(@notes.md)", "[@notes.md", "{@notes.md", '"@notes.md"', "'@notes.md'", "me@notes.md"].map((t): [string, Entry[]] => [t, [notes]]),
		["`@notes.md`", [notes]], ["``a ` @notes.md``", [notes]], ["```\n@notes.md\n```", [notes]], ["~~~py\n@notes.md\n", [notes]],
		["```\ncode\n```\n@notes.md", [notes]], ["an unclosed ` then @notes.md", [notes]],
		["@Week 3 notes.md please", [live("s", "Week 3"), live("l", "Week 3 notes.md")]], ["@Week 3 please", [live("s", "Week 3"), live("l", "Week 3 notes.md")]],
		["@notes.mdx", [live("s", "notes"), live("l", "notes.md")]], ["@NOTES.MD", [notes]],
		["@Poznámky.md".normalize("NFD"), [live("p", "Poznámky.md".normalize("NFC"))]],
		...["@notes.md.", "@notes.md,", "@notes.md?", "@notes.md)", "@notes.md2", "@notes.mdé"].map((t): [string, Entry[]] => [t, [notes]]),
		["@b.md @notes.md @b.md @NOTES.md", [notes, live("b", "b.md")]],
		["@old.md", [gone("t", "old.md")]], ["@old.md", [gone("t", "old.md"), live("n", "old.md")]],
		["@before.md", [live("r", "after.md", ["before.md"])]], ["@x.md", [live("r", "after.md", ["x.md"]), live("n", "x.md")]],
		["@nothing here", [notes]],
		['About this part of @notes.md:\n\n> a\n> b\n\n<library_passage item="a" page="2">\n@notes.md\n</library_passage>', [notes]],
	];
	for (const [text, entries] of fixtures) {
		it(JSON.stringify(text), () => assert.deepEqual(uniqueById(referenceSpans(text, entries)), parseReferences(text, entries)));
	}
});

// T041: the composer runs this on every keystroke.
describe("keystroke cost", () => {
	it("referenceSpans + referenceForms on a 4,000-character draft with 2,000 items: under 1ms median", () => {
		const items = Array.from({ length: 2000 }, (_, i): LibraryItem => ({ id: `lib_${i}`, name: `Item number ${i} notes`, kind: "page", size: 1, createdAt: "", updatedAt: "", origin: { type: "upload" } }));
		let draft = "";
		for (let i = 0; draft.length < 4000; i++) draft += `Some words about @Item number ${i * 37 % 2000} notes and a few more words. `;
		draft = draft.slice(0, 4000);
		const runs: number[] = [];
		for (let i = 0; i < 60; i++) {
			const t = performance.now();
			referenceForms(draft, referenceSpans(draft, items));
			runs.push(performance.now() - t);
		}
		runs.sort((a, b) => a - b);
		const median = runs[runs.length >> 1]!;
		assert.ok(median < 1, `median ${median.toFixed(3)}ms`);
	});
});
