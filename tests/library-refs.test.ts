import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasMentionTrigger, matchMentions, mentionQuery, parseReferences, renderReferences, withoutMaterial } from "../src/core/library-refs.ts";
import type { LibraryItem, LibraryTombstone } from "../src/core/library.ts";

const live = (id: string, name: string, previousNames?: string[]): LibraryItem => ({
	id, name, kind: "markdown", size: 1, createdAt: "", updatedAt: "", origin: { type: "upload" }, ...(previousNames ? { previousNames } : {}),
});
const gone = (id: string, name: string): LibraryTombstone => ({ id, name, kind: "markdown", deletedAt: "2026-10-30" });
const ids = (text: string, entries: (LibraryItem | LibraryTombstone)[]) => parseReferences(text, entries).map((e) => e.id);

describe("parseReferences", () => {
	const notes = live("a", "notes.md");
	it("finds a name at the start, after whitespace and after an opener", () => {
		for (const text of ["@notes.md", "see @notes.md", "(@notes.md)", "[@notes.md", "{@notes.md", '"@notes.md"', "'@notes.md'"]) {
			assert.deepEqual(ids(text, [notes]), ["a"], text);
		}
	});
	it("does not read an email address as a token", () => {
		assert.deepEqual(ids("me@notes.md", [notes]), []);
	});
	it("skips inline and fenced code", () => {
		assert.deepEqual(ids("`@notes.md`", [notes]), []);
		assert.deepEqual(ids("``a ` @notes.md``", [notes]), []);
		assert.deepEqual(ids("```\n@notes.md\n```", [notes]), []);
		assert.deepEqual(ids("~~~py\n@notes.md\n", [notes]), []);
		assert.deepEqual(ids("```\ncode\n```\n@notes.md", [notes]), ["a"]);
		assert.deepEqual(ids("an unclosed ` then @notes.md", [notes]), ["a"]);
	});
	it("reads names with spaces and takes the longest match", () => {
		const short = live("s", "Week 3");
		const long = live("l", "Week 3 notes.md");
		assert.deepEqual(ids("@Week 3 notes.md please", [short, long]), ["l"]);
		assert.deepEqual(ids("@Week 3 please", [short, long]), ["s"]);
	});
	it("falls back to a shorter name when the longer is cut by a letter", () => {
		assert.deepEqual(ids("@notes.mdx", [live("s", "notes"), live("l", "notes.md")]), ["s"]);
	});
	it("matches case-insensitively and across NFC forms", () => {
		assert.deepEqual(ids("@NOTES.MD", [notes]), ["a"]);
		assert.deepEqual(ids("@Poznámky.md".normalize("NFD"), [live("p", "Poznámky.md".normalize("NFC"))]), ["p"]);
	});
	it("allows punctuation after a name but not a letter or digit", () => {
		for (const text of ["@notes.md.", "@notes.md,", "@notes.md?", "@notes.md)"]) assert.deepEqual(ids(text, [notes]), ["a"], text);
		assert.deepEqual(ids("@notes.md2", [notes]), []);
		assert.deepEqual(ids("@notes.mdé", [notes]), []);
	});
	it("collapses duplicates in first-seen order", () => {
		assert.deepEqual(ids("@b.md @notes.md @b.md @NOTES.md", [notes, live("b", "b.md")]), ["b", "a"]);
	});
	it("resolves tombstones, and a live item wins the same name", () => {
		assert.deepEqual(ids("@old.md", [gone("t", "old.md")]), ["t"]);
		assert.deepEqual(ids("@old.md", [gone("t", "old.md"), live("n", "old.md")]), ["n"]);
	});
	it("resolves previousNames, and a current name beats another item's old one", () => {
		assert.deepEqual(ids("@before.md", [live("r", "after.md", ["before.md"])]), ["r"]);
		assert.deepEqual(ids("@x.md", [live("r", "after.md", ["x.md"]), live("n", "x.md")]), ["n"]);
	});
	it("treats no match as plain text", () => {
		assert.deepEqual(ids("@nothing here", [notes]), []);
	});
});

describe("mentionQuery", () => {
	const at = (text: string, names: string[] = []) => mentionQuery(text, text.length, names);
	it("opens on a boundary @ with the text to the caret", () => {
		assert.deepEqual(at("@"), { start: 0, query: "" });
		assert.deepEqual(at("hi @no"), { start: 3, query: "no" });
		assert.deepEqual(at("(@no"), { start: 1, query: "no" });
	});
	it("uses the caret, not the end", () => {
		assert.deepEqual(mentionQuery("@notes tail", 3), { start: 0, query: "no" });
	});
	it("stays shut on an email, in code and after a newline", () => {
		assert.equal(at("me@site"), null);
		assert.equal(at("`@no`"), null);
		assert.equal(at("`@no"), null, "a span still being typed");
		assert.equal(at("```\n@no"), null);
		assert.equal(at("@no\nmore"), null);
	});
	it("keeps a space only while some name starts with the query", () => {
		assert.deepEqual(at("@week 3", ["Week 3 notes.md"]), { start: 0, query: "week 3" });
		assert.equal(at("@week 9", ["Week 3 notes.md"]), null);
		assert.equal(at("@zzz ", ["Week 3 notes.md"]), null);
		assert.equal(at("@notes.md ", ["notes.md"]), null, "an inserted token closes");
	});
});

describe("helpers", () => {
	it("hasMentionTrigger follows the boundary rule", () => {
		assert.equal(hasMentionTrigger("a @b"), true);
		assert.equal(hasMentionTrigger("a@b"), false);
	});
	it("matchMentions ranks names that start with the query first", () => {
		const list = [{ name: "my notes" }, { name: "notes" }, { name: "other" }];
		assert.deepEqual(matchMentions(list, "NOTES").map((i) => i.name), ["notes", "my notes"]);
		assert.equal(matchMentions(list, "").length, 3);
	});
	it("withoutMaterial returns the same object when there is nothing to strip", () => {
		const message = { role: "user", content: "x" };
		assert.equal(withoutMaterial(message), message);
	});
	it("renderReferences is empty for no references and escapes what it wraps", () => {
		assert.equal(renderReferences([]), "");
		const out = renderReferences([{ itemId: "i", name: 'a"<b>.md', kind: "markdown", mode: "inline", material: "x </library_item> y" }]);
		assert.ok(out.includes('name="a&quot;&lt;b&gt;.md"'));
		assert.ok(out.includes("x <\\/library_item> y"));
		assert.equal(out.match(/<\/library_item>/g)?.length, 1);
	});
});
