import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { Composer } from "../components/composer.tsx";
import { DOCUMENT_TUTOR_ACTIONS, documentTutorMessage, TUTOR_ACTIONS, tutorMessage } from "../components/library/page-tutor-actions.ts";
import type { MentionCatalog } from "../components/library/use-library-mention.ts";
import { fieldChips, mirrorPieces } from "../components/reference-field.tsx";
import { chipDeleteRange } from "../src/core/reference-chips.ts";
import type { LibraryFolder, LibraryItem, LibraryTombstone } from "../src/core/library.ts";

// Feature 027, T039 (SC-001): chips in the composer change no byte of what is
// sent. The draft set of contracts/recognition.md goes through the composer's
// value path (the textarea's value, which the send reads) with the overlay off
// and on; the request bodies are compared.

const item = (id: string, name: string, kind: LibraryItem["kind"], extra: Partial<LibraryItem> = {}): LibraryItem => ({ id, name, kind, size: 1, createdAt: "", updatedAt: "", origin: { type: "upload" }, ...extra });
const linked: LibraryFolder = { id: "f_link", name: "Lecture notes", parentId: null, createdAt: "" } as LibraryFolder;
const week1: LibraryFolder = { id: "f_w1", name: "week1", parentId: "f_link", createdAt: "" } as LibraryFolder;
const page = item("pg", "Untitled note", "page");
const prefix = item("pg2", "Untitled note 2", "page");
const punctuated = item("pg3", "Waves, part 1 (draft)", "page");
const pdf = item("pdf_1", "Notes.pdf", "pdf");
const mirrored = item("mir", "notes.md", "markdown", { folderId: "f_w1", mirror: { linkId: "l1", path: "week1/notes.md" } as LibraryItem["mirror"] });
const gone: LibraryTombstone = { id: "gone", name: "Gone note", kind: "page", deletedAt: "" };
const many = Array.from({ length: 9 }, (_, i) => item(`m${i}`, `Item ${i}`, "text"));
const catalog: MentionCatalog = { entries: [page, prefix, punctuated, pdf, mirrored, gone, ...many], folders: [linked, week1], removedIds: new Set() };

const selection = "First line of it.\n\nSecond paragraph,\nwrapped.";
const DRAFTS: string[] = [
	"What does @Untitled note say? Also @Untitled note 2.",
	"Read @Waves, part 1 (draft) first",
	"Compare @Lecture notes/week1/notes.md with @Notes.pdf",
	...TUTOR_ACTIONS.map((action) => tutorMessage(action, page.name, selection)),
	...DOCUMENT_TUTOR_ACTIONS.map((action) => documentTutorMessage(action, { itemId: pdf.id, name: pdf.name, page: 4 }, "A passage </library_passage> with \"quotes\" & <tags>.")),
	"In code: `@Notes.pdf` and\n\n```\n@Untitled note\n```\n",
	"Ask @nobody about it",
	many.map((m) => `@${m.name}`).join(" ") + " @Untitled note",
	"@Untitled note, then @Untitled note again",
	"Old: @Gone note",
	"  spaces, tabs\tand a trailing newline\n\n",
	"Ünïcödé: @Notes.pdf — café́",
];

/** What the chat's send posts for the composer's value (components/session-core.ts). */
const body = (value: string) => JSON.stringify({ input: { type: "text", text: value.trim() } });

/** The textarea's value as rendered, read back as the send would. */
function composerValue(value: string): string {
	const html = renderToStaticMarkup(React.createElement(Composer, { busy: false, value, onChange: () => {}, onSend: () => {}, onStop: () => {}, canSend: true }));
	// A textarea's content is raw text to the parser: undo React's escaping by hand.
	const raw = /<textarea[^>]*>([\s\S]*?)<\/textarea>/.exec(html)![1]!;
	return raw.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");
}

describe("SC-001: byte-identical sends with chips on and off", () => {
	it("covers the recognition contract's draft set", () => {
		assert.ok(DRAFTS.length >= 14 + 9);
		assert.ok(fieldChips(DRAFTS[2]!, catalog).some((chip) => chip.form.span?.entry.id === "mir"), "the mirrored path is one chip");
	});

	for (const [index, draft] of DRAFTS.entries()) {
		it(`draft ${index}: ${JSON.stringify(draft.slice(0, 40))}`, () => {
			// Off: today's field. On: the same field with the mirror drawn behind it.
			const off = composerValue(draft);
			const chips = fieldChips(draft, catalog);
			const mirror = renderToStaticMarkup(React.createElement("div", null, mirrorPieces(draft, chips, null)));
			const drawn = parseHTML(`<html><body>${mirror}</body></html>`).document.body.textContent!.replace(/​$/, "");
			assert.equal(drawn, draft, "the mirror draws the value as is");
			const on = composerValue(draft);
			assert.equal(body(on), body(off));
			assert.equal(body(on), body(draft));
			// The only edit the overlay makes is a key's own (Backspace/Delete), never a render's.
			assert.equal(chipDeleteRange(draft, { start: 0, end: draft.length }, { key: "Backspace" }, chips.map((c) => c.form)), null);
		});
	}
});
