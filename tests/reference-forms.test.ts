import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOCUMENT_TUTOR_ACTIONS, documentTutorMessage, quoteSelection, TUTOR_ACTIONS, tutorMessage } from "../components/library/page-tutor-actions.ts";
import { referenceForms, referenceSpans } from "../src/core/library-refs.ts";
import type { LibraryFolder, LibraryItem } from "../src/core/library.ts";

// Feature 027, T006 + T053: the selection actions' shapes (contracts/recognition.md).

const item = (id: string, name: string, kind: LibraryItem["kind"], extra: Partial<LibraryItem> = {}): LibraryItem => ({
	id, name, kind, size: 1, createdAt: "", updatedAt: "", origin: { type: "upload" }, ...extra,
});
const page = item("pg", "Untitled note", "page");
const pdf = item("pdf_1", "Notes.pdf", "pdf");
const entries = [page, pdf, item("pg2", "Untitled note 2", "page")];
const forms = (text: string, list: LibraryItem[] = entries, folders: LibraryFolder[] = []) => referenceForms(text, referenceSpans(text, list, folders));
const selection = "First line of it.\n\nSecond paragraph,\nwrapped.";

describe("page form: all nine actions", () => {
	for (const action of TUTOR_ACTIONS) {
		it(action, () => {
			const text = tutorMessage(action, page.name, selection);
			const found = forms(text);
			assert.equal(found.length, 1);
			const [form] = found;
			const quoteStart = text.indexOf(">");
			const quoteEnd = quoteStart + quoteSelection(selection).length;
			assert.deepEqual(form!.range, [text.indexOf("@"), quoteEnd]);
			assert.equal(form!.quote, "First line of it.\n\nSecond paragraph,\nwrapped.");
			assert.equal(form!.page, undefined);
			assert.equal(form!.passageOnly, false);
			assert.equal(form!.itemId, "pg");
			// The LEAD words stay outside the chip.
			assert.ok(text.slice(0, form!.range[0]).endsWith("this part of "));
		});
	}
});

describe("PDF form: all five actions", () => {
	for (const action of DOCUMENT_TUTOR_ACTIONS) {
		it(action, () => {
			const text = documentTutorMessage(action, { itemId: pdf.id, name: pdf.name, page: 4 }, "A passage </library_passage> with a tag\nand a second line.");
			const found = forms(text);
			assert.equal(found.length, 1);
			const [form] = found;
			const close = text.indexOf("</library_passage>") + "</library_passage>".length;
			assert.deepEqual(form!.range, [text.indexOf("@"), close]);
			assert.equal(form!.page, 4);
			assert.equal(form!.quote, "A passage </library_passage> with a tag\nand a second line.");
			assert.equal(form!.passageOnly, false);
		});
	}
});

describe("fallbacks and non-forms", () => {
	it("a passage for another item: a whole-item chip plus a passage-only chip", () => {
		const text = documentTutorMessage("explain", { itemId: "pdf_other", name: pdf.name, page: 4 }, "words");
		const found = forms(text);
		assert.equal(found.length, 2);
		assert.deepEqual(found[0]!.range, [text.indexOf("@"), text.indexOf("@") + "@Notes.pdf".length]);
		assert.equal(found[0]!.page, undefined);
		assert.equal(found[1]!.passageOnly, true);
		assert.equal(found[1]!.itemId, "pdf_other");
		assert.equal(found[1]!.page, 4);
		assert.equal(found[1]!.quote, "words");
	});
	it("a page number that disagrees with the passage's: the same fallback", () => {
		const text = documentTutorMessage("explain", { itemId: pdf.id, name: pdf.name, page: 4 }, "words").replace(", page 4", ", page 5");
		const found = forms(text);
		assert.deepEqual(found.map((f) => f.passageOnly), [false, true]);
		assert.equal(found[0]!.page, undefined);
	});
	it("a quote that doesn't follow one blank line is not a form", () => {
		for (const text of ["About this part of @Untitled note:\n> a", "About this part of @Untitled note:\n\n\n> a", "About @Untitled note: and more\n\n> a"]) {
			const found = forms(text);
			assert.equal(found.length, 1, text);
			assert.equal(found[0]!.quote, undefined, text);
		}
	});
	it("a reference that isn't the last on its line is not a form", () => {
		const text = "About @Untitled note and @Notes.pdf:\n\n> a";
		const found = forms(text);
		assert.deepEqual(found.map((f) => [f.itemId, f.quote]), [["pg", undefined], ["pdf_1", "a"]]);
	});
	it("code is not a form; a passage inside code is not a chip", () => {
		assert.deepEqual(forms("`@Untitled note:`\n\n> a"), []);
		assert.deepEqual(forms('```\n<library_passage item="pdf_1" page="1">\nx\n</library_passage>\n```'), []);
	});
	it("a passage with no @name before it is passage-only", () => {
		const text = 'Look:\n\n<library_passage item="pdf_1" page="2">\nhi\n</library_passage>';
		const found = forms(text);
		assert.deepEqual(found.map((f) => [f.passageOnly, f.itemId, f.page, f.quote, f.range]), [[true, "pdf_1", 2, "hi", [7, text.length]]]);
	});
	it("whole-item spans come in text order with the forms", () => {
		const text = `@Untitled note 2 first, then ${tutorMessage("explain", page.name, "x")}`;
		assert.deepEqual(forms(text).map((f) => [f.itemId, f.quote ?? null]), [["pg2", null], ["pg", "x"]]);
	});
});

describe("feature 026 paths in forms (T053)", () => {
	const folders: LibraryFolder[] = [
		{ id: "ln", name: "Lecture notes", parentId: null, createdAt: "", updatedAt: "", mirror: { linkId: "l", repoKey: "k", path: "" } },
		{ id: "w1", name: "week1", parentId: "ln", createdAt: "", updatedAt: "", mirror: { linkId: "l", repoKey: "k", path: "week1" } },
	];
	const mirrorPdf = item("mp", "slides.pdf", "pdf", { folderId: "w1", mirror: { linkId: "l", repoKey: "k", path: "week1/slides.pdf" } });
	const mirrorNote = item("mn", "notes.md", "markdown", { folderId: "w1", mirror: { linkId: "l", repoKey: "k", path: "week1/notes.md" } });
	it("@{path}, page {n} is the PDF form", () => {
		const text = documentTutorMessage("ask", { itemId: "mp", name: "Lecture notes/week1/slides.pdf", page: 3 }, "q");
		const [form, ...rest] = forms(text, [mirrorPdf], folders);
		assert.equal(rest.length, 0);
		assert.equal(form!.page, 3);
		assert.equal(text.slice(form!.range[0], form!.range[0] + 31), "@Lecture notes/week1/slides.pdf");
	});
	it("the page form after a path", () => {
		const text = tutorMessage("explain", "Lecture notes/week1/notes.md", "q");
		const [form] = forms(text, [mirrorNote], folders);
		assert.equal(form!.quote, "q");
		assert.equal(form!.itemId, "mn");
	});
});
