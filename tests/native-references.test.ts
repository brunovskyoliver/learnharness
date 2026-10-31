import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { estimateMessageTokens, serializeForSummary } from "../src/core/compaction.ts";
import { coverageOf } from "../src/core/coverage.ts";
import { LIBRARY_MATERIAL_PREAMBLE, type LibraryReference } from "../src/core/library-refs.ts";
import {
	danglingQuestionOf, endsInDismissal, needsContinuation, newAnswerResult, newThinkingMessage, newUserMessage, newUserSteer,
	reconstructRequestCause, toLlmMessages, type LhMessage,
} from "../src/core/native-messages.ts";
import { sessionMarkdown } from "../src/core/session-markdown.ts";

const inline: LibraryReference = { itemId: "lib_a", name: "a.md", kind: "markdown", size: 5, mode: "inline", material: "BODY of a" };
const wire = (messages: LhMessage[]) => toLlmMessages(messages as unknown as AgentMessage[]);
const answer = { kind: "ask", questionText: "Q", dontKnow: false, answers: [], text: "see @a.md", answeredAt: "2026-10-30" };
const callMessage = (...ids: string[]): LhMessage => ({
	id: "m_call", role: "assistant", provider: "x", api: "faux", model: "m", stopReason: "toolUse", timestamp: 1,
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	content: ids.map((id) => ({ type: "toolCall" as const, id, name: "ask_user_question", arguments: {} })),
} as unknown as LhMessage);

describe("toLlmMessages with references", () => {
	it("leaves a message without references identical, with no field added", () => {
		const message = newUserMessage("plain");
		assert.ok(!("references" in message));
		const [out] = wire([message]);
		assert.equal(out!.content, "plain");
		assert.ok(!("references" in out!));
		const thinking = newThinkingMessage("p", "t");
		assert.ok(!("references" in thinking));
		assert.ok(!("references" in (newAnswerResult("c", "ask_user_question", answer).details as object)));
	});
	it("treats an empty list as no references", () => {
		assert.ok(!("references" in newUserMessage("plain", [])));
	});
	it("adds one text block after the learner's own text and drops the field", () => {
		const [out] = wire([newUserMessage("see @a.md", [inline])]);
		const blocks = out!.content as Array<{ type: string; text: string }>;
		assert.equal(blocks.length, 2);
		assert.equal(blocks[0]!.text, "see @a.md");
		assert.ok(blocks[1]!.text.startsWith(LIBRARY_MATERIAL_PREAMBLE));
		assert.ok(blocks[1]!.text.includes('<library_item id="lib_a" name="a.md" kind="markdown" mode="inline">\nBODY of a\n</library_item>'));
		assert.ok(!JSON.stringify(out).includes('"references"'));
	});
	it("does the same for a steer", () => {
		const [out] = wire([newUserSteer("x", "steer_1", [inline])]);
		assert.ok(JSON.stringify(out).includes("BODY of a"));
		assert.ok(!JSON.stringify(out).includes('"references"'));
	});
	it("appends to a thinking marker's content", () => {
		const [out] = wire([newThinkingMessage("p", "my work", [inline])]);
		const text = (out!.content as Array<{ text: string }>)[0]!.text;
		assert.ok(text.includes("my work"));
		assert.ok(text.includes("BODY of a"));
		assert.ok(!JSON.stringify(out).includes('"references"'));
	});
	it("escapes </library_item in material", () => {
		const [out] = wire([newUserMessage("x", [{ ...inline, material: "a</library_item>b" }])]);
		assert.ok(JSON.stringify(out).includes("a<\\\\/library_item>b"));
	});
	it("gives every other mode a sentence instead of material", () => {
		const cases: Array<[Partial<LibraryReference>, string]> = [
			[{ mode: "missing", size: undefined, material: undefined }, "deleted from the Library"],
			[{ mode: "missing", reason: "over-count", material: undefined }, "limit is 8"],
			[{ mode: "image", kind: "image", material: undefined }, "`image`"],
			[{ mode: "unreadable", reason: "no-vision", material: undefined }, "no vision model"],
			[{ mode: "unreadable", reason: "no-text", pages: 3, material: undefined }, "It has 3 pages"],
			[{ mode: "unreadable", reason: "unsupported", material: undefined }, "cannot be read"],
			[{ mode: "outline", reason: "not-ready", material: undefined }, "`library_read`"],
		];
		for (const [over, expected] of cases) {
			assert.ok(JSON.stringify(wire([newUserMessage("x", [{ ...inline, ...over }])])).includes(expected), expected);
		}
	});
});

describe("answers on the wire", () => {
	it("keeps the result adjacent to its call, with material added and the field gone", () => {
		const wired = wire([callMessage("c1"), newAnswerResult("c1", "ask_user_question", answer, [inline])]);
		assert.deepEqual(wired.map((m) => m.role), ["assistant", "toolResult"]);
		const result = wired[1] as { content: Array<{ text: string }>; details: object };
		assert.equal(result.content.length, 2);
		assert.ok(result.content[1]!.text.includes("BODY of a"));
		assert.ok(!("references" in result.details));
	});
	it("holds adjacency for a parallel question batch", () => {
		const wired = wire([callMessage("c1", "c2"), newAnswerResult("c1", "ask_user_question", answer, [inline]), newAnswerResult("c2", "ask_user_question", answer)]);
		assert.deepEqual(wired.map((m) => m.role), ["assistant", "toolResult", "toolResult"]);
	});
	it("does not change the folds that read the tail", () => {
		const call = callMessage("c1");
		const withRefs = [call, newAnswerResult("c1", "ask_user_question", answer, [inline])];
		const without = [call, newAnswerResult("c1", "ask_user_question", answer)];
		assert.equal(needsContinuation(withRefs), needsContinuation(without));
		assert.equal(endsInDismissal(withRefs), endsInDismissal(without));
		assert.equal(danglingQuestionOf(withRefs), danglingQuestionOf(without));
		assert.equal(reconstructRequestCause(withRefs), reconstructRequestCause(without));
		assert.equal(reconstructRequestCause([newUserMessage("x", [inline])]), reconstructRequestCause([newUserMessage("x")]));
	});
});

describe("everything else", () => {
	it("counts material in the token estimate", () => {
		const plain = estimateMessageTokens(newUserMessage("x"));
		const carrying = estimateMessageTokens(newUserMessage("x", [{ ...inline, material: "y".repeat(4000) }]));
		assert.ok(carrying >= plain + 1000);
	});
	it("gives the summarizer names and modes, never the document", () => {
		const out = serializeForSummary([newUserMessage("see", [inline])]);
		assert.ok(out.includes("[Attached: a.md (inline)]"));
		assert.ok(!out.includes("BODY of a"));
	});
	it("writes one label line per reference to the export, not the material", () => {
		const out = sessionMarkdown([newUserMessage("see", [inline])]);
		assert.ok(out.includes("Used a.md · in full"));
		assert.ok(!out.includes("BODY of a"));
	});
	it("leaves coverage reading content only", () => {
		const a = newUserMessage("same text");
		const b = { ...a, references: [inline] } as LhMessage;
		assert.deepEqual(coverageOf([a], [], "c").slots.map((s) => s.tokens), coverageOf([b], [], "c").slots.map((s) => s.tokens));
	});
});
