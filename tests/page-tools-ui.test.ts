/** Feature 010, US1: the slash menu's trigger and filter, link addresses and
 *  shortcut names, without a browser. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterSlashItems, SLASH_ITEMS, slashEmptyText, slashQuery } from "../components/library/page-slash.ts";
import { normalizeLinkAddress, PAGE_PLACEHOLDER } from "../components/library/page-editor-extras.ts";
import { shortcutLabel } from "../components/library/page-toolbar.tsx";

describe("the slash trigger", () => {
	it("opens on / alone and follows the query", () => {
		assert.equal(slashQuery("/", ""), "");
		assert.equal(slashQuery("/tab", ""), "tab");
		assert.equal(slashQuery("/heading 2", ""), "heading 2");
	});
	it("stays closed mid-line, after the caret, inside paths and on long text", () => {
		assert.equal(slashQuery("a /tab", ""), null);
		assert.equal(slashQuery("/tab", "le"), null);
		assert.equal(slashQuery("/usr/bin", ""), null);
		assert.equal(slashQuery("/ table", ""), null);
		assert.equal(slashQuery(`/${"x".repeat(25)}`, ""), null);
	});
});

describe("the slash filter", () => {
	it("keeps the contract's order and names", () => {
		assert.deepEqual(SLASH_ITEMS.map((i) => i.label), ["Heading 1", "Heading 2", "Heading 3", "Bulleted list", "Numbered list", "Checklist", "Quote", "Code block", "Formula block", "Table", "Image", "Divider"]);
	});
	it("matches a word start, case-insensitively", () => {
		assert.deepEqual(filterSlashItems("ta").map((i) => i.id), ["table"]);
		assert.deepEqual(filterSlashItems("LIST").map((i) => i.id), ["bulletList", "orderedList"]);
		assert.deepEqual(filterSlashItems("block").map((i) => i.id), ["codeBlock", "blockMath"]);
		assert.equal(filterSlashItems("").length, SLASH_ITEMS.length);
		assert.deepEqual(filterSlashItems("zzz"), []);
		assert.equal(slashEmptyText("zzz"), 'No block matches "zzz"');
	});
});

describe("link addresses", () => {
	it("accepts web and mail addresses, adding https to a bare host", () => {
		assert.equal(normalizeLinkAddress("https://example.com/a?b#c"), "https://example.com/a?b#c");
		assert.equal(normalizeLinkAddress(" example.com/path "), "https://example.com/path");
		assert.equal(normalizeLinkAddress("mailto:me@example.com"), "mailto:me@example.com");
	});
	it("refuses scripts, files, spaces and words", () => {
		for (const bad of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", "two words", "notes", "", "mailto:nobody"]) assert.equal(normalizeLinkAddress(bad), null, bad);
	});
});

describe("names", () => {
	it("shortcuts read ⌘ on a Mac", () => {
		assert.equal(shortcutLabel("Ctrl Shift 8", true), "⌘ Shift 8");
		assert.equal(shortcutLabel("Ctrl K", false), "Ctrl K");
	});
	it("the placeholder is the contract's sentence", () => {
		assert.equal(PAGE_PLACEHOLDER, "Start writing, or type / for headings, lists, tables and formulas.");
	});
});

describe("History (US4)", async () => {
	const { changeViewRows, versionLabel } = await import("../components/library/page-history.tsx");
	it("labels a named version and a tutor undo", () => {
		assert.match(versionLabel({ n: 5, author: "learner", at: "2026-10-30T10:00:00Z", name: "Before exam" }), /^Version 5 · You · .* · Before exam$/);
		assert.match(versionLabel({ n: 6, author: "learner", at: "2026-10-30T10:00:00Z", cause: "undo-agent" }), /^Version 6 · You · .* · Undid the tutor's edit$/);
	});
	it("folds unchanged runs into one count", () => {
		assert.deepEqual(changeViewRows([
			{ kind: "same", markdown: "a" }, { kind: "same", markdown: "b" },
			{ kind: "removed", markdown: "c" }, { kind: "added", markdown: "c2" },
			{ kind: "same", markdown: "d" },
		]), [{ kind: "same", count: 2 }, { kind: "removed", markdown: "c" }, { kind: "added", markdown: "c2" }, { kind: "same", count: 1 }]);
	});
});

describe("outline, word count and export (US5)", async () => {
	const { getSchema } = await import("@tiptap/core");
	const { Node: PmNode } = await import("@tiptap/pm/model");
	const { pageExtensions, parsePageMarkdown } = await import("../components/library/page-markdown.ts");
	const { pageStats } = await import("../components/library/page-editor-extras.ts");
	const { countWords } = await import("../components/library/page-blocks.ts");
	const { markdownFileName } = await import("../components/library/page-export.tsx");
	const { wordsText } = await import("../components/library/page-pane.tsx");
	const docOf = (md: string) => PmNode.fromJSON(getSchema(pageExtensions()), parsePageMarkdown(md));

	it("counts prose words, not formulas, code or images", () => {
		const stats = pageStats(docOf("# Eigen values\n\nOne two $x^2 + y$ three `code here`.\n\n$$\na+b\n$$\n\n```\nnot counted\n```\n\n![alt words](a.png)\n"), countWords);
		assert.equal(stats.words, 5);
	});
	it("lists h1 to h3 with their positions, in order", () => {
		const stats = pageStats(docOf("# A\n\n## B\n\ntext\n\n### C\n\n#### D\n"), countWords);
		assert.deepEqual(stats.headings.map((h) => [h.level, h.text]), [[1, "A"], [2, "B"], [3, "C"]]);
		assert.ok(stats.headings.every((h, i, all) => i === 0 || h.pos > all[i - 1]!.pos));
	});
	it("names files and words", () => {
		assert.equal(markdownFileName("Week 3: notes/draft"), "Week 3- notes-draft.md");
		assert.equal(markdownFileName("  "), "Page.md");
		assert.equal(wordsText(1), "1 word");
		assert.equal(wordsText(0), "0 words");
	});
});
