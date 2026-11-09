import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { completedMarkdownPrefix } from "../src/core/completed-markdown.ts";
import type { LibraryFolder, LibraryItem, LibraryTombstone } from "../src/core/library.ts";
import { chipMarkdown } from "../src/core/reference-chips.ts";

// Feature 027, T043: `@name` in a tutor reply becomes a Library link before
// Streamdown sees it (contracts/recognition.md, chipMarkdown).

const now = "2026-11-08T00:00:00.000Z";
const item = (id: string, name: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({ id, name, kind: "page", size: 1, createdAt: now, updatedAt: now, origin: { type: "upload" }, ...extra } as LibraryItem);
const note = item("lib_note", "Untitled note");
const note2 = item("lib_note2", "Untitled note 2");
const pdf = item("lib_pdf", "Notes.pdf", { kind: "pdf" });
const odd = item("lib_odd", "a [b] c\\d");
const gone: LibraryTombstone = { id: "lib_gone", name: "Gone note", kind: "page", deletedAt: now };
const catalog = { entries: [note, note2, pdf, odd, gone] };
const link = (name: string, id: string) => `[@${name}](/library?item=${id} "lh-ref")`;

describe("chipMarkdown", () => {
	it("turns a resolving @name into a Library link, longest name first", () => {
		assert.equal(chipMarkdown("See @Untitled note.", catalog), `See ${link("Untitled note", "lib_note")}.`);
		assert.equal(chipMarkdown("See @Untitled note 2!", catalog), `See ${link("Untitled note 2", "lib_note2")}!`);
		assert.equal(chipMarkdown("(@Notes.pdf)", catalog), `(${link("Notes.pdf", "lib_pdf")})`);
	});
	it("keeps the name as written, case and all", () => {
		assert.equal(chipMarkdown("@untitled NOTE", catalog), link("untitled NOTE", "lib_note"));
	});
	it("resolves a tombstone as the server does", () => {
		assert.equal(chipMarkdown("Was @Gone note", catalog), `Was ${link("Gone note", "lib_gone")}`);
	});
	it("leaves unresolved names, plain words and mid-word @ as text", () => {
		for (const text of ["@nobody here", "Untitled note without the at", "mail me@Untitled note", "@Untitled notes"]) assert.equal(chipMarkdown(text, catalog), text);
	});
	it("leaves code as text", () => {
		const text = "Inline `@Notes.pdf` and\n\n```\n@Notes.pdf\n```\n";
		assert.equal(chipMarkdown(text, catalog), text);
	});
	it("leaves link labels and addresses, autolinks and raw HTML alone", () => {
		for (const text of [
			"[about @Notes.pdf](https://example.com)",
			"[x](https://example.com/ @Notes.pdf)",
			"[about @Notes.pdf][ref]\n\n[ref]: https://example.com",
			"![a @Notes.pdf figure](figure.png)",
			"<https://example.com/@Notes.pdf>",
			'<span title="x @Notes.pdf">y</span>',
			"$x @Notes.pdf$",
		]) assert.equal(chipMarkdown(text, catalog), text, text);
	});
	it("chips a name next to a link without touching the link", () => {
		const text = "[Notes.pdf, p. 3](/library?item=lib_pdf&page=3&quote=x) and @Untitled note";
		assert.equal(chipMarkdown(text, catalog), `[Notes.pdf, p. 3](/library?item=lib_pdf&page=3&quote=x) and ${link("Untitled note", "lib_note")}`);
	});
	it("escapes [, ] and \\ in the label", () => {
		assert.equal(chipMarkdown("@a [b] c\\d", catalog), `[@a \\[b\\] c\\\\d](/library?item=lib_odd "lh-ref")`);
	});
	it("encodes the id as a Library address", () => {
		const spaced = item("lib a(1)", "Spaced");
		assert.equal(chipMarkdown("@Spaced", { entries: [spaced] }), `[@Spaced](/library?item=lib%20a%281%29 "lh-ref")`);
	});
	it("is idempotent", () => {
		for (const text of ["See @Untitled note and @Notes.pdf.", "@a [b] c\\d", "[x](/library?item=lib_pdf) @Gone note"]) {
			const once = chipMarkdown(text, catalog);
			assert.equal(chipMarkdown(once, catalog), once);
		}
	});
	it("reaches a mirrored item by its Library path", () => {
		const folders: LibraryFolder[] = [
			{ id: "f1", name: "Lecture notes", parentId: null, createdAt: now } as LibraryFolder,
			{ id: "f2", name: "week1", parentId: "f1", createdAt: now } as LibraryFolder,
		];
		const mirrored = item("lib_m", "notes.md", { kind: "markdown", folderId: "f2", mirror: { linkId: "l1", path: "week1/notes.md" } } as Partial<LibraryItem>);
		assert.equal(chipMarkdown("Read @Lecture notes/week1/notes.md now", { entries: [mirrored], folders }), `Read ${link("Lecture notes/week1/notes.md", "lib_m")} now`);
	});
	it("a stream cut mid-name leaves text: the completed prefix holds no half name", () => {
		const streamed = "See @Untitled note.\n\nThen @Untit";
		const shown = chipMarkdown(completedMarkdownPrefix(streamed), catalog);
		assert.equal(shown, `See ${link("Untitled note", "lib_note")}.\n\n`);
		assert.equal(chipMarkdown("Then @Untit", catalog), "Then @Untit");
	});
	it("returns the text as is with no catalog entries or no @", () => {
		assert.equal(chipMarkdown("@Untitled note", { entries: [] }), "@Untitled note");
		assert.equal(chipMarkdown("no at here", catalog), "no at here");
	});
});
