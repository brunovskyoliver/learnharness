/** Feature 019's pure core: folding, passages, queries, snippets, ranking and filters. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	buildSnippet, compareHits, docCountText, docFilterPredicate, docSignature, docStatusText, foldText, foldWithMap, isSearchableKind, jumpOf, pagePassages, parseDocQuery, pdfPassages, plainBlockText, searchShard, snippetRuns, textPassages,
} from "../src/core/document-search.ts";
import type { LibraryItem } from "../src/core/library.ts";

const query = (raw: string) => {
	const parsed = parseDocQuery(raw);
	assert.ok(parsed, raw);
	return parsed;
};
const item = (over: Partial<LibraryItem>): LibraryItem => ({ id: "lib_1", name: "x", kind: "page", size: 1, createdAt: "2026-01-01", updatedAt: "2026-01-01", origin: { type: "learner" }, ...over });

describe("folding", () => {
	it("ignores case, accents and runs of whitespace, and maps back to the source", () => {
		assert.equal(foldText("Ángström\n  ÉCOLE"), "angstrom ecole");
		const folded = foldWithMap("a\n\nÉb");
		assert.equal(folded.text, "a eb");
		assert.equal(folded.map[2], 3, "the É's source offset");
	});
	it("can drop whitespace altogether, for a quote crossing lines", () => {
		assert.equal(foldText("two\nwords here", false), "twowordshere");
	});
	it("keeps astral characters whole", () => {
		assert.equal(foldText("𝒳 x"), "x x");
	});
});

describe("passages", () => {
	it("reads a page as blocks, with Markdown syntax and link targets out of the text", () => {
		const passages = pagePassages("# Waves\n\nA **bold** claim with [a link](/chat/abc#message-1).\n\n```\ncode  block\n\nstill code\n```\n\n[[Other page]] follows.");
		assert.deepEqual(passages.map((p) => p.block), [0, 1, 2, 3]);
		assert.equal(passages[0]!.text, "Waves");
		assert.equal(passages[1]!.text, "A bold claim with a link.");
		assert.ok(passages[2]!.text.includes("still code"), "a fence stays one block");
		assert.equal(passages[3]!.text, "Other page follows.");
	});
	it("doesn't index a source link's address", () => {
		assert.equal(plainBlockText("> Quote\n>\n> [PDF: a.pdf, p. 3](/library?item=lib_x&page=3&quote=secretword)"), "Quote\n\nPDF: a.pdf, p. 3");
	});
	it("reads a text file as runs of lines that know their line", () => {
		const passages = textPassages("one\ntwo\n\nfour");
		assert.equal(passages.length, 1);
		assert.equal(passages[0]!.line, 1);
		const long = textPassages(`${"a".repeat(2500)}\nend`);
		assert.deepEqual(long.map((p) => p.line), [1, 1, 2]);
	});
	it("gives a PDF a passage per page that has text, keeping page numbers", () => {
		assert.deepEqual(pdfPassages(["first", "   ", "third"]).map((p) => [p.page, p.text]), [[1, "first"], [3, "third"]]);
	});
});

describe("queries", () => {
	it("splits terms, keeps a quoted phrase whole, and refuses nothing useful", () => {
		assert.deepEqual(query('wave "linear map" WAVE').terms, ["wave", "linear map"]);
		assert.equal(parseDocQuery(""), null);
		assert.equal(parseDocQuery("a"), null);
		assert.equal(parseDocQuery('""'), null);
	});
	it("treats regex characters as plain text", () => {
		const shard = { itemId: "a", passages: [{ line: 1, text: "cost (.*) here" }] };
		const hits = searchShard(shard, shard.passages.map((p) => foldWithMap(p.text)), "a", query("(.*)"));
		assert.equal(hits.length, 1);
	});
});

describe("snippets", () => {
	it("marks the match, and every match in the window", () => {
		const snippet = buildSnippet("Force equals mass. More force here.", query("force"));
		assert.deepEqual(snippetRuns(snippet).filter((r) => r.match).map((r) => r.text), ["Force", "force"]);
	});
	it("marks the right characters when whitespace and accents fold", () => {
		const snippet = buildSnippet("before\n\n  École   normale after", query('"ecole normale"'));
		assert.equal(snippetRuns(snippet).find((r) => r.match)?.text, "École normale");
	});
	it("cuts long text around the match and says so", () => {
		const snippet = buildSnippet(`${"lorem ".repeat(100)}needle${" ipsum".repeat(100)}`, query("needle"));
		assert.ok(snippet.before && snippet.after);
		assert.ok(snippet.text.length < 200);
		assert.equal(snippet.text.slice(...snippet.ranges[0]!), "needle");
	});
	it("gives plain runs that rebuild the text exactly, with markup left as text", () => {
		const text = 'a <script>alert("needle")</script> b';
		const snippet = buildSnippet(text, query("needle"));
		assert.equal(snippetRuns(snippet).map((r) => r.text).join(""), text);
	});
});

describe("hits", () => {
	const shard = (passages: { page?: number; line?: number; block?: number; text: string }[]) => ({ itemId: "a", passages });
	const run = (passages: Parameters<typeof shard>[0], name: string, raw: string) => searchShard(shard(passages), passages.map((p) => foldWithMap(p.text)), name, query(raw));
	it("needs every term in one passage, and jumps to the page", () => {
		const hits = run([{ page: 2, text: "force and mass" }, { page: 3, text: "only force" }], "a.pdf", "force mass");
		assert.equal(hits.length, 1);
		assert.equal(hits[0]!.jump?.page, 2);
	});
	it("falls back to the fullest passage when the terms are spread across the item", () => {
		const hits = run([{ block: 0, text: "force" }, { block: 1, text: "mass" }], "n", "force mass");
		assert.equal(hits.length, 1);
	});
	it("finds nothing when a term is missing everywhere", () => {
		assert.deepEqual(run([{ block: 0, text: "force" }], "n", "force mass"), []);
	});
	it("lands a text hit on the exact line", () => {
		const hits = run([{ line: 10, text: "a\nb\nneedle c" }], "n", "needle");
		assert.equal(hits[0]!.jump?.line, 12);
	});
	it("matches a name with no text behind it", () => {
		const hits = run([], "Scan of chapter.pdf", "chapter");
		assert.equal(hits[0]!.snippet, null);
		assert.equal(hits[0]!.jump, null);
	});
	it("ranks the same way every time", () => {
		const a = { score: 1, name: "b", id: "1" }, b = { score: 1, name: "a", id: "2" }, c = { score: 5, name: "z", id: "3" };
		assert.deepEqual([a, b, c].sort(compareHits).map((r) => r.id), ["3", "2", "1"]);
		assert.deepEqual([c, a, b].sort(compareHits).map((r) => r.id), ["3", "2", "1"]);
	});
	it("gives a jump's quote in source form", () => {
		const q = query("mass");
		const passage = { page: 4, text: "Force equals Mass times acceleration." };
		assert.equal(jumpOf(passage, q).quote, "Mass times acceleration.");
	});
});

describe("filters", () => {
	const folders = [{ id: "f1", parentId: null }, { id: "f2", parentId: "f1" }];
	it("narrows by kind, tag, folder subtree, and hides archived only when asked", () => {
		const a = item({ id: "a", kind: "pdf", tags: ["exam"], folderId: "f2", archivedAt: "2026-01-01" });
		assert.equal(docFilterPredicate({ kind: "pdf" }, folders)(a), true);
		assert.equal(docFilterPredicate({ kind: "page" }, folders)(a), false);
		assert.equal(docFilterPredicate({ tag: "exam" }, folders)(a), true);
		assert.equal(docFilterPredicate({ tag: "other" }, folders)(a), false);
		assert.equal(docFilterPredicate({ folderId: "f1" }, folders)(a), true, "below the folder counts");
		assert.equal(docFilterPredicate({ folderId: "f1" }, folders)(item({ id: "b" })), false);
		assert.equal(docFilterPredicate({}, folders)(a), true, "archived is searched by default");
		assert.equal(docFilterPredicate({ hideArchived: true }, folders)(a), false);
	});
});

describe("states and words", () => {
	it("only a text change moves the signature", () => {
		const page = item({ headVersion: 2, size: 10 });
		assert.equal(docSignature({ ...page, name: "renamed", folderId: "f" } as LibraryItem), docSignature(page));
		assert.notEqual(docSignature({ ...page, headVersion: 3 }), docSignature(page));
	});
	it("images and other files aren't searchable", () => {
		assert.equal(isSearchableKind("image"), false);
		assert.equal(isSearchableKind("other"), false);
		assert.equal(isSearchableKind("pdf"), true);
	});
	it("says what happened in words", () => {
		assert.equal(docCountText(0, 0), "Nothing matched");
		assert.equal(docCountText(1, 1), "1 match");
		assert.equal(docCountText(50, 80), "Showing 50 of 80 matches");
		assert.equal(docStatusText({ indexed: 2, pending: 1, failed: 0, "no-text": 1, unsupported: 0 }), "2 searched · 1 waiting to be read · 1 with no readable text");
	});
});
