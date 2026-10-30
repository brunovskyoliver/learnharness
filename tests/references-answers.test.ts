import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dismissAppends, inputAppends, inputReferenceTexts, type ChatInput } from "../src/core/input-events.ts";
import type { LibraryReference } from "../src/core/library-refs.ts";
import { newAnswerResult, type LhMessage } from "../src/core/native-messages.ts";
import { compactAnswerForModel, type QuestionAnswerData } from "../src/core/question-core.ts";
import { projectView } from "../src/core/view.ts";
import { clientMessages } from "../src/server/chats.ts";
import { withoutWireMaterial } from "../src/server/pi/ui-stream.ts";

const ref: LibraryReference = { itemId: "lib_a", name: "a.md", kind: "markdown", size: 5, mode: "inline", material: "SECRET MATERIAL" };
const quiz: QuestionAnswerData = {
	kind: "quiz", questionText: "Q", dontKnow: false, answers: [{ index: 1, label: "A" }] as QuestionAnswerData["answers"],
	correct: true, confidence: 70, thinking: "see @a.md", answeredAt: "2026-10-30",
};
const pendingCall = (name = "quiz"): LhMessage => ({
	id: "m", role: "assistant", provider: "x", api: "faux", model: "m", stopReason: "toolUse", timestamp: 1,
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	content: [{ type: "toolCall", id: "c1", name, arguments: {} }],
} as unknown as LhMessage);

describe("answers with references", () => {
	it("leaves the model's compact answer, grading and confidence unchanged", () => {
		const result = newAnswerResult("c1", "quiz", quiz, [ref]);
		const expected = JSON.stringify(compactAnswerForModel(quiz));
		assert.equal((result.content[0] as { text: string }).text, expected);
		const details = result.details as unknown as QuestionAnswerData;
		assert.equal(details.correct, true);
		assert.equal(details.confidence, 70);
	});
	it("parses only text, other and thinking", () => {
		const answer = { ...quiz, text: "t", other: "o", thinking: "k", questionText: "@a.md", readingThinking: "r" };
		assert.deepEqual(inputReferenceTexts({ type: "answer", toolCallId: "c1", answer }), ["t", "o", "k"]);
	});
	it("gives a dismissal and an empty \"I don't know\" nothing to parse", () => {
		assert.deepEqual(inputReferenceTexts({ type: "answer", toolCallId: "c1", answer: { ...quiz, dismissed: true } }), []);
		const dontKnow: QuestionAnswerData = { kind: "quiz", questionText: "Q", dontKnow: true, answers: [], answeredAt: "x" };
		assert.deepEqual(inputReferenceTexts({ type: "answer", toolCallId: "c1", answer: dontKnow }), []);
	});
	it("parses nothing for inputs with no learner text of their own", () => {
		for (const input of [{ type: "continue" }, { type: "next" }] as ChatInput[]) assert.deepEqual(inputReferenceTexts(input), []);
	});
	it("ignores references a client sent on an answer", () => {
		const sneaky = { ...quiz, references: [{ ...ref, material: "from the client" }] } as QuestionAnswerData;
		const [result] = inputAppends({ messages: [pendingCall()] }, { type: "answer", toolCallId: "c1", answer: sneaky });
		assert.ok(!JSON.stringify(result).includes("from the client"));
	});
	it("ignores references a client sent on a dismissal", () => {
		const sneaky = { ...quiz, dismissed: true, references: [ref] } as QuestionAnswerData;
		const [result] = dismissAppends({ messages: [pendingCall()] }, { type: "dismiss", toolCallId: "c1", answer: sneaky });
		assert.ok(!("references" in ((result as { details: object }).details)));
	});
	it("ignores references a client sent on a text input", () => {
		const input = { type: "text", text: "hi", references: [ref] } as ChatInput;
		const [message] = inputAppends({ messages: [] }, input);
		assert.ok(!("references" in message!));
	});
});

describe("the client view", () => {
	const record = [pendingCall(), newAnswerResult("c1", "quiz", quiz, [ref])];
	it("carries no material on an answer", () => {
		const out = clientMessages(record);
		assert.ok(!JSON.stringify(out).includes("SECRET MATERIAL"));
		const details = (out[1] as { details: { references: LibraryReference[] } }).details;
		assert.equal(details.references[0]!.name, "a.md");
		assert.deepEqual(Object.keys(details).filter((k) => !(k in quiz)), ["references"], "nothing else is new");
	});
	it("carries no material on a user message or a thinking marker", () => {
		const user = { id: "u", role: "user", content: "x", references: [ref], timestamp: 1 } as LhMessage;
		const marker = { id: "t", role: "custom", customType: "practice-thinking", content: "x", display: true, details: { text: "x" }, references: [ref], timestamp: 1 } as LhMessage;
		assert.ok(!JSON.stringify(clientMessages([user, marker])).includes("SECRET MATERIAL"));
	});
	it("does not touch the stored record", () => {
		clientMessages(record);
		assert.ok(JSON.stringify(record).includes("SECRET MATERIAL"));
	});
	it("puts the label part before the text, without material", () => {
		const user = { id: "u", role: "user", content: "x", references: [ref], timestamp: 1 } as LhMessage;
		const [view] = projectView([user]);
		assert.deepEqual(view!.parts.map((p) => p.type), ["data-library-references", "text"]);
		assert.ok(!JSON.stringify(view).includes("SECRET MATERIAL"));
	});
	it("puts the label part before a thinking card", () => {
		const marker = { id: "t", role: "custom", customType: "practice-thinking", content: "x", display: true, details: { text: "x" }, references: [ref], timestamp: 1 } as LhMessage;
		const [view] = projectView([marker]);
		assert.deepEqual(view!.parts.map((p) => p.type), ["data-library-references", "data-practice-thinking"]);
	});
	it("adds no part when there are no references", () => {
		const [view] = projectView([{ id: "u", role: "user", content: "x", timestamp: 1 } as LhMessage]);
		assert.deepEqual(view!.parts.map((p) => p.type), ["text"]);
	});
});

describe("live stream events", () => {
	const user = { id: "u", role: "user", content: "x", references: [ref], timestamp: 1 } as LhMessage;
	it("carry no material on a message event", () => {
		const out = withoutWireMaterial({ type: "message_start", message: user } as never);
		assert.ok(!JSON.stringify(out).includes("SECRET MATERIAL"));
		assert.ok(JSON.stringify(out).includes("a.md"));
	});
	it("carry no material in agent_end's whole list or turn_end's results", () => {
		const result = newAnswerResult("c1", "quiz", quiz, [ref]);
		assert.ok(!JSON.stringify(withoutWireMaterial({ type: "agent_end", messages: [user, result] } as never)).includes("SECRET MATERIAL"));
		assert.ok(!JSON.stringify(withoutWireMaterial({ type: "turn_end", message: user, toolResults: [result] } as never)).includes("SECRET MATERIAL"));
	});
	it("pass other events through as they are", () => {
		const event = { type: "agent_start" } as never;
		assert.equal(withoutWireMaterial(event), event);
	});
});
