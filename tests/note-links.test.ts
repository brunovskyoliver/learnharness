/** Feature 016: wiki link scanning and resolution, backlinks, related notes, and
 *  the editor's parser agreeing with the server's scanner. No model, no files. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPageCodec, parsePageMarkdown, serializePageJson } from "../components/library/page-markdown.ts";
import { backlinksOf, isWikiTarget, outgoingLinks, relatedNotes, resolveWikiTarget, scanWikiLinks, wikiQuery, wikiTable, type NoteDoc } from "../src/core/note-links.ts";
import type { LibraryItem, LibraryTombstone } from "../src/core/library.ts";

const item = (id: string, name: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({ id, name, kind: "page", size: 1, createdAt: "", updatedAt: "", origin: { type: "learner" }, ...extra });
const tomb = (id: string, name: string): LibraryTombstone => ({ id, name, kind: "page", deletedAt: "x" });
const targets = (text: string) => scanWikiLinks(text).map((link) => link.target);

/** The parser's own wiki links, for comparing with the scanner. */
function parsedTargets(md: string): string[] {
	const out: string[] = [];
	const walk = (node: { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }) => {
		if (node.type === "wikiLink") out.push(String(node.attrs?.target));
		for (const child of node.content ?? []) walk(child as never);
	};
	walk(parsePageMarkdown(md) as never);
	return out;
}

describe("scanning", () => {
	const cases: [string, string[]][] = [
		["plain [[A]] and [[B c]]", ["A", "B c"]],
		["`[[code]]` and ``[[two]]``", []],
		["```\n[[fence]]\n```\n\n[[after]]", ["after"]],
		["para\n\n    [[indented]]\n\n[[after]]", ["after"]],
		["$[[1,2]]$ and $$[[3]]$$ then [[real]]", ["real"]],
		["\\[\\[no\\]\\] but \\\\[[yes]]", ["yes"]],
		["[[target]](https://a.example) [[x]][ref]", []],
		["[[a|b]] [[c]d]] [[]] [[ ]]", []],
		["[[[triple]]]", ["triple"]],
		["**[[bold]]** *[[em]]* > [[q]]", ["bold", "em", "q"]],
		["| [[cell]] |\n|---|\n| [[other]] |", ["cell", "other"]],
		["> [!NOTE]\n> in [[callout]]\n\n<details>\n<summary>s</summary>\n\nin [[section]]\n\n</details>\n", ["callout", "section"]],
		["no links at all", []],
	];
	for (const [md, expected] of cases) {
		it(`finds ${JSON.stringify(expected)} in ${JSON.stringify(md)}`, () => assert.deepEqual(targets(md), expected));
		it(`the editor's parser agrees on ${JSON.stringify(md)}`, () => assert.deepEqual(parsedTargets(md), expected));
	}
	it("offers the list only while a link is open", () => {
		assert.deepEqual(wikiQuery("see [[Wa"), { start: 4, query: "Wa" });
		assert.equal(wikiQuery("see [[Wa]]"), null);
		assert.equal(wikiQuery("see [Wa"), null);
		assert.equal(wikiQuery("[[a|b"), null);
		assert.deepEqual(wikiQuery("[["), { start: 0, query: "" });
	});
	it("knows what can't be a target", () => {
		for (const bad of ["", " ", "a]b", "a[b", "a|b", "a\nb", "x".repeat(201)]) assert.equal(isWikiTarget(bad), false, JSON.stringify(bad));
		assert.equal(isWikiTarget("Week 3 notes.md"), true);
	});
});

describe("the Markdown forms", () => {
	const nodeTypes = (md: string) => (parsePageMarkdown(md).content ?? []).map((node) => node.type);
	it("reads each form as its node", () => {
		assert.deepEqual(nodeTypes("> [!NOTE]\n> x\n"), ["callout"]);
		assert.deepEqual(nodeTypes("> [!FOO]\n> x\n"), ["blockquote"]);
		assert.deepEqual(nodeTypes("> plain\n"), ["blockquote"]);
		assert.deepEqual(nodeTypes("<details>\n<summary>S</summary>\n\nx\n\n</details>\n"), ["collapsible"]);
		assert.deepEqual(nodeTypes("<details><summary>S</summary>x</details>\n"), ["rawBlock"], "another form stays raw source");
		assert.equal(parsePageMarkdown("[[A]]").content![0]!.content![0]!.type, "wikiLink");
	});
	it("keeps a callout's kind and title and a section's title and open state", () => {
		const callout = parsePageMarkdown("> [!warning] Mind it\n> x\n").content![0]!;
		assert.deepEqual({ ...callout.attrs }, { kind: "warning", title: "Mind it" });
		const closed = parsePageMarkdown("<details>\n<summary>A &amp; B</summary>\n\nx\n\n</details>\n").content![0]!;
		assert.equal(closed.attrs!.open, false);
		assert.equal(closed.content![0]!.content![0]!.text, "A & B");
		assert.equal(parsePageMarkdown("<details open>\n<summary>S</summary>\n\nx\n\n</details>\n").content![0]!.attrs!.open, true);
	});
	it("writes the documented forms", () => {
		const doc = {
			type: "doc",
			content: [
				{ type: "callout", attrs: { kind: "TIP", title: "" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Body" }] }] },
				{ type: "collapsible", attrs: { open: false }, content: [{ type: "collapsibleSummary", content: [{ type: "text", text: "A < B" }] }, { type: "paragraph", content: [{ type: "wikiLink", attrs: { target: "Waves" } }] }] },
			],
		};
		assert.equal(serializePageJson(doc), "> [!TIP]\n> Body\n\n<details>\n<summary>A &lt; B</summary>\n\n[[Waves]]\n\n</details>");
	});
	it("opening a section changes only its line, and the rest keeps its bytes", () => {
		const md = "Before  *kept*.\n\n<details>\n<summary>S</summary>\n\nx\n\n</details>\n\n* star item\n";
		const codec = createPageCodec(md);
		const edited = structuredClone(codec.doc);
		edited.content![1]!.attrs = { open: true };
		assert.equal(codec.toMarkdown(edited), "Before  *kept*.\n\n<details open>\n<summary>S</summary>\n\nx\n\n</details>\n\n* star item\n");
	});
	it("typed brackets that aren't links stay text after a save and a reload", () => {
		for (const text of ["[[not a link]]", "[!NOTE] not a callout", "x [[ y"]) {
			const doc = { type: "doc", content: [{ type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }] };
			const reloaded = parsePageMarkdown(serializePageJson(doc));
			assert.equal(reloaded.content![0]!.type, "blockquote", text);
			assert.deepEqual(reloaded.content![0]!.content![0]!.content, [{ type: "text", text }], text);
		}
	});
	it("a plain Markdown reader still sees the text", () => {
		const md = "> [!NOTE] Title\n> The body.\n\n<details>\n<summary>Head</summary>\n\nHidden body.\n\n</details>\n\nSee [[Waves]].\n";
		for (const words of ["Title", "The body.", "Head", "Hidden body.", "[[Waves]]"]) assert.ok(md.includes(words), words);
	});
});

describe("resolving", () => {
	it("prefers a current name, then an old one, then a tombstone, and says so when there's nothing", () => {
		const table = wikiTable([item("a", "Now", { previousNames: ["Before"] }), tomb("t", "Gone")]);
		assert.equal(resolveWikiTarget("now", table).id, "a");
		assert.deepEqual(resolveWikiTarget("Before", table), { state: "live", id: "a", name: "Now", kind: "page", size: 1 });
		assert.deepEqual(resolveWikiTarget("Gone", table), { state: "deleted", id: "t", name: "Gone", kind: "page" });
		assert.deepEqual(resolveWikiTarget("Nothing", table), { state: "missing" });
	});
	it("an old name taken by a new page: unpinned links go to it, pinned ones stay", () => {
		const table = wikiTable([item("a", "B", { previousNames: ["A"] }), item("b", "A")]);
		assert.equal(resolveWikiTarget("A", table).id, "b");
		assert.equal(resolveWikiTarget("A", table, { a: "a" }).id, "a");
	});
	it("a pin to something deleted reads as deleted, never as another page", () => {
		const table = wikiTable([tomb("a", "Old"), item("b", "Old")]);
		assert.equal(resolveWikiTarget("Old", table, { old: "a" }).state, "deleted");
	});
});

const doc = (id: string, name: string, text: string, extra: Partial<NoteDoc> = {}): NoteDoc => ({ id, name, text, ...extra });

describe("backlinks and links", () => {
	const docs = [doc("a", "A", "see [[B]] and [[B]] again"), doc("b", "B", "self [[B]], out [[C]] [[Nope]]"), doc("c", "C", "`[[B]]` in code"), doc("d", "D", "see [[Old B]]", { archived: true })];
	const table = wikiTable([item("a", "A"), item("b", "B", { previousNames: ["Old B"] }), item("c", "C"), item("d", "D")]);
	it("lists pages linking here, not itself, counting each and following renames", () => {
		const rows = backlinksOf("b", docs, table);
		assert.deepEqual(rows.map((row) => [row.id, row.count, Boolean(row.archived)]), [["a", 2, false], ["d", 1, true]]);
		assert.equal(rows[0]!.snippet, "see [[B]] and [[B]] again");
	});
	it("outgoing links keep dangling ones, once each", () => {
		assert.deepEqual(outgoingLinks(docs[1]!, table).map((row) => [row.target, row.resolution.state]), [["B", "live"], ["C", "live"], ["Nope", "missing"]]);
	});
	it("is deterministic, whatever order the pages arrive in", () => {
		assert.deepEqual(backlinksOf("b", [...docs].reverse(), table), backlinksOf("b", docs, table));
	});
});

describe("related notes", () => {
	const table = wikiTable([item("a", "A"), item("b", "B"), item("c", "C"), item("d", "D"), item("e", "E"), item("hub", "Hub")]);
	const docs = [
		doc("a", "A", "eigenvalue decomposition with [[Hub]]", { tags: ["exam"], folderId: "f" }),
		doc("b", "B", "unrelated text", { tags: ["exam"] }),
		doc("c", "C", "also [[Hub]]"),
		doc("d", "D", "links to [[A]] directly", { tags: ["exam"] }),
		doc("e", "E", "unrelated", { folderId: "f" }),
		doc("hub", "Hub", "hub"),
	];
	it("scores by shared tags and links, says why, and leaves out direct links", () => {
		const rows = relatedNotes("a", docs, table);
		assert.deepEqual(rows.map((row) => row.id), ["b", "c"]);
		assert.equal(rows[0]!.reason, "1 shared tag");
		assert.equal(rows[1]!.reason, "1 shared link");
	});
	it("a folder alone is not enough, and archived pages stay out", () => {
		assert.ok(!relatedNotes("a", docs, table).some((row) => row.id === "e"));
		const archived = docs.map((d) => (d.id === "b" ? { ...d, archived: true } : d));
		assert.ok(!relatedNotes("a", archived, table).some((row) => row.id === "b"));
	});
	it("counts the same lesson, and rare words only", () => {
		const sessions = (d: NoteDoc) => (d.id === "a" || d.id === "e" ? ["chat"] : []);
		const row = relatedNotes("a", docs, table, {}, sessions).find((r) => r.id === "e")!;
		assert.ok(row.reason.includes("Same lesson") && row.reason.includes("Same folder"));
		const words = [doc("x", "X", "eigenvalue spectrum"), doc("y", "Y", "eigenvalue spectrum again"), doc("z", "Z", "nothing"), doc("w", "W", "other"), doc("v", "V", "more"), doc("u", "U", "words")];
		const rows = relatedNotes("x", words, wikiTable(words.map((d) => item(d.id, d.name))));
		assert.deepEqual(rows.map((r) => [r.id, r.reason]), [["y", "Both mention eigenvalue, spectrum"]]);
	});
});

describe("the editor's bundle", () => {
	it("page-markdown stays free of the DOM at import", async () => {
		const { pageExtensions } = await import("../components/library/page-markdown.ts");
		assert.ok(pageExtensions().some((extension) => extension.name === "wikiLink"));
	});
});
