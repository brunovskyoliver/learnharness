/**
 * WAITING ITEMS (feature 002): the allowlisted projection Home's "Waiting
 * for you" list reads from the chat summary. Pins the kind labels shared
 * with the prompt bar, problem-over-question, the answered/dismissed cases,
 * and — Principle II — that only the five allowlisted keys cross the list
 * seam, with no correct-answer or explanation text.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

// ── the seam, BEFORE any config-loading import ──────────────────────────────
const TMP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "lh-waiting-"));
process.env.LH_DATA_DIR = TMP_DATA;

const { chatStore } = await import("../src/store/chats.ts");
const { questionKindLabel, waitingItemOf } = await import("../src/core/index.ts");
type LhMessage = import("../src/core/index.ts").LhMessage;

after(() => {
	fs.rmSync(TMP_DATA, { recursive: true, force: true });
});

const POSTED = Date.UTC(2026, 9, 28, 9, 14);
const UPDATED = "2026-10-28T10:00:00.000Z";

const ask = (id: string, name: string, args: Record<string, unknown>, timestamp: number | null = POSTED): LhMessage => ({
	id: `m-${id}`,
	role: "assistant",
	content: [{ type: "text", text: "Your turn." }, { type: "toolCall", id, name, arguments: args }],
	...(timestamp === null ? {} : { timestamp }),
}) as never;

const result = (toolCallId: string, toolName: string, isError = false): LhMessage => ({
	id: `r-${toolCallId}`,
	role: "toolResult",
	toolCallId,
	toolName,
	content: [{ type: "text", text: "ok" }],
	isError,
	timestamp: POSTED + 1000,
}) as never;

const quiz = {
	question: "What happens to the loss if the learning rate is ten times too large?",
	type: "check",
	options: [
		{ label: "It diverges", value: "a", description: "SECRET-OPTION-DESCRIPTION" },
		{ label: "It converges faster", value: "b" },
	],
	correctAnswer: "SECRET-CORRECT-ANSWER",
	explanation: "SECRET-EXPLANATION",
	details: "SECRET-DETAILS",
};

describe("questionKindLabel — the prompt bar's and the list's one mapping", () => {
	it("labels each question tool", () => {
		assert.equal(questionKindLabel("quiz", "check"), "Lesson check");
		assert.equal(questionKindLabel("quiz"), "Lesson check");
		assert.equal(questionKindLabel("quiz", "predict"), "Prediction");
		assert.equal(questionKindLabel("explain"), "Explain");
		assert.equal(questionKindLabel("explain", "predict"), "Prediction");
		assert.equal(questionKindLabel("probe", "predict"), "Question");
		assert.equal(questionKindLabel("recall"), "Recall");
		assert.equal(questionKindLabel("ask_user_question"), "Question");
	});
});

describe("waitingItemOf", () => {
	it("a pending check: kind, Answer, teaser and posted time", () => {
		assert.deepEqual(waitingItemOf([ask("q1", "quiz", quiz)], UPDATED), {
			toolCallId: "q1",
			kind: "Lesson check",
			action: "Answer",
			teaser: quiz.question,
			postedAt: new Date(POSTED).toISOString(),
		});
	});

	it("labels every question kind with Answer", () => {
		const cases: Array<[string, Record<string, unknown>, string]> = [
			["quiz", { question: "Q?", type: "predict" }, "Prediction"],
			["explain", { question: "Q?" }, "Explain"],
			["recall", { question: "Q?" }, "Recall"],
			["probe", { question: "Q?" }, "Question"],
			["ask_user_question", { question: "Q?" }, "Question"],
		];
		for (const [tool, args, kind] of cases) {
			const item = waitingItemOf([ask("q", tool, args)], UPDATED);
			assert.equal(item?.kind, kind, tool);
			assert.equal(item?.action, "Answer", tool);
		}
	});

	it("an open practice problem: Problem, Solve, the statement", () => {
		const messages = [ask("p1", "problem", { statement: "Find the eigenvalues of [[2, 1], [1, 2]].", modelSolution: "SECRET-SOLUTION" }), result("p1", "problem")];
		const item = waitingItemOf(messages, UPDATED);
		assert.equal(item?.kind, "Problem");
		assert.equal(item?.action, "Solve");
		assert.equal(item?.teaser, "Find the eigenvalues of [[2, 1], [1, 2]].");
	});

	it("the problem wins over a pending question", () => {
		const messages = [
			ask("p1", "problem", { statement: "Evaluate the integral." }),
			result("p1", "problem"),
			ask("q1", "ask_user_question", { question: "Ready?" }),
		];
		assert.equal(waitingItemOf(messages, UPDATED)?.toolCallId, "p1");
	});

	it("an answered question waits for nothing", () => {
		assert.equal(waitingItemOf([ask("q1", "quiz", quiz), result("q1", "quiz")], UPDATED), null);
	});

	it("a dismissed problem waits for nothing", () => {
		const messages = [
			ask("p1", "problem", { statement: "Evaluate the integral." }),
			result("p1", "problem"),
			{ id: "d1", role: "custom", customType: "problem-dismissed", content: "", display: false, details: { problemCallId: "p1" }, timestamp: POSTED } as never,
		];
		assert.equal(waitingItemOf(messages, UPDATED), null);
	});

	it("a posing message without a timestamp falls back to updatedAt", () => {
		assert.equal(waitingItemOf([ask("q1", "quiz", quiz, null)], UPDATED)?.postedAt, UPDATED);
	});
});

describe("the chat summary carries only the allowlist", () => {
	it("serializes exactly five keys and no answer data", () => {
		const chat = chatStore.createChat("Gradient descent");
		chatStore.saveMessages(chat.id, [ask("q1", "quiz", quiz)]);
		const summary = chatStore.listChats().find((c) => c.id === chat.id);
		assert.ok(summary?.waiting, "a pending check projects a waiting item");
		assert.deepEqual(Object.keys(summary.waiting).sort(), ["action", "kind", "postedAt", "teaser", "toolCallId"]);
		const wire = JSON.stringify(summary);
		for (const secret of ["SECRET-CORRECT-ANSWER", "SECRET-EXPLANATION", "SECRET-OPTION-DESCRIPTION", "SECRET-DETAILS", "It diverges"]) {
			assert.ok(!wire.includes(secret), `${secret} must not reach the list`);
		}
		assert.equal(summary.pendingQuestion, true);
	});

	it("is absent when nothing waits", () => {
		const chat = chatStore.createChat("Done");
		chatStore.saveMessages(chat.id, [ask("q1", "quiz", quiz), result("q1", "quiz")]);
		const summary = chatStore.listChats().find((c) => c.id === chat.id);
		assert.equal(summary && "waiting" in summary, false);
	});
});
