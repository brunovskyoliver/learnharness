/** T056a, the owner's gate for TipTap: Markdown round trips on the corpus. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPageCodec, parsePageMarkdown, serializePageJson } from "../components/library/page-markdown.ts";
import { PAGE_CORPUS } from "./fixtures/page-roundtrip-corpus.ts";
import { contentOf } from "./fixtures/page-roundtrip-oracle.ts";

const cycle = (md: string) => serializePageJson(parsePageMarkdown(md));

describe("page Markdown round trip", () => {
	for (const { name, md } of PAGE_CORPUS) {
		describe(name, () => {
			it("opening and saving unedited is byte-identical, once and five times", () => {
				let text = md;
				for (let i = 1; i <= 5; i++) {
					const codec = createPageCodec(text);
					codec.settle(codec.doc);
					text = codec.toMarkdown(structuredClone(codec.doc));
					assert.equal(text, md, `cycle ${i}`);
				}
			});
			it("the plain serializer loses no content after one cycle", () => {
				assert.deepEqual(contentOf(cycle(md)), contentOf(md));
			});
			it("the plain serializer is stable and lossless after five cycles", () => {
				const first = cycle(md);
				let text = first;
				for (let i = 2; i <= 5; i++) {
					text = cycle(text);
					assert.equal(text, first, `cycle ${i}`);
				}
				assert.deepEqual(contentOf(text), contentOf(md));
			});
			it("an edit in one new block keeps every other block's content", () => {
				const codec = createPageCodec(md);
				const edited = structuredClone(codec.doc);
				edited.content = [...(edited.content ?? []), { type: "paragraph", content: [{ type: "text", text: "Learner added this." }] }];
				const out = codec.toMarkdown(edited);
				assert.ok(out.includes("Learner added this."));
				const without = out.replace(/\n*Learner added this\.\n*$/, "\n");
				assert.deepEqual(contentOf(without), contentOf(md));
			});
		});
	}
});

describe("the oracle itself", () => {
	it("notices dropped math, changed TeX, a lost table cell and a fence's text", () => {
		assert.notDeepEqual(contentOf("a $x$ b"), contentOf("a  b"));
		assert.notDeepEqual(contentOf("$$\nx\n$$"), contentOf("$$\ny\n$$"));
		assert.notDeepEqual(contentOf("|a|b|\n|-|-|\n|1|2|"), contentOf("|a|b|\n|-|-|\n|1||"));
		assert.notDeepEqual(contentOf("```\n$x\n```"), contentOf("```\nx\n```"));
		assert.notDeepEqual(contentOf("**t**"), contentOf("t"));
	});
});

describe("source preservation", () => {
	it("an edited page writes untouched blocks back byte for byte", () => {
		const md = "Title\n=====\n\n* star list\n* second\n\n| a|b |\n|-|-|\n| 1|2 |\n\nLast line.\n";
		const codec = createPageCodec(md);
		const edited = structuredClone(codec.doc);
		const last = edited.content!.at(-1)!;
		last.content = [{ type: "text", text: "Changed line." }];
		assert.equal(codec.toMarkdown(edited), "Title\n=====\n\n* star list\n* second\n\n| a|b |\n|-|-|\n| 1|2 |\n\nChanged line.\n");
	});
	it("the caret paragraph the editor adds after a closing block is not an edit", () => {
		const md = "$$\nx\n$$\n";
		const codec = createPageCodec(md);
		codec.settle(codec.doc);
		const withCaret = structuredClone(codec.doc);
		withCaret.content!.push({ type: "paragraph" });
		assert.equal(codec.toMarkdown(withCaret), md);
	});
	it("typed link and task syntax stays literal text", () => {
		for (const text of ["[a](b) is not a link", "[x] not a task", "[^1] not a note", "see [a][b]"]) {
			const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
			assert.deepEqual(parsePageMarkdown(serializePageJson(doc)).content![0]!.content, doc.content[0]!.content, text);
		}
	});
	it("typed specials stay literal after a save and a reload", () => {
		const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Costs $5 and $6, \\(no math\\), # no head, @notes.pdf" }] }] };
		const out = serializePageJson(doc);
		assert.ok(out.includes("@notes.pdf"), "the @ stays bare so references still parse");
		assert.deepEqual(parsePageMarkdown(out).content![0]!.content, doc.content[0]!.content);
	});
});
