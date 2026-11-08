import React from "react";
(globalThis as Record<string, unknown>).React = React;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { KIND_ICON, ReferenceChip } from "../components/reference-chip.tsx";
import { sentEntries } from "../components/reference-text.tsx";
import { chipTarget, chipTargets, referenceForms, referenceSpans, type ChipInput, type LibraryFolder, type LibraryItem, type LibraryKind, type LibraryReference } from "../src/core/index.ts";

// Feature 027, T015 + T054: the chip as markup (contracts/ui-contract.md §1).

const base: ChipInput = { itemId: "lib_a", state: "live", name: "Untitled note", kind: "page" };
const render = (input: ChipInput, source = "@Untitled note") => renderToStaticMarkup(<ReferenceChip target={chipTarget(input)} chipId="m1:0" source={source} />);
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#x27;/g, "'");

describe("ReferenceChip", () => {
	it("a live item is a link with its name, state, focus key and source", () => {
		const html = render(base);
		assert.match(html, /^<a /);
		assert.match(html, /href="\/library\?item=lib_a"/);
		assert.match(html, /class="lh-ref-chip"/);
		assert.match(html, /data-state="live"/);
		assert.match(html, /data-ref-chip="m1:0"/);
		assert.match(html, /data-source="@Untitled note"/);
		assert.match(html, /aria-label="Open Untitled note, Page"/);
		assert.equal(text(html), "Untitled note");
	});
	it("draws one icon per kind, hidden from assistive tech", () => {
		const kinds: LibraryKind[] = ["page", "markdown", "text", "code", "csv", "pdf", "image", "diagram", "other"];
		for (const kind of kinds) {
			const html = render({ ...base, kind });
			assert.match(html, /<svg[^>]*class="[^"]*lh-ref-chip-icon[^"]*"[^>]*aria-hidden="true"/, kind);
			assert.match(html, new RegExp(`data-kind="${kind}"`));
		}
		assert.equal(KIND_ICON.markdown, KIND_ICON.text);
		assert.equal(new Set(Object.values(KIND_ICON)).size, 8);
	});
	it("a page hint and a passage hint sit in the truncating hint span", () => {
		const page = render({ ...base, name: "Notes.pdf", kind: "pdf", page: 4, quote: "words" });
		assert.match(page, /<span class="lh-ref-chip-hint" data-testid="ref-chip-hint">· p. 4<\/span>/);
		assert.match(page, /aria-description="words"/);
		const passage = render({ ...base, quote: "The first line\nmore" });
		assert.equal(text(passage), "Untitled note · The first line");
		assert.match(passage, /aria-label="Open Untitled note at the passage &quot;The first line more&quot;"/);
	});
	it("trashed links to its Trash entry", () => {
		const html = render({ ...base, state: "trashed", trashEntryId: "tr_1" });
		assert.match(html, /href="\/library\?view=trash&amp;entry=tr_1"/);
		assert.match(html, /aria-label="Open Untitled note in the trash"/);
	});
	it("unknown renders as sent and opens as live", () => {
		const html = render({ ...base, state: "unknown" });
		assert.match(html, /^<a /);
		assert.match(html, /data-state="unknown"/);
	});
	it("deleted for good is faint text, not a link: \" · no longer in your Library\"", () => {
		const html = render({ ...base, state: "deleted", quote: "x" });
		assert.match(html, /^<span /);
		assert.ok(!html.includes("href="));
		assert.ok(!html.includes("tabindex"));
		assert.match(html, /data-state="deleted"/);
		assert.equal(text(html), "Untitled note · no longer in your Library");
	});
});

describe("feature 026 (T054) and equal names (M2)", () => {
	const mirrored = (id: string, parent: string): ChipInput => ({ itemId: id, state: "live", name: "notes.md", kind: "markdown", path: `Lecture notes/${parent}/notes.md`, parent });
	it("a mirrored live item shows its file name", () => {
		const html = renderToStaticMarkup(<ReferenceChip target={chipTarget(mirrored("a", "week1"))} source="@Lecture notes/week1/notes.md" />);
		assert.equal(text(html), "notes.md");
		assert.match(html, /data-source="@Lecture notes\/week1\/notes.md"/);
	});
	it("after a linked-folder rename it still shows the file name", () => {
		const html = renderToStaticMarkup(<ReferenceChip target={chipTarget({ ...mirrored("a", "week1"), path: "Notes/week1/notes.md" })} source="@Lecture notes/week1/notes.md" />);
		assert.equal(text(html), "notes.md");
	});
	it("removed from the repo: faint text, \" · Removed from the repo\"", () => {
		const html = renderToStaticMarkup(<ReferenceChip target={chipTarget({ ...mirrored("a", "week1"), state: "removed" })} source="@Lecture notes/week1/notes.md" />);
		assert.match(html, /^<span /);
		assert.match(html, /data-state="removed"/);
		assert.equal(text(html), "notes.md · Removed from the repo");
	});
	it("two notes.md chips show their folder faintly and speak their paths", () => {
		const [one, two] = chipTargets([mirrored("a", "week1"), mirrored("b", "week2")]).map((target) => renderToStaticMarkup(<ReferenceChip target={target} source="" />));
		assert.equal(text(one!), "notes.md · week1");
		assert.match(one!, /<span class="lh-ref-chip-folder">· week1<\/span>/);
		assert.match(two!, /aria-label="Open Lecture notes\/week2\/notes.md, Markdown"/);
	});
});

describe("sent messages find what was attached (T026, T055)", () => {
	const ref = (itemId: string, name: string, extra: Partial<LibraryReference> = {}): LibraryReference => ({ itemId, name, kind: "markdown", mode: "inline", ...extra });
	it("by the name it was sent with, before the Library is read", () => {
		const text = "What does @Untitled note 2 say beside @Untitled note?";
		const spans = referenceSpans(text, sentEntries([ref("a", "Untitled note"), ref("b", "Untitled note 2")], null));
		assert.deepEqual(spans.map((s) => [s.entry.id, text.slice(s.start, s.end)]), [["b", "@Untitled note 2"], ["a", "@Untitled note"]]);
	});
	it("a mirrored live item by its Library path, one chip over the whole token", () => {
		const folders: LibraryFolder[] = [
			{ id: "f1", name: "Lecture notes", parentId: null, createdAt: "", mirror: { linkId: "l", path: "" } } as LibraryFolder,
			{ id: "f2", name: "week1", parentId: "f1", createdAt: "", mirror: { linkId: "l", path: "week1" } } as LibraryFolder,
		];
		const live = { id: "m", name: "notes.md", kind: "markdown", size: 1, createdAt: "", updatedAt: "", origin: { type: "upload" }, folderId: "f2", mirror: { linkId: "l", path: "week1/notes.md" } } as unknown as LibraryItem;
		const text = "Compare @Lecture notes/week1/notes.md now";
		const spans = referenceSpans(text, sentEntries([ref("m", "notes.md", { fromRepo: true })], new Map([["m", { state: "live", item: live }]])), folders);
		assert.equal(spans.length, 1);
		assert.equal(text.slice(spans[0]!.start, spans[0]!.end), "@Lecture notes/week1/notes.md");
	});
	it("a removed mirrored item by the paths the server kept", () => {
		const text = "and @Lecture notes/week2/notes.md.";
		const spans = referenceSpans(text, sentEntries([ref("r", "notes.md", { fromRepo: true })], new Map([["r", { state: "removed", paths: ["Lecture notes/week2/notes.md"] }]])));
		assert.equal(text.slice(spans[0]!.start, spans[0]!.end), "@Lecture notes/week2/notes.md");
		assert.equal(spans[0]!.entry.id, "r");
	});
	it("the page form keeps its passage for the chip", () => {
		const text = "About this part of @Untitled note:\n\n> Second paragraph.\n\nWhy?";
		const forms = referenceForms(text, referenceSpans(text, sentEntries([ref("a", "Untitled note", { kind: "page" })], null)));
		assert.equal(forms[0]!.quote, "Second paragraph.");
	});
});
