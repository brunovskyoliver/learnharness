/** Feature 017: passages as Markdown, source links, the deterministic lesson
 *  extract, and the graph read. Pure. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPageCodec, parsePageMarkdown, serializePageJson } from "../components/library/page-markdown.ts";
import type { GraphNode } from "../src/core/contracts/graph.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import { appendBlock, escapePassageText, graphLinksOf, lessonPassages, passageBlock, passageMarkdown, scanSourceRefs, sourceHref, sourceHrefChat, studyNotesMarkdown, studyNotesName } from "../src/core/note-sources.ts";

const text = (id: string, value: string): LhMessage => ({ id, role: "assistant", content: [{ type: "text", text: value }], stopReason: "stop" } as unknown as LhMessage);

describe("a passage", () => {
	it("keeps formulas and escapes everything else", () => {
		assert.equal(passageMarkdown([{ text: "Price $5, *not* bold, " }, { tex: "x^2", display: false }, { text: " [[no link]]" }]), "Price \\$5, \\*not\\* bold, $x^2$ &#91;&#91;no link&#93;&#93;");
		assert.equal(passageMarkdown([{ text: "Before" }, { tex: "y=1", display: true }, { text: "After" }]), "Before\n\n$$\ny=1\n$$\n\nAfter");
		assert.equal(escapePassageText("# head\n- item\n1. one"), "\\# head\n\\- item\n1\\. one");
	});
	it("becomes a quote that ends in its source link, and survives the editor", () => {
		const block = passageBlock(passageMarkdown([{ text: "A *star* and " }, { tex: "v", display: false }]), { chatId: "c 1", messageId: "m/1", title: "Linear [maps]" });
		assert.equal(block, "> A \\*star\\* and $v$\n>\n> [Lesson: Linear \\[maps\\]](/chat/c%201#message-m%2F1)");
		const codec = createPageCodec(`${block}\n`);
		codec.settle(codec.doc);
		assert.equal(codec.toMarkdown(structuredClone(codec.doc)), `${block}\n`);
		assert.equal(codec.doc.content![0]!.type, "blockquote");
		const first = codec.doc.content![0]!.content![0]!.content!;
		assert.deepEqual(first[0], { type: "text", text: "A *star* and " });
		assert.equal(first[1]!.type, "inlineMath");
		assert.equal(serializePageJson(parsePageMarkdown(block)).includes("/chat/c%201#message-m%2F1"), true);
	});
	it("goes after what's there, without touching its bytes", () => {
		assert.equal(appendBlock("", "B"), "B");
		assert.equal(appendBlock("\n", "B"), "B\n");
		assert.equal(appendBlock("A", "B"), "A\n\nB");
		assert.equal(appendBlock("A  \n\n\n", "B"), "A\n\nB\n");
	});
});

describe("source links", () => {
	it("round trips an id through its link", () => {
		const href = sourceHref("c 1", "m/1");
		assert.deepEqual(sourceHrefChat(href), { chatId: "c 1", messageId: "m/1" });
		assert.deepEqual(sourceHrefChat(sourceHref("c", null)), { chatId: "c", messageId: null });
		assert.equal(sourceHrefChat("https://example.org/chat/c"), null);
		assert.equal(sourceHrefChat("/library"), null);
	});
	it("finds them in text", () => {
		assert.deepEqual(scanSourceRefs("a [x](/chat/c1#message-m1) b [y](/chat/c2) [z](https://e.org/chat/c3)").map((r) => [r.chatId, r.messageId]), [["c1", "m1"], ["c2", null]]);
	});
});

describe("study notes", () => {
	const messages: LhMessage[] = [
		{ id: "u1", role: "user", content: [{ type: "text", text: "my question" }] } as unknown as LhMessage,
		text("a1", "First step."),
		{ id: "a2", role: "assistant", stopReason: "stop", content: [
			{ type: "thinking", thinking: "SECRET THINKING" },
			{ type: "text", text: "Second step." },
			{ type: "toolCall", id: "q1", name: "quiz", arguments: { question: "Q?", correctIndex: 2, explanation: "SECRET ANSWER" } },
		] } as unknown as LhMessage,
		{ id: "r1", role: "toolResult", toolCallId: "q1", toolName: "quiz", content: [{ type: "text", text: "SECRET RESULT" }] } as unknown as LhMessage,
		{ id: "a3", role: "assistant", stopReason: "error", content: [{ type: "text", text: "FAILED GENERATION" }] } as unknown as LhMessage,
	];
	it("holds only prose the learner already read, each with its message", () => {
		assert.deepEqual(lessonPassages(messages), [{ messageId: "a1", text: "First step." }, { messageId: "a2", text: "Second step." }]);
		const md = studyNotesMarkdown({ id: "c1", title: "Waves", messages })!;
		assert.equal(md, "First step.\n\n[Lesson: Waves](/chat/c1#message-a1)\n\nSecond step.\n\n[Lesson: Waves](/chat/c1#message-a2)\n");
		for (const secret of ["SECRET", "my question", "FAILED"]) assert.ok(!md.includes(secret), secret);
	});
	it("says nothing rather than make an empty page", () => {
		assert.equal(studyNotesMarkdown({ id: "c", title: "t", messages: messages.slice(0, 1) }), null);
	});
	it("names the page from the title, safely", () => {
		assert.equal(studyNotesName("Waves"), "Study notes: Waves");
		assert.equal(studyNotesName("a/b\\c\n d"), "Study notes: a b c d");
		assert.equal(studyNotesName("  "), "Study notes: Untitled session");
		assert.ok(studyNotesName("x".repeat(500)).length <= 133);
	});
});

describe("the graph, read only", () => {
	const node = (id: string, statement: string, chatId = "other"): GraphNode => ({ id, name: id, statement, aliases: [], createdAt: "", provenance: [{ chatId, messageId: "m" }] });
	it("lists propositions from the cited session first, then those sharing words", () => {
		const nodes = [node("words", "An eigenvalue scales its eigenvector"), node("one", "An eigenvalue exists"), node("cited", "Unrelated statement", "c1"), node("none", "Nothing here")];
		const rows = graphLinksOf("The eigenvalue scales the eigenvector.", ["c1"], nodes);
		assert.deepEqual(rows.map((r) => [r.id, r.reason]), [["cited", "source"], ["words", "terms"]]);
		assert.equal(rows[0]!.href, "/chat/c1#message-m");
	});
	it("doesn't link an imported note's source as a session", () => {
		const imported = { ...node("n", "eigenvalue eigenvector"), provenance: [{ chatId: "src_1", messageId: "" }] };
		assert.equal(graphLinksOf("eigenvalue eigenvector", [], [imported])[0]!.href, null);
	});
});
