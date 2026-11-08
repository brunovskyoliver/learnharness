import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { describe, it } from "node:test";
import { documentTutorMessage, tutorMessage } from "../components/library/page-tutor-actions.ts";
import { referenceForms, referenceSpans } from "../src/core/library-refs.ts";
import type { LibraryItem } from "../src/core/library.ts";
import { chipDeleteRange } from "../src/core/reference-chips.ts";
import type { LibraryTombstone } from "../src/core/library.ts";
import { fieldChips, mirrorPieces } from "../components/reference-field.tsx";
import { KIND_ICON } from "../components/reference-icons.ts";
import type { MentionCatalog } from "../components/library/use-library-mention.ts";

// Feature 027, T033: what one Backspace or Delete removes in a composer field (research R5).

const item = (id: string, name: string, kind: LibraryItem["kind"]): LibraryItem => ({ id, name, kind, size: 1, createdAt: "", updatedAt: "", origin: { type: "upload" } });
const page = item("pg", "Untitled note", "page");
const pdf = item("pdf_1", "Notes.pdf", "pdf");
const formsOf = (text: string) => referenceForms(text, referenceSpans(text, [page, pdf]));
const at = (n: number) => ({ start: n, end: n });
const run = (text: string, caret: { start: number; end: number }, key: string, extra: Record<string, boolean> = {}) => chipDeleteRange(text, caret, { key, ...extra }, formsOf(text));

describe("chipDeleteRange", () => {
	const text = "See @Untitled note and @Notes.pdf now";
	const first = [text.indexOf("@Untitled"), text.indexOf(" and")] as [number, number];
	const second = [text.indexOf("@Notes"), text.indexOf(" now")] as [number, number];

	it("Backspace at a chip's end removes the whole chip", () => {
		assert.deepEqual(run(text, at(first[1]), "Backspace"), first);
		assert.deepEqual(run(text, at(second[1]), "Backspace"), second);
	});

	it("Delete at a chip's start removes the whole chip", () => {
		assert.deepEqual(run(text, at(first[0]), "Delete"), first);
		assert.deepEqual(run(text, at(second[0]), "Delete"), second);
	});

	it("anywhere else the key is the field's", () => {
		assert.equal(run(text, at(first[1] - 1), "Backspace"), null, "inside the name");
		assert.equal(run(text, at(first[1] + 1), "Backspace"), null, "after the space");
		assert.equal(run(text, at(first[1]), "Delete"), null, "Delete at the end");
		assert.equal(run(text, at(first[0]), "Backspace"), null, "Backspace at the start");
		assert.equal(run(text, at(0), "Backspace"), null);
		assert.equal(run(text, at(first[1]), "a"), null, "another key");
	});

	it("a selection, a composition or a modifier leaves the key to the field", () => {
		assert.equal(run(text, { start: first[0], end: first[1] }, "Backspace"), null);
		assert.equal(run(text, at(first[1]), "Backspace", { composing: true }), null);
		for (const modifier of ["shiftKey", "metaKey", "ctrlKey", "altKey"]) {
			assert.equal(run(text, at(first[1]), "Backspace", { [modifier]: true }), null, modifier);
		}
	});

	it("a page quote form goes whole, the LEAD words stay", () => {
		const draft = tutorMessage("ask", page.name, "First line.\n\nSecond line.");
		const end = draft.indexOf("> Second line.") + "> Second line.".length;
		const range = run(draft, at(end), "Backspace");
		assert.deepEqual(range, [draft.indexOf("@"), end]);
		assert.equal(draft.slice(0, range![0]), "About this part of ");
		assert.equal(run(draft, at(draft.length), "Backspace"), null, "after Ask's blank line it is a newline");
		assert.deepEqual(run(draft, at(draft.indexOf("@")), "Delete"), range);
	});

	it("a PDF quote form goes whole through </library_passage>", () => {
		const draft = documentTutorMessage("explain", { itemId: pdf.id, name: pdf.name, page: 4 }, "The passage.");
		const range = run(draft, at(draft.length), "Backspace");
		assert.deepEqual(range, [draft.indexOf("@"), draft.length]);
		assert.equal(draft.slice(0, range![0]), "Explain this part of ");
	});

	it("a form past the text's end is ignored", () => {
		assert.equal(chipDeleteRange("ab", at(2), { key: "Backspace" }, [{ range: [0, 5] }]), null);
	});
});

// T034: the mirror draws the value character for character; chips only restyle.
describe("the mirror", () => {
	const gone: LibraryTombstone = { id: "gone", name: "Gone note", kind: "page", deletedAt: "" };
	const removed: LibraryTombstone = { id: "rm", name: "Lecture notes/week2/notes.md", kind: "markdown", deletedAt: "" };
	const catalog: MentionCatalog = { entries: [page, pdf, gone, removed], folders: [], removedIds: new Set(["rm"]) };
	const draw = (value: string, composition: { start: number; length: number } | null = null) => {
		const html = renderToStaticMarkup(React.createElement("div", null, mirrorPieces(value, fieldChips(value, catalog), composition, KIND_ICON)));
		return parseHTML(`<html><body>${html}</body></html>`).document.body.firstElementChild!;
	};
	const drafts = [
		"See @Untitled note and @Notes.pdf now",
		tutorMessage("ask", page.name, "First line.\n\nSecond line."),
		documentTutorMessage("explain", { itemId: pdf.id, name: pdf.name, page: 4 }, "The passage."),
		"Old: @Gone note, @Lecture notes/week2/notes.md and @nobody",
		"In code `@Notes.pdf` stays\n",
		"",
	];

	it("its text is the value, exactly", () => {
		for (const value of drafts) assert.equal(draw(value).textContent!.replace(/\u200b$/, ""), value, JSON.stringify(value));
	});

	it("a whole item: the @ transparent under the kind icon, the name on the chip", () => {
		const chips = draw(drafts[0]!).querySelectorAll('[data-testid="ref-field-chip"]');
		assert.equal(chips.length, 2);
		assert.equal(chips[0]!.textContent, "@Untitled note");
		assert.equal(chips[0]!.getAttribute("data-kind"), "page");
		assert.ok(chips[0]!.querySelector(".lh-ref-chip-at svg"), "icon over the @");
		assert.equal(chips[1]!.getAttribute("data-kind"), "pdf");
	});

	it("the page form: head, then the quoted lines as the chip's passage, markers hidden", () => {
		const root = draw(drafts[1]!);
		assert.equal(root.querySelector('[data-testid="ref-field-chip"]')!.textContent, "@Untitled note");
		const body = root.querySelector(".lh-ref-chip-body")!;
		assert.equal(body.textContent, "> First line.\n>\n> Second line.");
		assert.deepEqual([...body.querySelectorAll(".lh-ref-chip-marker")].map((m) => m.textContent), ["> ", ">", "> "]);
	});

	it("the PDF form: \", page 4\" drawn faint on the head, the passage's tags hidden", () => {
		const root = draw(drafts[2]!);
		assert.equal(root.querySelector('[data-testid="ref-field-chip"] .lh-ref-chip-page')!.textContent, ", page 4");
		const markers = [...root.querySelectorAll(".lh-ref-chip-body .lh-ref-chip-marker")].map((m) => m.textContent);
		assert.deepEqual(markers, [`<library_passage item="${pdf.id}" page="4">`, "</library_passage>"]);
		assert.equal(root.querySelector(".lh-ref-chip-body .lh-ref-chip-passage")!.textContent, "The passage.");
	});

	it("deleted for good and removed from the repo are drawn in their own states (M1)", () => {
		const chips = [...draw(drafts[3]!).querySelectorAll('[data-testid="ref-field-chip"]')];
		assert.deepEqual(chips.map((c) => [c.textContent, c.getAttribute("data-state")]), [["@Gone note", "deleted"], ["@Lecture notes/week2/notes.md", "removed"]]);
	});

	it("code stays text, and a last empty line keeps its height", () => {
		const root = draw(drafts[4]!);
		assert.equal(root.querySelectorAll('[data-testid="ref-field-chip"]').length, 0);
		assert.ok(root.textContent!.endsWith("\n\u200b"));
	});

	it("no list yet: plain text", () => {
		assert.deepEqual(fieldChips(drafts[0]!, null), []);
	});

	it("the composition is underlined where it falls, chips or not", () => {
		const value = "See @Untitled note";
		const root = draw(value, { start: 1, length: 6 });
		assert.equal([...root.querySelectorAll(".lh-ref-composing")].map((s) => s.textContent).join(""), "ee @Un");
		assert.equal(root.textContent, value);
	});
});

describe("the mirror before its icons load", () => {
	it("draws the chip's characters with no icon, so nothing moves when it arrives", () => {
		const value = "See @Untitled note";
		const catalog = { entries: [{ id: "lib_a", name: "Untitled note", kind: "page", size: 1, createdAt: "", updatedAt: "", origin: { type: "upload" } } as LibraryItem], folders: [], removedIds: new Set<string>() } as unknown as MentionCatalog;
		const bare = renderToStaticMarkup(React.createElement("div", null, mirrorPieces(value, fieldChips(value, catalog), null)));
		const drawn = renderToStaticMarkup(React.createElement("div", null, mirrorPieces(value, fieldChips(value, catalog), null, KIND_ICON)));
		assert.ok(!bare.includes("<svg"));
		assert.ok(drawn.includes("<svg"));
		const text = (html: string) => parseHTML(`<html><body>${html}</body></html>`).document.body.textContent;
		assert.equal(text(bare), text(drawn));
		assert.equal(text(bare), value);
	});
});
