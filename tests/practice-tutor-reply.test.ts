import assert from "node:assert/strict";
import { it } from "node:test";
import { latestTutorReplyOf, newThinkingMessage, type LhMessage } from "../src/core/native-messages.ts";

/* Bug practice-hint-in-card: the problem card shows the tutor's latest reply
   to the learner's work, so a hint that asks something sits where they type. */

const assistant = (content: unknown[], stopReason = "stop") =>
	({ id: `a${Math.random()}`, role: "assistant", content, stopReason, timestamp: 0 }) as unknown as LhMessage;

it("null before the learner's first try on the problem", () => {
	const messages = [assistant([{ type: "toolCall", id: "p1", name: "problem", arguments: { statement: "∫x² dx" } }])];
	assert.equal(latestTutorReplyOf(messages, "p1"), null);
});

it("the tutor's prose after the latest try, text and send_to_user alike", () => {
	const messages = [
		newThinkingMessage("p1", "1/2 x^3 + c"),
		assistant([{ type: "text", text: "Not correct. Differentiate your answer: does it give back $x^2$?" }]),
		newThinkingMessage("p1", "2x"),
		assistant([{ type: "toolCall", id: "m1", name: "math_check", arguments: {} }]),
		assistant([{ type: "toolCall", id: "s1", name: "send_to_user", arguments: { message: "Differentiate your own answer, not $x^2$." } }]),
	];
	assert.equal(latestTutorReplyOf(messages, "p1"), "Differentiate your own answer, not $x^2$.");
});

it("ignores tries on another problem and replies with no prose yet", () => {
	const messages = [
		newThinkingMessage("p1", "x^3/3 + C"),
		assistant([{ type: "toolCall", id: "m1", name: "math_check", arguments: {} }]),
		newThinkingMessage("p0", "old"),
	];
	assert.equal(latestTutorReplyOf(messages, "p1"), null);
});
